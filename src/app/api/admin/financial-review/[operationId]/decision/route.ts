import { NextRequest, NextResponse } from 'next/server'
import { OperationStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    buildFinancialReviewItem,
    extractFinancialReviewMetadata,
    withFinancialReviewMetadata,
} from '@/lib/financial-review/evidence'
import {
    appendManualReviewDecision,
    canRecordFinancialReviewDecisionForStatus,
    isFinancialReviewDecisionAllowed,
    normalizeManualVerificationForAction,
} from '@/lib/financial-review/manual-decisions'
import type { FinancialReviewDecisionAction, FinancialReviewPaymentStatus } from '@/lib/financial-review/types'
import { finalizeOperationSpendAwardRun } from '@/lib/points/operation-spend-award-runs'
import { finalizeManualRenewalFulfillment } from '@/lib/operations/manual-fulfillment-finalization'
import { finalizeStrictFinancialReviewRefund } from '@/lib/operations/financial-review-refund-finalization'
import { lockOperationRow } from '../../../../../../../shared/db/ownership-evidence-lock'
import { validDecisionNote } from '../../../../../../../shared/operations/review-decision-note'
import { classifyFinancialReview, reviewCapabilitySelect } from '@/lib/financial-review/capabilities'
import { finalizeLegacyReview } from '@/lib/operations/legacy-review-finalization'
import { finalizeWebPreMutationRenewalTermination } from '@/lib/operations/pre-mutation-renewal-finalization'

const DECISION_ACTIONS: FinancialReviewDecisionAction[] = [
    'BEIN_EXECUTED_NO_REFUND',
    'REFUND_CUSTOMER',
    'KEEP_UNDER_REVIEW',
    'RESOLVE_PRE_MUTATION',
]

type RouteContext = {
    params: Promise<{ operationId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { operationId } = await context.params
        const body = await request.json().catch(() => ({})) as {
            action?: FinancialReviewDecisionAction
            note?: string
            decisionKey?: string
            sourceReference?: string
            manualVerification?: {
                cardRenewed?: boolean
                actualBeinDebitAmount?: number
                paymentStatus?: FinancialReviewPaymentStatus
            }
            manualFulfillmentEvidence?: {
                invoiceNo?: string
                beinAccountId?: string
                cardNumberSnapshot?: string
                packageNameSnapshot?: string
                providerAmount?: string | number
                currency?: string
                evidenceSource?: string
                evidenceNote?: string
                observedAt?: string
            }
        }
        const action = body.action
        const note = typeof body.note === 'string' ? body.note.trim() : ''
        const rawManualVerification =
            body.manualVerification && typeof body.manualVerification === 'object'
                ? {
                    ...(typeof body.manualVerification.cardRenewed === 'boolean'
                        ? { cardRenewed: body.manualVerification.cardRenewed }
                        : {}),
                    ...(body.manualVerification.paymentStatus === 'تم تأكيد الدفع' ||
                        body.manualVerification.paymentStatus === 'لم يتم تأكيد الدفع'
                        ? { paymentStatus: body.manualVerification.paymentStatus }
                        : {}),
                    ...(typeof body.manualVerification.actualBeinDebitAmount === 'number' && Number.isFinite(body.manualVerification.actualBeinDebitAmount)
                        ? { actualBeinDebitAmount: body.manualVerification.actualBeinDebitAmount }
                        : {}),
                }
                : null

        if (!action || !DECISION_ACTIONS.includes(action)) {
            return NextResponse.json({ error: 'Invalid decision action' }, { status: 400 })
        }

        if (!validDecisionNote(note, action !== 'KEEP_UNDER_REVIEW')) {
            return NextResponse.json({ error: 'INVALID_DECISION_NOTE', code: 'INVALID_DECISION_NOTE',
                messageKey: 'admin.financialReview.decisionNoteValidation' }, { status: 400 })
        }

        if (action === 'RESOLVE_PRE_MUTATION') {
            const result = await finalizeWebPreMutationRenewalTermination({ operationId, terminalStatus: 'FAILED',
                allowedStatuses: ['REVIEW_REQUIRED'], responseMessage: 'ADMIN_PRE_MUTATION_RESOLVED',
                releaseReason: 'ADMIN_PRE_MUTATION_RESOLVED', adminReview: {
                    actorId: authResult.user.id, actorUsername: authResult.user.username, note,
                } })
            const success = result.status === 'TERMINATED' || result.status === 'ALREADY_TERMINATED'
            return NextResponse.json({ success, ...result }, { status: success ? 200 : 409 })
        }

        if (action === 'REFUND_CUSTOMER') {
            const finalization = await finalizeStrictFinancialReviewRefund({
                operationId,
                decisionNote: note,
                actorUserId: authResult.user.id,
                actorUsername: authResult.user.username,
            })
            if (
                finalization.status === 'REFUNDED' ||
                finalization.status === 'ALREADY_REFUNDED'
            ) {
                return NextResponse.json({
                    success: true,
                    status: finalization.status,
                    refundId: finalization.refundId,
                })
            }
            return NextResponse.json(
                { error: finalization.status },
                {
                    status: finalization.status === 'INVALID_DECISION_NOTE' ||
                        finalization.status === 'REFUND_TARGET_MISSING'
                        ? 400
                        : 409,
                }
            )
        }
        const manualVerification = normalizeManualVerificationForAction(action, rawManualVerification)

        if (action === 'BEIN_EXECUTED_NO_REFUND') {
            const operationState = await prisma.operation.findUnique({
                where: { id: operationId },
                select: {
                    ...reviewCapabilitySelect,
                    status: true,
                    providerPaymentState: true,
                    fulfillmentAuthority: true,
                    fulfillmentProof: { select: { id: true, proofKind: true } },
                },
            })
            if (!operationState) {
                return NextResponse.json({ error: 'OPERATION_NOT_REVIEWABLE' }, { status: 409 })
            }

            const hasAutomatedCompositeProof =
                operationState.status === OperationStatus.COMPLETED &&
                operationState.fulfillmentAuthority === 'AUTOMATED_COMPOSITE' &&
                operationState.fulfillmentProof?.proofKind === 'SOLD_REPORT_CONTRACT_CORRELATION'

            if (!hasAutomatedCompositeProof) {
                const capabilities = classifyFinancialReview(operationState)
                const legacy = capabilities.classification === 'LEGACY_RENEWAL'
                const manualReplay = operationState.status === 'COMPLETED' && operationState.manualFulfillmentEvidence
                if (
                    !manualReplay && !capabilities.allowedActions.includes('BEIN_EXECUTED_NO_REFUND')
                ) {
                    return NextResponse.json(
                        { error: 'MANUAL_FULFILLMENT_PAYMENT_STATE_REQUIRED' },
                        { status: 409 }
                    )
                }
                const manualFulfillmentEvidence = body.manualFulfillmentEvidence
                if (!manualFulfillmentEvidence || typeof manualFulfillmentEvidence !== 'object') {
                    return NextResponse.json({ error: 'MANUAL_FULFILLMENT_EVIDENCE_REQUIRED' }, { status: 400 })
                }

                const input = {
                    operationId,
                    evidence: {
                        beinAccountId: typeof manualFulfillmentEvidence.beinAccountId === 'string'
                            ? manualFulfillmentEvidence.beinAccountId
                            : '',
                        invoiceNo: typeof manualFulfillmentEvidence.invoiceNo === 'string'
                            ? manualFulfillmentEvidence.invoiceNo
                            : '',
                        cardNumberSnapshot: typeof manualFulfillmentEvidence.cardNumberSnapshot === 'string'
                            ? manualFulfillmentEvidence.cardNumberSnapshot
                            : '',
                        packageNameSnapshot: typeof manualFulfillmentEvidence.packageNameSnapshot === 'string'
                            ? manualFulfillmentEvidence.packageNameSnapshot
                            : '',
                        providerAmount: typeof manualFulfillmentEvidence.providerAmount === 'string' ||
                            typeof manualFulfillmentEvidence.providerAmount === 'number'
                            ? String(manualFulfillmentEvidence.providerAmount)
                            : '',
                        currency: typeof manualFulfillmentEvidence.currency === 'string'
                            ? manualFulfillmentEvidence.currency
                            : '',
                        evidenceSource: typeof manualFulfillmentEvidence.evidenceSource === 'string'
                            ? manualFulfillmentEvidence.evidenceSource
                            : '',
                        evidenceNote: typeof manualFulfillmentEvidence.evidenceNote === 'string'
                            ? manualFulfillmentEvidence.evidenceNote
                            : '',
                        observedAt: new Date(manualFulfillmentEvidence.observedAt || ''),
                        actorUserId: authResult.user.id,
                    },
                    decisionNote: note,
                    actorUsername: authResult.user.username,
                }
                const finalization = legacy || (manualReplay && typeof body.decisionKey === 'string')
                    ? await finalizeLegacyReview({ ...input, decisionKey: body.decisionKey || '', sourceReference: body.sourceReference || '' })
                    : await finalizeManualRenewalFulfillment({ ...input,
                        providerPaymentState: operationState.providerPaymentState === 'CHARGED' ? 'CHARGED' : 'UNKNOWN' })

                if (finalization.status === 'COMPLETED' || finalization.status === 'ALREADY_COMPLETED') {
                    await finalizeOperationSpendAwardRun(operationId).catch((error) => {
                        console.error('Manual fulfillment point finalization error:', {
                            operationId,
                            error: error instanceof Error ? error.message : String(error),
                        })
                    })
                    return NextResponse.json({
                        success: true,
                        status: finalization.status,
                        fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION',
                        manualEvidenceId: finalization.manualEvidenceId ?? null,
                    })
                }

                return NextResponse.json(
                    { error: finalization.status },
                    { status: finalization.status === 'INVALID_EVIDENCE' ? 400 : 409 }
                )
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            if (!await lockOperationRow(tx, operationId)) {
                throw new Error('OPERATION_NOT_REVIEWABLE')
            }
            const actor = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "users" WHERE "id" = ${authResult.user.id}
                  AND "role" = 'ADMIN' AND "is_active" = true AND "deleted_at" IS NULL FOR SHARE
            `
            if (actor.length !== 1) throw new Error('OPERATION_NOT_REVIEWABLE')
            const operation = await tx.operation.findUnique({
                where: { id: operationId },
                select: {
                    id: true,
                    type: true,
                    cardNumber: true,
                    status: true,
                    amount: true,
                    createdAt: true,
                    updatedAt: true,
                    responseMessage: true,
                    responseData: true,
                    fulfillmentAuthority: true,
                    selectedPackage: true,
                    user: { select: { id: true, username: true } },
                    customer: { select: { id: true, name: true, email: true } },
                    beinAccount: { select: { id: true, username: true, label: true } },
                    chargedBeinSpendLedger: {
                        select: {
                            id: true,
                            beinAccountId: true,
                            dealerBalanceBefore: true,
                            dealerBalanceAfter: true,
                            spendAmount: true,
                            evidenceConfidence: true,
                            beinUsernameSnapshot: true,
                            beinLabelSnapshot: true,
                        },
                    },
                    fulfillmentProof: {
                        select: {
                            id: true,
                            operationId: true,
                            beinAccountId: true,
                            cardNumberSnapshot: true,
                            invoiceNo: true,
                            proofKind: true,
                        },
                    },
                    manualFulfillmentEvidence: {
                        select: {
                            id: true,
                            invoiceNo: true,
                            beinAccountId: true,
                            cardNumberSnapshot: true,
                            packageNameSnapshot: true,
                            providerAmount: true,
                            currency: true,
                            evidenceSource: true,
                            evidenceNote: true,
                            observedAt: true,
                            actorUserId: true,
                        },
                    },
                    transactions: { select: { type: true, amount: true } },
                },
            })

            if (!operation || !canRecordFinancialReviewDecisionForStatus({
                operationStatus: operation.status,
                action,
            })) {
                throw new Error('OPERATION_NOT_REVIEWABLE')
            }

            const reviewItem = buildFinancialReviewItem(operation, new Map())
            if (!reviewItem) {
                throw new Error('OPERATION_NOT_REVIEWABLE')
            }
            const guard = isFinancialReviewDecisionAllowed({
                action,
                evidence: reviewItem.evidence,
                manualVerification,
            })
            if (!guard.allowed) {
                throw new Error(guard.reason || 'DECISION_NOT_ALLOWED')
            }

            const completedAt = new Date()
            if (operation.status === OperationStatus.REVIEW_REQUIRED) {
                const guardedTransition = await tx.operation.updateMany({
                    where: { id: operationId, status: OperationStatus.REVIEW_REQUIRED },
                    data: { responseMessage: operation.responseMessage },
                })
                if (guardedTransition.count !== 1) {
                    throw new Error('OPERATION_NOT_REVIEWABLE')
                }
            }

            const decisionInput = {
                action,
                note,
                decidedBy: authResult.user.id,
                decidedByUsername: authResult.user.username,
                decidedAt: completedAt.toISOString(),
                source: 'admin_manual_review' as const,
                ...(typeof manualVerification?.cardRenewed === 'boolean' ? { cardRenewed: manualVerification.cardRenewed } : {}),
                ...(manualVerification?.paymentStatus ? { paymentStatus: manualVerification.paymentStatus } : {}),
                ...(typeof manualVerification?.actualBeinDebitAmount === 'number'
                    ? { actualBeinDebitAmount: manualVerification.actualBeinDebitAmount }
                    : {}),
            }
            const nextMetadata = appendManualReviewDecision(extractFinancialReviewMetadata(operation.responseData), decisionInput)
            const decision = nextMetadata.latestDecision

            const responseData = withFinancialReviewMetadata(operation.responseData, () => nextMetadata)

            await tx.operation.update({
                where: { id: operationId },
                data: { responseData },
            })

            return {
                decision,
                metadata: extractFinancialReviewMetadata(responseData),
            }
        })

        return NextResponse.json({ success: true, ...result })
    } catch (error) {
        console.error('Financial review decision error:', error)
        if (error instanceof Error) {
            if (error.message === 'OPERATION_NOT_REVIEWABLE') {
                return NextResponse.json({ error: 'Operation is not reviewable' }, { status: 409 })
            }
            if (error.message === 'INVALID_REFUND_AMOUNT' || error.message === 'NO_REFUND_TARGET') {
                return NextResponse.json({ error: error.message }, { status: 400 })
            }
            if (error.message === 'MISSING_PROVIDER_CHARGE_EVIDENCE') {
                return NextResponse.json({ error: 'Provider charge evidence is required before closing as charged' }, { status: 400 })
            }
            if (error.message === 'PROVIDER_CHARGE_EVIDENCE_CONFLICT') {
                return NextResponse.json({ error: 'Refund cannot be applied while provider charge evidence exists' }, { status: 400 })
            }
            if (error.message === 'MISSING_MANUAL_NO_CHARGE_VERIFICATION') {
                return NextResponse.json({ error: 'Manual confirmation that renewal/payment did not happen is required before refund' }, { status: 400 })
            }
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
