import { NextRequest, NextResponse } from 'next/server'
import { OperationStatus, Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    buildFinancialReviewItem,
    extractFinancialReviewMetadata,
    withFinancialReviewMetadata,
} from '@/lib/financial-review/evidence'
import {
    appendManualReviewDecision,
    getDefaultPaymentStatus,
    isFinancialReviewDecisionAllowed,
    normalizeManualVerificationForAction,
} from '@/lib/financial-review/manual-decisions'
import type { FinancialReviewDecisionAction, FinancialReviewPaymentStatus } from '@/lib/financial-review/types'
import { shouldAwardOperationSpendPointsAfterFinancialReview } from '@/lib/financial-review/point-awards'
import {
    captureOperationSpendAwardRunInTransaction,
    finalizeOperationSpendAwardRun,
} from '@/lib/points/operation-spend-award-runs'
import { lockOperationRow } from '../../../../../../../shared/db/ownership-evidence-lock'

const DECISION_ACTIONS: FinancialReviewDecisionAction[] = [
    'BEIN_EXECUTED_NO_REFUND',
    'REFUND_CUSTOMER',
    'KEEP_UNDER_REVIEW',
]

type RouteContext = {
    params: Promise<{ operationId: string }>
}

type AdminRefundInput = {
    operationId: string
    userId: string | null
    customerId: string | null
    amount: number
    reason: string
}

async function applyAdminRefund(tx: Prisma.TransactionClient, input: AdminRefundInput) {
    if (!input.amount || input.amount <= 0) {
        throw new Error('INVALID_REFUND_AMOUNT')
    }

    if (input.userId) {
        const existingRefund = await tx.transaction.findFirst({
            where: { operationId: input.operationId, type: 'REFUND' },
            select: { id: true },
        })
        if (existingRefund) return false

        const user = await tx.user.update({
            where: { id: input.userId },
            data: { balance: { increment: input.amount } },
            select: { id: true, balance: true },
        })

        await tx.transaction.create({
            data: {
                userId: user.id,
                operationId: input.operationId,
                type: 'REFUND',
                amount: input.amount,
                balanceAfter: user.balance,
                notes: `Financial review refund: ${input.reason}`,
            },
        })

        await tx.notification.create({
            data: {
                userId: user.id,
                title: 'Amount refunded',
                message: `Amount ${input.amount} refunded after admin review.`,
                type: 'info',
                link: '/dashboard/transactions',
            },
        })

        return true
    }

    if (input.customerId) {
        const existingRefund = await tx.walletTransaction.findFirst({
            where: { referenceId: input.operationId, referenceType: 'REFUND' },
            select: { id: true },
        })
        if (existingRefund) return false

        const customer = await tx.customer.update({
            where: { id: input.customerId },
            data: { walletBalance: { increment: input.amount } },
            select: { id: true, walletBalance: true },
        })

        await tx.walletTransaction.create({
            data: {
                customerId: customer.id,
                type: 'REFUND',
                amount: input.amount,
                balanceBefore: customer.walletBalance - input.amount,
                balanceAfter: customer.walletBalance,
                description: `Financial review refund: ${input.reason}`,
                referenceType: 'REFUND',
                referenceId: input.operationId,
            },
        })

        return true
    }

    throw new Error('NO_REFUND_TARGET')
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
            manualVerification?: {
                cardRenewed?: boolean
                actualBeinDebitAmount?: number
                paymentStatus?: FinancialReviewPaymentStatus
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
        const manualVerification = normalizeManualVerificationForAction(action, rawManualVerification)

        const result = await prisma.$transaction(async (tx) => {
            if (!await lockOperationRow(tx, operationId)) {
                throw new Error('OPERATION_NOT_REVIEWABLE')
            }
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
                    transactions: { select: { type: true, amount: true } },
                },
            })

            if (!operation || operation.status !== OperationStatus.REVIEW_REQUIRED) {
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
            const nextStatus = action === 'BEIN_EXECUTED_NO_REFUND'
                ? OperationStatus.COMPLETED
                : action === 'REFUND_CUSTOMER'
                    ? OperationStatus.FAILED
                    : OperationStatus.REVIEW_REQUIRED
            const guardedTransition = await tx.operation.updateMany({
                where: { id: operationId, status: OperationStatus.REVIEW_REQUIRED },
                data: action === 'BEIN_EXECUTED_NO_REFUND'
                    ? {
                        status: OperationStatus.COMPLETED,
                        completedAt,
                        responseMessage: 'Financial review closed: beIN charge confirmed.',
                    }
                    : action === 'REFUND_CUSTOMER'
                        ? {
                            status: OperationStatus.FAILED,
                            responseMessage: 'Financial review closed: no beIN charge confirmed and reseller refund closed.',
                        }
                        : { responseMessage: operation.responseMessage },
            })
            if (guardedTransition.count !== 1) {
                throw new Error('OPERATION_NOT_REVIEWABLE')
            }

            const refundApplied = action === 'REFUND_CUSTOMER'
                ? await applyAdminRefund(tx, {
                    operationId,
                    userId: operation.user?.id ?? null,
                    customerId: operation.customer?.id ?? null,
                    amount: operation.amount,
                    reason: note || getDefaultPaymentStatus(action) || 'Financial review refund',
                })
                : false
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
                ...(action === 'REFUND_CUSTOMER' ? { refundApplied } : {}),
            }
            const nextMetadata = appendManualReviewDecision(extractFinancialReviewMetadata(operation.responseData), decisionInput)
            const decision = nextMetadata.latestDecision

            const responseData = withFinancialReviewMetadata(operation.responseData, () => nextMetadata)

            await tx.operation.update({
                where: { id: operationId },
                data: { responseData },
            })

            if (action === 'BEIN_EXECUTED_NO_REFUND') {
                const capture = await captureOperationSpendAwardRunInTransaction(
                    tx,
                    operationId,
                    'ADMIN_FINANCIAL_REVIEW',
                    completedAt
                )
                if (capture.outcome === 'CONFLICT') {
                    throw new Error('AWARD_RUN_CONFLICT')
                }
            }

            return {
                decision,
                metadata: extractFinancialReviewMetadata(responseData),
                awardOperationSpendPoints: shouldAwardOperationSpendPointsAfterFinancialReview({
                    action,
                    nextStatus,
                }),
            }
        })

        const { awardOperationSpendPoints, ...responsePayload } = result

        if (awardOperationSpendPoints) {
            await finalizeOperationSpendAwardRun(operationId).catch((error) => {
                console.error('Financial review point finalization error:', {
                    operationId,
                    error: error instanceof Error ? error.message : String(error),
                })
            })
        }

        return NextResponse.json({ success: true, ...responsePayload })
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
