import { OperationStatus, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { closePrePaymentHolds, finalProviderMutationMayHaveStarted } from '../../../shared/operations/renewal-pre-payment'

export type PreMutationRenewalTerminationResult =
    | { status: 'TERMINATED'; refundId: string | null }
    | { status: 'ALREADY_TERMINATED'; refundId: string | null }
    | { status: 'REVIEW_REQUIRED'; reason: string }
    | { status: 'EVIDENCE_CONFLICT'; reason: string }

function canonicalDeduction(
    deductions: Array<{ userId: string; amount: number }>,
    userId: string
): number | null {
    if (
        deductions.length !== 1 ||
        deductions[0].userId !== userId ||
        !Number.isFinite(deductions[0].amount) ||
        deductions[0].amount >= 0
    ) return null
    const amount = Math.round(Math.abs(deductions[0].amount) * 100) / 100
    return amount > 0 ? amount : null
}

export async function finalizePreMutationRenewalTermination(input: {
    operationId: string
    terminalStatus: 'FAILED' | 'CANCELLED'
    allowedStatuses: OperationStatus[]
    responseMessage: string
    releaseReason: string
    retryCount?: number
}): Promise<PreMutationRenewalTerminationResult> {
    try {
        const result = await prisma.$transaction(async (tx): Promise<PreMutationRenewalTerminationResult> => {
            const locked = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "operations" WHERE "id" = ${input.operationId} FOR UPDATE
            `
            if (locked.length !== 1) {
                return { status: 'EVIDENCE_CONFLICT', reason: 'OPERATION_NOT_FOUND' }
            }
            await tx.$queryRaw`SELECT "id" FROM "operation_dispatches" WHERE "operation_id" = ${input.operationId} FOR UPDATE`

            const operation = await tx.operation.findUnique({
                where: { id: input.operationId },
                select: {
                    id: true,
                    type: true,
                    purpose: true,
                    status: true,
                    userId: true,
                    customerId: true,
                    amount: true,
                    responseData: true,
                    providerMutationStartedAt: true,
                    providerMutationStage: true,
                    providerPaymentState: true,
                    renewalFlowVersion: true,
                    fulfillmentState: true,
                    fulfillmentAuthority: true,
                    dispatches: { where: { jobType: { in: ['CONFIRM_PURCHASE', 'CONFIRM_INSTALLMENT'] } },
                        select: { jobType: true, status: true, attempts: true } },
                    refundSettlements: { select: { state: true } },
                    chargedBeinSpendLedger: { select: { id: true } },
                    fulfillmentProof: { select: { id: true } },
                    manualFulfillmentEvidence: { select: { id: true } },
                    transactions: {
                        where: { type: { in: ['OPERATION_DEDUCT', 'REFUND'] } },
                        select: { id: true, userId: true, type: true, amount: true },
                    },
                },
            })
            if (!operation || operation.type !== 'RENEW') {
                return { status: 'EVIDENCE_CONFLICT', reason: 'RENEWAL_OPERATION_REQUIRED' }
            }

            const existingRefund = operation.transactions.find((entry) => entry.type === 'REFUND')
            const replay = operation.status === input.terminalStatus
            if (!replay && !input.allowedStatuses.includes(operation.status)) {
                return { status: 'EVIDENCE_CONFLICT', reason: 'TERMINATION_STATUS_CHANGED' }
            }
            if (finalProviderMutationMayHaveStarted(operation) || operation.dispatches.some(row =>
                !['PENDING', 'CANCELLED'].includes(row.status) || row.attempts !== 0)) {
                await tx.operation.updateMany({
                    where: { id: operation.id, status: operation.status },
                    data: {
                        status: 'REVIEW_REQUIRED',
                        responseMessage: 'Provider mutation causality is uncertain; manual review required.',
                        completedAt: null,
                        finalConfirmExpiry: null,
                    },
                })
                return { status: 'REVIEW_REQUIRED', reason: 'PROVIDER_MUTATION_MAY_HAVE_STARTED' }
            }
            if (operation.chargedBeinSpendLedger || operation.fulfillmentProof ||
                operation.manualFulfillmentEvidence || operation.fulfillmentAuthority !== 'NONE' ||
                operation.fulfillmentState !== 'UNVERIFIED' ||
                operation.refundSettlements.some(row => row.state !== 'CANCELLED') ||
                await tx.beinAccountSpendLedger.count({ where: { operationId: operation.id } }) > 0) {
                await tx.operation.updateMany({
                    where: { id: operation.id, status: operation.status },
                    data: { status: 'REVIEW_REQUIRED',
                        responseMessage: 'Provider sale evidence needs manual review.',
                        completedAt: null, finalConfirmExpiry: null },
                })
                return { status: 'REVIEW_REQUIRED', reason: 'PROVIDER_SALE_EVIDENCE_PRESENT' }
            }

            const deductions = operation.transactions.filter((entry) => entry.type === 'OPERATION_DEDUCT')
            const refundAmount = operation.userId
                ? canonicalDeduction(deductions, operation.userId)
                : null
            const hasFinancialExposure = deductions.length > 0 || operation.amount > 0
            const existingRefundValid = Boolean(
                existingRefund &&
                operation.userId &&
                refundAmount &&
                existingRefund.userId === operation.userId &&
                Math.abs(existingRefund.amount - refundAmount) < 0.005
            )

            if (
                (operation.customerId && hasFinancialExposure) ||
                (hasFinancialExposure && (!operation.userId || !refundAmount)) ||
                (operation.amount > 0 && refundAmount !== null && Math.abs(operation.amount - refundAmount) >= 0.005) ||
                (existingRefund && !existingRefundValid)
                || operation.transactions.filter(row => row.type === 'REFUND').length > 1
                || (replay && hasFinancialExposure && !existingRefundValid)
            ) {
                await tx.operation.updateMany({
                    where: { id: operation.id, status: operation.status },
                    data: {
                        status: 'REVIEW_REQUIRED',
                        responseMessage: 'Canonical pre-mutation settlement is missing or conflicting.',
                        completedAt: null,
                        finalConfirmExpiry: null,
                    },
                })
                return { status: 'REVIEW_REQUIRED', reason: 'CANONICAL_SETTLEMENT_REQUIRED' }
            }

            let refundId = existingRefund?.id ?? null
            if (replay) {
                await closePrePaymentHolds(tx, operation, { at: new Date(), reason: input.releaseReason })
                return { status: 'ALREADY_TERMINATED', refundId }
            }
            if (refundAmount && operation.userId && !existingRefund) {
                const user = await tx.user.update({
                    where: { id: operation.userId },
                    data: { balance: { increment: refundAmount } },
                    select: { id: true, balance: true },
                })
                const refund = await tx.transaction.create({
                    data: {
                        userId: user.id,
                        operationId: operation.id,
                        type: 'REFUND',
                        amount: refundAmount,
                        balanceAfter: user.balance,
                        notes: `Atomic pre-mutation refund: ${input.responseMessage}`,
                    },
                    select: { id: true },
                })
                refundId = refund.id
                await tx.notification.create({
                    data: {
                        userId: user.id,
                        title: 'Amount refunded',
                        message: `Amount refunded: ${refundAmount}. ${input.responseMessage}`,
                        type: 'info',
                        link: '/dashboard/transactions',
                    },
                })
                const pointEntries = await tx.pointLedgerEntry.findMany({
                    where: { operationId: operation.id, sourceType: 'OPERATION_SPEND', points: { gt: 0 } },
                    select: { ownerUserId: true, ownerRoleAtTime: true, points: true },
                })
                if (pointEntries.length > 0) {
                    await tx.pointLedgerEntry.createMany({
                        data: pointEntries.map((entry) => ({
                            ownerUserId: entry.ownerUserId,
                            ownerRoleAtTime: entry.ownerRoleAtTime,
                            operationId: operation.id,
                            sourceType: 'POINT_REVERSAL' as const,
                            sourceId: `${operation.id}:${entry.ownerUserId}:pre-mutation-refund`,
                            points: -entry.points,
                            status: 'REDEEMED' as const,
                            notes: `Point reversal for operation ${operation.id} because pre-mutation refund`,
                        })),
                        skipDuplicates: true,
                    })
                }
            }

            const completedAt = new Date()
            const updated = await tx.operation.updateMany({
                where: { id: operation.id, status: operation.status },
                data: {
                    status: input.terminalStatus,
                    responseMessage: input.responseMessage,
                    completedAt,
                    finalConfirmExpiry: null,
                    heartbeatExpiry: null,
                    ...(input.retryCount === undefined ? {} : { retryCount: input.retryCount }),
                },
            })
            if (updated.count !== 1) throw new Error('PRE_MUTATION_TERMINATION_STATE_RACE')

            await closePrePaymentHolds(tx, operation, { at: completedAt, reason: input.releaseReason })

            return { status: 'TERMINATED', refundId }
        })
        console.info('[RenewalHold] Finalization:', JSON.stringify({ operationId: input.operationId,
            stage: 'PRE_PAYMENT', decision: result.status, committed: true }))
        return result
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const replay = await prisma.operation.findUnique({
                where: { id: input.operationId },
                select: {
                    status: true,
                    transactions: { where: { type: 'REFUND' }, take: 1, select: { id: true } },
                },
            })
            if (replay?.status === input.terminalStatus) {
                return { status: 'ALREADY_TERMINATED', refundId: replay.transactions[0]?.id ?? null }
            }
        }
        throw error
    }
}
