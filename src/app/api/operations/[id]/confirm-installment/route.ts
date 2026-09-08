import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { Prisma } from '@prisma/client'
import { parseOperationResponseData } from '@/lib/operation-safety'
import { finalizeOperationSpendAwardRun } from '@/lib/points/operation-spend-award-runs'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import {
    ensureGuardedRenewalOperationReservation,
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'
import { finalizeWebPreMutationRenewalTermination } from '@/lib/operations/pre-mutation-renewal-finalization'
import { releaseAccountLockSafely } from '@/lib/operations/account-lock-release'
import { assertRenewalReadiness, renewalReadinessErrorPayload } from '@/lib/renewal-readiness'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    return getAuthenticatedUser(request)
}

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * POST /api/operations/[id]/confirm-installment
 * 
 * Confirm and execute installment payment
 * User has reviewed the installment details and confirms payment
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: operationId } = await params

        // Check authentication
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                userId: true,
                purpose: true,
                status: true,
                cardNumber: true,
                beinAccountId: true,
                amount: true,
                responseData: true, // CRITICAL: Need this to get the actual price
                finalConfirmExpiry: true,
            }
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership
        if (operation.userId !== authUser.id && authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized access to this operation' },
                { status: 403 }
            )
        }

        // Verify status is awaiting confirmation
        if (operation.status !== 'AWAITING_FINAL_CONFIRM' || operation.purpose !== 'INSTALLMENT') {
            return NextResponse.json(
                { error: 'Operation is not in awaiting confirmation state' },
                { status: 400 }
            )
        }

        // Check if confirmation has expired
        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            const renewalTermination = await finalizeWebPreMutationRenewalTermination({
                operationId,
                terminalStatus: 'FAILED',
                allowedStatuses: ['AWAITING_FINAL_CONFIRM'],
                responseMessage: 'Confirmation timeout',
                errorMessage: 'Confirmation timeout',
                releaseReason: 'INSTALLMENT_CONFIRMATION_TIMEOUT_PRE_MUTATION',
            })

            if (renewalTermination.status === 'REVIEW_REQUIRED') {
                return NextResponse.json(
                    {
                        error: 'Confirmation timeout',
                        reviewRequired: true,
                        status: 'REVIEW_REQUIRED',
                    },
                    { status: 409 }
                )
            }
            if (renewalTermination.status === 'EVIDENCE_CONFLICT') {
                return NextResponse.json(
                    { error: 'Operation state changed. Please refresh and try again.' },
                    { status: 409 }
                )
            }

            await releaseAccountLockSafely(redis, operation.beinAccountId, operation.id)
            await redis.del(`operation:heartbeat:${operation.id}`).catch(() => undefined)

            return NextResponse.json(
                { error: 'Confirmation timeout' },
                { status: 400 }
            )
        }

        // Get dealer price from responseData
        const responseData = parseOperationResponseData(operation.responseData)
        const installmentData = responseData.installment as { dealerPrice?: unknown } | undefined
        const dealerPrice = typeof installmentData?.dealerPrice === 'number' ? installmentData.dealerPrice : 0

        if (!Number.isFinite(dealerPrice) || dealerPrice <= 0) {
            return NextResponse.json(
                { error: 'Invalid installment price' },
                { status: 400 }
            )
        }

        // Charge the operation owner (admin may confirm on behalf of user)
        const chargedUserId = operation.userId
        if (!chargedUserId) {
            return NextResponse.json(
                { error: 'Operation has no chargeable user' },
                { status: 400 }
            )
        }

        // Atomic financial step: race guard + balance deduction + transaction row
        await prisma.$transaction(async (tx) => {
            await ensureGuardedRenewalOperationReservation(tx, {
                operationId,
                cardNumber: operation.cardNumber,
            })
            const currentAccount = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, select: { beinAccountId: true } })
            await assertRenewalReadiness(tx, { operationId, beinAccountId: currentAccount.beinAccountId,
                minBalance: dealerPrice, lockAssignedAccount: true })

            const opGuard = await tx.operation.updateMany({
                where: {
                    id: operationId,
                    status: 'AWAITING_FINAL_CONFIRM',
                    purpose: 'INSTALLMENT',
                    userId: chargedUserId,
                    providerMutationStartedAt: null,
                    amount: 0
                },
                data: {
                    status: 'COMPLETING',
                    amount: dealerPrice,
                    responseMessage: 'Confirming installment payment...'
                }
            })

            if (opGuard.count === 0) {
                throw new Error('OPERATION_NOT_CONFIRMABLE')
            }

            const user = await tx.user.findUnique({
                where: { id: chargedUserId },
                select: { balance: true }
            })

            if (!user || user.balance < dealerPrice) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            const updatedUser = await tx.user.update({
                where: { id: chargedUserId },
                data: { balance: { decrement: dealerPrice } }
            })

            if (updatedUser.balance < 0) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            await tx.transaction.create({
                data: {
                    userId: chargedUserId,
                    type: 'OPERATION_DEDUCT',
                    amount: -dealerPrice,
                    balanceAfter: updatedUser.balance,
                    operationId,
                    notes: `Installment payment for card ${operation.cardNumber}`
                }
            })

            await createOperationDispatch(tx, {
                operationId: operation.id,
                type: 'CONFIRM_INSTALLMENT',
                cardNumber: operation.cardNumber,
                userId: chargedUserId,
                amount: dealerPrice,
            })
        })

        const dispatchResult = await dispatchPendingOperationJobs({
            operationIds: [operation.id],
        })
        if (dispatchResult.failed > 0) {
            console.error('Failed to dispatch installment confirmation; saved for retry:', operation.id)
        }

        const completedOperation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: { status: true },
        })
        if (completedOperation?.status === 'COMPLETED') {
            await finalizeOperationSpendAwardRun(operationId).catch((error) => {
                console.error('Confirm installment point finalization error:', error)
            })
        }

        return NextResponse.json({
            success: true,
            message: 'Completing payment...',
            queued: dispatchResult.failed === 0,
        })

    } catch (error) {
        const readinessError = renewalReadinessErrorPayload(error)
        if (readinessError) return NextResponse.json(readinessError, { status: 503 })
        if (isRenewalCreationBlockedError(error)) {
            return NextResponse.json(
                renewalCreationBlockedPayload(error),
                { status: 409 }
            )
        }
        const msg = error instanceof Error ? error.message : ''
        if (msg === 'INSUFFICIENT_BALANCE') {
            return NextResponse.json(
                { error: 'Insufficient balance' },
                { status: 400 }
            )
        }
        if (msg === 'OPERATION_NOT_CONFIRMABLE') {
            return NextResponse.json(
                { error: 'Operation state changed. Please refresh and try again.' },
                { status: 409 }
            )
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json(
                { error: 'Operation is already being processed' },
                { status: 409 }
            )
        }
        console.error('Confirm installment error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
