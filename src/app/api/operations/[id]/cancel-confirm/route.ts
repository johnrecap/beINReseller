import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { mergeOperationPhaseEvidence } from '@/lib/operation-safety'
import { lockFinancialOperation } from '../../../../../../shared/operations/financial-lock'
import { finalProviderMutationMayHaveStarted } from '../../../../../../shared/operations/renewal-pre-payment'
import { quoteData } from '../../../../../../shared/operations/package-quote'
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
 * - Leaves financial closure to the existing worker finalizer
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
                administrativeStopRequestedAt: true,
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

        if (operation.administrativeStopRequestedAt) return NextResponse.json({ error: 'ADMIN_OPERATION_STOPPED',
            code: 'ADMIN_OPERATION_STOPPED', messageKey: 'operations.administrativelyArchived' }, { status: 409 })

        const updated = await prisma.$transaction(async tx => {
            if (!await lockFinancialOperation(tx, id)) return 'CONFLICT'
            const current = await tx.operation.findUnique({ where: { id }, include: {
                dispatches: { where: { jobType: { in: ['CONFIRM_PURCHASE', 'CONFIRM_INSTALLMENT'] } } },
                chargedBeinSpendLedger: true, fulfillmentProof: true, manualFulfillmentEvidence: true,
            } })
            if (!current || current.userId !== authUser.id || current.administrativeStopRequestedAt) return 'CONFLICT'
            const phase = quoteData(current.responseData)
            if (current.status === 'CANCELLED') return 'COMPLETED'
            if (current.status === 'COMPLETING' && (phase.operationPhase ?? phase.phase) === 'CANCELLATION_CONFIRM') return 'PENDING'
            if (current.status !== 'AWAITING_FINAL_CONFIRM' || finalProviderMutationMayHaveStarted(current) ||
                current.chargedBeinSpendLedger || current.fulfillmentProof || current.manualFulfillmentEvidence ||
                current.dispatches.some(row => !['PENDING', 'CANCELLED'].includes(row.status) || row.attempts > 0)) return 'CONFLICT'
            await ensureGuardedRenewalOperationReservation(tx, { operationId: id, cardNumber: current.cardNumber })
            await tx.operation.update({ where: { id }, data: {
                status: 'COMPLETING', responseMessage: 'Cancelling operation...',
                finalConfirmExpiry: null, heartbeatExpiry: null,
                responseData: mergeOperationPhaseEvidence(current.responseData, {
                    phase: 'CANCELLATION_CONFIRM', jobType: 'CANCEL_CONFIRM', finalPaySubmitted: false,
                    cancelRequestedAt: new Date().toISOString(),
                }),
            } })
            await tx.operationDispatch.updateMany({ where: { operationId: id, status: 'PENDING', attempts: 0,
                jobType: { in: ['CONFIRM_PURCHASE', 'CONFIRM_INSTALLMENT'] } },
                data: { status: 'CANCELLED', lastError: 'CANCEL_CONFIRM' } })
            await createOperationDispatch(tx, { operationId: id, type: 'CANCEL_CONFIRM',
                cardNumber: current.cardNumber, userId: authUser.id, amount: current.amount })
            return 'PENDING'
        })
        if (updated === 'CONFLICT') return NextResponse.json({ error: 'Operation is not in final confirmation stage' }, { status: 409 })
        console.info('[RenewalCancellation]', JSON.stringify({ operationId: id, stage: updated }))
        if (updated === 'COMPLETED') return NextResponse.json({ success: true, operationId: id, cancellationStatus: updated })

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
            cancellationStatus: updated,
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
