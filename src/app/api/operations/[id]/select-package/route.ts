import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-utils'
import { assertRenewalReadiness, renewalReadinessErrorPayload } from '@/lib/renewal-readiness'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { lockFinancialOperation } from '../../../../../../shared/operations/financial-lock'
import { selectQuotedPackage, quoteErrorPayload } from '../../../../../../shared/operations/package-quote'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { planRenewalPackageSelection } from '@/lib/operations/lock-timeouts'
import { releaseAccountLockSafely } from '@/lib/operations/account-lock-release'
import redis from '@/lib/redis'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import {
    ensureGuardedRenewalOperationReservation,
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'

// Validation schema
const selectPackageSchema = z.object({
    packageIndex: z.number().int().min(0),
    quoteRevision: z.number().int().min(0).max(2147483647),
    packageKey: z.string().optional(),
    promoCode: z.string().optional(),
})

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    return getAuthenticatedUser(request)
}

/**
 * POST /api/operations/[id]/select-package
 * 
 * Select package and complete purchase
 * - Verifies operation is in AWAITING_PACKAGE state
 * - Deducts balance from user
 * - Sends job to Worker to complete purchase
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 1. Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Rate limit check
        const { allowed, result: rateLimitResult } = await withRateLimit(
            `financial:${authUser.id}`,
            RATE_LIMITS.financial
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                { status: 429, headers: rateLimitHeaders(rateLimitResult) }
            )
        }

        const { id } = await params

        // 2. Parse and validate input
        const body = await request.json()
        const validationResult = selectPackageSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        // 3. Get operation with transaction lock
        const result = await prisma.$transaction(async (tx) => {
            if (!await lockFinancialOperation(tx, id)) throw new Error('OPERATION_NOT_FOUND')
            // Get operation
            const operation = await tx.operation.findUnique({
                where: { id },
                select: {
                    id: true,
                    userId: true,
                    cardNumber: true,
                    status: true,
                    stbNumber: true,
                    availablePackages: true,
                    promoCode: true,
                    finalConfirmExpiry: true,
                    responseData: true,
                    beinAccountId: true,
                },
            })

            if (!operation) {
                throw new Error('OPERATION_NOT_FOUND')
            }

            // Check ownership
            if (operation.userId !== authUser.id) {
                throw new Error('FORBIDDEN')
            }

            // Check status
            if (operation.status !== 'AWAITING_PACKAGE') {
                throw new Error('INVALID_STATUS')
            }

            await ensureGuardedRenewalOperationReservation(tx, {
                operationId: operation.id,
                cardNumber: operation.cardNumber,
            })

            const { selectedPackage, promoCode } = selectQuotedPackage(operation, validationResult.data)
            await assertRenewalReadiness(tx, { operationId: id, beinAccountId: operation.beinAccountId,
                minBalance: Number(selectedPackage.price), lockAssignedAccount: true })

            // Get user balance
            const user = await tx.user.findUnique({
                where: { id: authUser.id },
                select: { id: true, balance: true },
            })

            if (!user) {
                throw new Error('USER_NOT_FOUND')
            }

            // Check balance (don't deduct yet — deduction at CONFIRM_PURCHASE)
            const selectionPlan = planRenewalPackageSelection({
                operation,
                selectedPackage,
                userBalance: user.balance,
                promoCode: promoCode ?? undefined,
            })

            if (selectionPlan.kind === 'expired') {
                await tx.operation.updateMany({
                    where: { id: operation.id, status: 'AWAITING_PACKAGE' },
                    data: selectionPlan.operationUpdate,
                })

                return {
                    expired: true as const,
                    releaseAccountId: operation.beinAccountId,
                    releaseExpectedOwner: operation.id,
                }
            }

            if (selectionPlan.kind === 'insufficient_balance') {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            if (selectionPlan.kind !== 'select') {
                throw new Error('INVALID_STATUS')
            }

            // Update operation (amount=0 until confirm-purchase deducts)
            const transition = await tx.operation.updateMany({
                where: {
                    id: operation.id,
                    status: 'AWAITING_PACKAGE',
                    OR: [
                        { finalConfirmExpiry: null },
                        { finalConfirmExpiry: { gt: new Date() } },
                    ],
                },
                data: selectionPlan.operationUpdate,
            })

            if (transition.count === 0) {
                throw new Error('STATUS_RACE_OR_EXPIRED')
            }

            await createOperationDispatch(tx, {
                operationId: operation.id,
                type: 'COMPLETE_PURCHASE',
                cardNumber: operation.cardNumber,
                promoCode: promoCode ?? undefined,
                userId: authUser.id,
                amount: 0,
            })

            // No transaction record yet — created at confirm-purchase

            return {
                expired: false as const,
                operation: {
                    cardNumber: operation.cardNumber,
                },
                selectedPackage,
                newBalance: user.balance,
            }
        })

        if (result.expired) {
            await releaseAccountLockSafely(redis, result.releaseAccountId, result.releaseExpectedOwner)
            return NextResponse.json(
                { error: 'Package selection timed out. Please start again.' },
                { status: 400 }
            )
        }

        console.info('[Renewal] Package preparation claimed:', JSON.stringify({
            operationId: id, waitingDeadlinesCleared: true,
        }))

        // 4. Dispatch the durable outbox row; failure remains retryable.
        const dispatchResult = await dispatchPendingOperationJobs({ operationIds: [id] })
        if (dispatchResult.failed > 0) {
            console.error('Failed to dispatch complete-purchase job; saved for retry:', id)
        }

        // 5. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            selectedPackage: result.selectedPackage.name,
            amount: result.selectedPackage.price,
            newBalance: result.newBalance,
            message: 'Completing purchase...',
            queued: dispatchResult.failed === 0,
        })

    } catch (error) {
        const readinessError = renewalReadinessErrorPayload(error)
        if (readinessError) return NextResponse.json(readinessError, { status: 503 })
        const quoteError = quoteErrorPayload(error)
        if (quoteError) return NextResponse.json(quoteError, { status: 409 })
        if (isRenewalCreationBlockedError(error)) {
            return NextResponse.json(
                renewalCreationBlockedPayload(error),
                { status: 409 }
            )
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Select package error:', errorMessage)

        const errorMap: Record<string, { message: string; status: number }> = {
            'OPERATION_NOT_FOUND': { message: 'Operation not found', status: 404 },
            'FORBIDDEN': { message: 'Unauthorized access to this operation', status: 403 },
            'INVALID_STATUS': { message: 'Operation is not in package selection stage', status: 400 },
            'NO_PACKAGES': { message: 'No packages available', status: 400 },
            'PACKAGE_NOT_FOUND': { message: 'Selected package not found', status: 400 },
            'USER_NOT_FOUND': { message: 'User not found', status: 404 },
            'INSUFFICIENT_BALANCE': { message: 'Insufficient balance', status: 400 },
            'SELECTION_EXPIRED': { message: 'Package selection timed out. Please start again.', status: 400 },
            'STATUS_RACE_OR_EXPIRED': { message: 'Operation state changed. Please refresh and retry.', status: 409 },
        }

        const errorInfo = errorMap[errorMessage]
        if (errorInfo) {
            return NextResponse.json(
                { error: errorInfo.message },
                { status: errorInfo.status }
            )
        }

        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
