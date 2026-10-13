import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { roleHasPermission } from '@/lib/auth-utils'
import { PERMISSIONS } from '@/lib/permissions'
import redis from '@/lib/redis'
import { computeEffectiveMaintenanceStatus } from '@/lib/maintenance/effective-status'
import { assertRenewalReadiness, renewalReadinessErrorPayload } from '@/lib/renewal-readiness'
import { readRenewalCardCooldown } from '@/lib/operations/renewal-card-cooldown'
import {
    createGuardedRenewalOperation,
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    return getAuthenticatedUser(request)
}

// Validation schema
const cardNumberSchema = z.string().regex(/^\d{10,16}$/, 'Card number must contain 10 to 16 digits')
const startRenewalSchema = z.object({
    cardNumber: cardNumberSchema,
    smartcardType: z.enum(['CISCO', 'IRDETO']).default('CISCO').optional(),
}).refine(value => (value.smartcardType || 'CISCO') !== 'CISCO' || value.cardNumber.length === 10,
    { path: ['cardNumber'], message: 'CISCO card number must contain 10 digits' })

const ACTIVE_OPERATION_STATUSES = ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'COMPLETING', 'AWAITING_FINAL_CONFIRM'] as const
// Same authenticated renewal surface; this lookup never creates an operation.
export async function GET(request: NextRequest) {
    try {
        const user = await getAuthUser(request)
        if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!roleHasPermission(user.role, PERMISSIONS.SUBSCRIPTION_RENEW)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const limited = await withRateLimit(`renewal-cooldown:${user.id}`, RATE_LIMITS.operations)
        if (!limited.allowed) return NextResponse.json({ error: 'RATE_LIMIT_EXCEEDED' },
            { status: 429, headers: rateLimitHeaders(limited.result) })
        const card = cardNumberSchema.safeParse(new URL(request.url).searchParams.get('cardNumber'))
        if (!card.success) return NextResponse.json({ error: 'INVALID_CARD_NUMBER' }, { status: 400 })
        return NextResponse.json(await readRenewalCardCooldown(prisma, card.data), { headers: { 'Cache-Control': 'no-store' } })
    } catch {
        return NextResponse.json({ error: 'CARD_COOLDOWN_UNAVAILABLE' }, { status: 503 })
    }
}

const CARD_START_LOCK_TTL_SECONDS = 30
const UNRESOLVED_REVIEW_STATUS = 'REVIEW_REQUIRED' as const
const FULFILLMENT_SAFETY_ISSUE_TYPES = [
    'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
    'FULFILLMENT_PROOF_CONFLICT',
    'DUPLICATE_RENEWAL_CHARGE_BURST',
] as const

async function findFulfillmentSafetyConflict(cardNumber: string) {
    return prisma.operationIntegrityIssue.findFirst({
        where: {
            issueType: { in: [...FULFILLMENT_SAFETY_ISSUE_TYPES] },
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
            operation: { cardNumber },
        },
        orderBy: { lastSeenAt: 'desc' },
        select: { id: true, operationId: true, issueType: true },
    })
}

/**
 * POST /api/operations/start-renewal
 *
 * Start interactive renewal operation (Wizard)
 * - Creates Operation with PENDING status
 * - Sends job to Worker to start session and extract packages
 * - Returns operationId for tracking
 */
export async function POST(request: NextRequest) {
    try {
        // 1. Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // 2. Check permission - only users with SUBSCRIPTION_RENEW can access
        if (!roleHasPermission(authUser.role, PERMISSIONS.SUBSCRIPTION_RENEW)) {
            return NextResponse.json(
                { error: 'Insufficient permissions' },
                { status: 403 }
            )
        }

        // 2.5 Check maintenance mode - block non-admin users
        if (authUser.role !== 'ADMIN') {
            const [maintenanceSetting, msgSetting, pauseUntilSetting] = await Promise.all([
                prisma.setting.findUnique({ where: { key: 'maintenance_mode' } }),
                prisma.setting.findUnique({ where: { key: 'maintenance_message' } }),
                prisma.setting.findUnique({ where: { key: 'maintenance_pause_until' } }),
            ])
            const effectiveMaintenance = computeEffectiveMaintenanceStatus({
                maintenanceMode: maintenanceSetting?.value,
                maintenanceMessage: msgSetting?.value,
                maintenancePauseUntil: pauseUntilSetting?.value,
            })

            if (effectiveMaintenance.blocksUsers) {
                return NextResponse.json(
                    { error: effectiveMaintenance.message },
                    { status: 503 }
                )
            }
        }

        // 3. Check rate limit
        const { allowed, result: rateLimitResult } = await withRateLimit(
            `operations:${authUser.id}`,
            RATE_LIMITS.operations
        )

        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded, please wait' },
                { status: 429, headers: rateLimitHeaders(rateLimitResult) }
            )
        }

        // 4. Parse and validate input
        const body = await request.json()
        const validationResult = startRenewalSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid card number', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { cardNumber, smartcardType } = validationResult.data
        await assertRenewalReadiness(prisma)

        // 5. Card-level lock: prevents concurrent start requests for the same card
        const cardLockKey = `operation:start-renewal:card-lock:${cardNumber}`
        const lockResult = await redis.set(cardLockKey, authUser.id, 'EX', CARD_START_LOCK_TTL_SECONDS, 'NX')

        if (lockResult !== 'OK') {
            const activeOperation = await prisma.operation.findFirst({
                where: {
                    cardNumber,
                    status: { in: [...ACTIVE_OPERATION_STATUSES] },
                },
                orderBy: { createdAt: 'desc' },
            })

            if (activeOperation) {
                return NextResponse.json(
                    { error: 'There is an active operation for this card', operationId: activeOperation.id },
                    { status: 409 }
                )
            }

            const reviewOperation = await prisma.operation.findFirst({
                where: {
                    cardNumber,
                    status: UNRESOLVED_REVIEW_STATUS,
                },
                orderBy: { updatedAt: 'desc' },
                select: { id: true },
            })

            if (reviewOperation) {
                return NextResponse.json(
                    {
                        code: 'RENEWAL_FULFILLMENT_REVIEW_PENDING',
                        blockReason: 'UNRESOLVED_REVIEW',
                        error: 'This card has an unresolved review operation. Resolve it before starting a new renewal.',
                        operationId: reviewOperation.id,
                    },
                    { status: 409 }
                )
            }

            const fulfillmentConflict = await findFulfillmentSafetyConflict(cardNumber)
            if (fulfillmentConflict) {
                return NextResponse.json(
                    {
                        code: 'RENEWAL_FULFILLMENT_REVIEW_PENDING',
                        blockReason: 'FULFILLMENT_INTEGRITY_ISSUE',
                        error: 'This card has an unresolved renewal fulfillment safety issue.',
                        operationId: fulfillmentConflict.operationId,
                    },
                    { status: 409 }
                )
            }

            return NextResponse.json(
                { error: 'Another request for this card is already in progress. Please try again in a few seconds.' },
                { status: 409 }
            )
        }

        try {
            // Check 1: Active operations (in-progress statuses)
            const existingOperation = await prisma.operation.findFirst({
                where: {
                    cardNumber,
                    status: { in: [...ACTIVE_OPERATION_STATUSES] },
                },
            })

            if (existingOperation) {
                return NextResponse.json(
                    { error: 'There is an active operation for this card', operationId: existingOperation.id },
                    { status: 400 }
                )
            }

            const reviewOperation = await prisma.operation.findFirst({
                where: {
                    cardNumber,
                    status: UNRESOLVED_REVIEW_STATUS,
                },
                orderBy: { updatedAt: 'desc' },
                select: { id: true },
            })

            if (reviewOperation) {
                return NextResponse.json(
                    {
                        code: 'RENEWAL_FULFILLMENT_REVIEW_PENDING',
                        blockReason: 'UNRESOLVED_REVIEW',
                        error: 'This card has an unresolved review operation. Resolve it before starting a new renewal.',
                        operationId: reviewOperation.id,
                    },
                    { status: 409 }
                )
            }

            const fulfillmentConflict = await findFulfillmentSafetyConflict(cardNumber)
            if (fulfillmentConflict) {
                return NextResponse.json(
                    {
                        code: 'RENEWAL_FULFILLMENT_REVIEW_PENDING',
                        blockReason: 'FULFILLMENT_INTEGRITY_ISSUE',
                        error: 'This card has an unresolved renewal fulfillment safety issue.',
                        operationId: fulfillmentConflict.operationId,
                    },
                    { status: 409 }
                )
            }

            const operation = await prisma.$transaction(async (tx) => {
                const createdOperation = await createGuardedRenewalOperation(tx, {
                    cardNumber,
                    data: {
                        userId: authUser.id,
                        amount: 0, // Will be determined after package selection
                        purpose: 'RENEWAL',
                        status: 'PENDING',
                        providerPaymentState: 'NOT_SUBMITTED',
                        fulfillmentState: 'UNVERIFIED',
                        renewalFlowVersion: 2,
                    },
                })

                await tx.activityLog.create({
                    data: {
                        userId: authUser.id,
                        action: 'RENEWAL_STARTED',
                        details: `Start renewal for card ${cardNumber}`,
                        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    },
                })

                await tx.userAction.create({
                    data: {
                        userId: authUser.id,
                        actionType: 'RENEWAL_STARTED',
                        details: { cardNumber: cardNumber, operationId: createdOperation.id },
                    }
                })

                await createOperationDispatch(tx, {
                    operationId: createdOperation.id,
                    type: 'START_RENEWAL',
                    cardNumber,
                    userId: authUser.id,
                    smartcardType: smartcardType || 'CISCO',
                })

                return createdOperation
            })

            const dispatchResult = await dispatchPendingOperationJobs({
                operationIds: [operation.id],
            })
            if (dispatchResult.failed > 0) {
                console.error('Failed to dispatch start-renewal job; saved for retry:', operation.id)
            }

            // 9. Return success with full operation object for Flutter
            return NextResponse.json({
                success: true,
                operationId: operation.id,
                message: 'Starting renewal operation...',
                operation: {
                    id: operation.id,
                    userId: operation.userId,
                    type: operation.type,
                    cardNumber: operation.cardNumber,
                    amount: operation.amount,
                    status: operation.status,
                    createdAt: operation.createdAt.toISOString(),
                },
                queued: dispatchResult.failed === 0,
            })
        } finally {
            await redis.del(cardLockKey).catch((lockError) => {
                console.error('Failed to release start-renewal card lock:', lockError)
            })
        }

    } catch (error) {
        const readinessError = renewalReadinessErrorPayload(error)
        if (readinessError) return NextResponse.json(readinessError, { status: 503 })
        console.error('Start renewal error:', error)
        if (isRenewalCreationBlockedError(error)) {
            return NextResponse.json(
                renewalCreationBlockedPayload(error),
                { status: 409 }
            )
        }
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
