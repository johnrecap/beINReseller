import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { hasFinalPayStarted, mergeOperationPhaseEvidence } from '@/lib/operation-safety'
import type { OperationStatus } from '@prisma/client'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import {
    ensureGuardedRenewalOperationReservation,
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    return getAuthenticatedUser(request)
}

/**
 * POST /api/operations/[id]/cancel-confirm
 * 
 * Cancel final confirmation
 * - Verifies operation is in AWAITING_FINAL_CONFIRM state
 * - Sends job to Worker to press Cancel button in popup
 * - Refunds balance to user
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

        const { id } = await params

        // 2. Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                cardNumber: true,
                status: true,
                amount: true,
                selectedPackage: true,
                responseData: true,
            },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership
        if (operation.userId !== authUser.id) {
            return NextResponse.json(
                { error: 'Unauthorized access to this operation' },
                { status: 403 }
            )
        }

        // Check status - only allow cancel from AWAITING_FINAL_CONFIRM
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { error: 'Operation is not in final confirmation stage' },
                { status: 400 }
            )
        }

        if (hasFinalPayStarted({
            operationStatus: operation.status as OperationStatus,
            operationAmount: operation.amount ?? 0,
            operationResponseData: operation.responseData,
        })) {
            return NextResponse.json(
                { error: 'Final payment may have started. Manual review is required.' },
                { status: 409 }
            )
        }

        // 3. CRITICAL: Atomically change status to prevent duplicate cancel jobs
        // Uses updateMany with status filter - if two cancel calls arrive simultaneously,
        // only the first one matches AWAITING_FINAL_CONFIRM and succeeds (count=1).
        // The second call finds status=COMPLETING and gets count=0 → rejected.
        const updated = await prisma.$transaction(async (tx) => {
            await ensureGuardedRenewalOperationReservation(tx, {
                operationId: id,
                cardNumber: operation.cardNumber,
            })
            const result = await tx.operation.updateMany({
                where: { id, status: 'AWAITING_FINAL_CONFIRM' },
                data: {
                    status: 'COMPLETING',
                    responseMessage: 'Cancelling operation...',
                    responseData: mergeOperationPhaseEvidence(operation.responseData, {
                        phase: 'CANCELLATION_CONFIRM',
                        jobType: 'CANCEL_CONFIRM',
                        finalPaySubmitted: false,
                        cancelRequestedAt: new Date().toISOString(),
                    }),
                },
            })
            if (result.count === 1) {
                await createOperationDispatch(tx, {
                    operationId: id,
                    type: 'CANCEL_CONFIRM',
                    cardNumber: operation.cardNumber,
                    userId: authUser.id,
                    amount: operation.amount,
                })
            }
            return result
        })

        if (updated.count === 0) {
            // Another cancel request already changed the status
            return NextResponse.json(
                { error: 'Operation is already being cancelled' },
                { status: 409 }
            )
        }

        // 4. Deliver the durable outbox row; failure remains safe to retry.
        const dispatchResult = await dispatchPendingOperationJobs({ operationIds: [id] })
        if (dispatchResult.failed > 0) {
            console.error('Failed to dispatch cancel-confirm; saved for retry:', id)
        }

        // 5. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            message: 'Cancelling operation...',
            queued: dispatchResult.failed === 0,
        })

    } catch (error) {
        if (isRenewalCreationBlockedError(error)) {
            return NextResponse.json(
                renewalCreationBlockedPayload(error),
                { status: 409 }
            )
        }
        console.error('Cancel confirm error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
