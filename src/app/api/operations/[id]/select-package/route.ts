import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { addOperationJob, operationsQueue } from '@/lib/queue'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { planRenewalPackageSelection } from '@/lib/operations/lock-timeouts'
import { releaseAccountLockSafely } from '@/lib/operations/account-lock-release'
import redis from '@/lib/redis'

// Validation schema
const selectPackageSchema = z.object({
    packageIndex: z.number().int().min(0),
    promoCode: z.string().optional(),
})

interface AvailablePackage {
    index: number
    name: string
    price: number
    checkboxSelector: string
}

function isDuplicateJobError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    return message.includes('already exists') || message.includes('jobid')
}

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
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

        const { packageIndex, promoCode } = validationResult.data

        // 3. Get operation with transaction lock
        const result = await prisma.$transaction(async (tx) => {
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

            // Parse and validate package selection
            const packages = operation.availablePackages as AvailablePackage[] | null
            if (!packages || !Array.isArray(packages)) {
                throw new Error('NO_PACKAGES')
            }

            const selectedPackage = packages.find(p => p.index === packageIndex)
            if (!selectedPackage) {
                throw new Error('PACKAGE_NOT_FOUND')
            }

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
                promoCode,
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

        // 4. Add job to queue to complete purchase
        const completeJobId = `COMPLETE_PURCHASE--${id}`
        const existingJob = await operationsQueue.getJob(completeJobId).catch(() => null)
        try {
            if (!existingJob) {
                await addOperationJob({
                    operationId: id,
                    type: 'COMPLETE_PURCHASE',
                    cardNumber: result.operation.cardNumber,
                    promoCode,
                    userId: authUser.id,
                    amount: 0,  // No money deducted yet — deduction at confirm-purchase
                })
            }
        } catch (queueError) {
            if (!isDuplicateJobError(queueError)) {
                console.error('Failed to add complete job to queue:', queueError)

                await prisma.operation.updateMany({
                    where: { id, status: 'COMPLETING', amount: 0 },
                    data: {
                        status: 'AWAITING_PACKAGE',
                        responseMessage: 'Queue unavailable. Please retry package selection.'
                    }
                })

                return NextResponse.json(
                    { error: 'Could not start purchase right now. Please try again.' },
                    { status: 503 }
                )
            }
        }

        // 5. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            selectedPackage: result.selectedPackage.name,
            amount: result.selectedPackage.price,
            newBalance: result.newBalance,
            message: 'Completing purchase...',
        })

    } catch (error) {
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
