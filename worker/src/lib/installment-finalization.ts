import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { decideInstallmentEvidence, isRefundSettlementVeto, resolveAuditOwner } from '../../../shared/operations/audit-financial-context'
import { captureOperationSpendAwardRunInTransaction } from './points'
import { lockFinancialOperation } from '../../../shared/operations/financial-lock'

function savedInstallmentId(value: unknown): string | null {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value
        return parsed && typeof parsed.installmentId === 'string' ? parsed.installmentId : null
    } catch { return null }
}

type Database = Pick<PrismaClient, '$transaction'>
async function database(db?: Database): Promise<Database> { return db ?? (await import('./prisma')).prisma }

export async function claimInstallmentMutation(input: {
    operationId: string; beinAccountId: string; installmentId: string; reservationGeneration?: number
}, db?: Database) {
    return (await database(db)).$transaction(async tx => {
        if (!await lockFinancialOperation(tx, input.operationId)) return { status: 'REVIEW_REQUIRED' as const }
        const op = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId }, include: { installmentEvidence: true } })
        if (op.providerMutationStartedAt || op.installmentEvidence) return { status: 'ALREADY_CLAIMED' as const }
        if (op.purpose !== 'INSTALLMENT' || op.status !== 'COMPLETING' || op.beinAccountId !== input.beinAccountId ||
            !input.installmentId.trim() || input.installmentId !== savedInstallmentId(op.responseData)) {
            return { status: 'REVIEW_REQUIRED' as const }
        }
        const [card, account, deductions] = await Promise.all([
            tx.cardLifecycleReservation.findUnique({ where: { operationId: op.id } }),
            tx.providerAccountCausalReservation.findUnique({ where: { operationId: op.id } }),
            tx.transaction.findMany({ where: { operationId: op.id, type: 'OPERATION_DEDUCT' } }),
        ])
        if (!card || card.releasedAt || card.cardNumber !== op.cardNumber || !account || account.releasedAt ||
            account.beinAccountId !== op.beinAccountId || account.reservationGeneration !== input.reservationGeneration ||
            account.automaticWindowEndsAt <= new Date() || !op.userId || op.customerId ||
            !Number.isFinite(op.amount) || op.amount <= 0 || deductions.length !== 1 ||
            deductions[0].userId !== op.userId || deductions[0].amount !== -op.amount ||
            await tx.transaction.count({ where: { operationId: op.id, type: 'REFUND' } }) > 0) {
            return { status: 'REVIEW_REQUIRED' as const }
        }
        if ((await tx.renewalRefundSettlement.findMany({ where: { operationId: op.id } })).some(isRefundSettlementVeto)) {
            return { status: 'REVIEW_REQUIRED' as const }
        }
        const mutationStartedAt = new Date()
        const correlationKey = `${op.id}:installment:${randomUUID()}`
        await tx.operationInstallmentEvidence.create({ data: {
            operationId: op.id, beinAccountId: input.beinAccountId, installmentId: input.installmentId,
            cardNumber: op.cardNumber, correlationKey, mutationStartedAt, observedAt: mutationStartedAt,
            paymentState: 'UNKNOWN', settlementState: 'UNKNOWN', amount: op.amount, currency: 'USD', reasonCode: 'MUTATION_CLAIMED',
        } })
        await tx.operation.update({ where: { id: op.id }, data: {
            providerMutationStartedAt: mutationStartedAt, providerMutationStage: 'FINAL_OK', providerPaymentState: 'UNKNOWN',
        } })
        return { status: 'CLAIMED' as const, correlationKey, mutationStartedAt }
    })
}

export async function finalizeInstallmentSettlement(input: {
    operationId: string; expectedCorrelationKey?: string; preMutation?: boolean
}, db?: Database): Promise<{ status: 'COMPLETED' | 'FAILED_AND_REFUNDED' | 'ALREADY_FINALIZED' | 'REVIEW_REQUIRED' }> {
    return (await database(db)).$transaction(async tx => {
        if (!await lockFinancialOperation(tx, input.operationId)) return { status: 'REVIEW_REQUIRED' }
        const op = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId }, include: {
            installmentEvidence: true, chargedBeinSpendLedger: true, fulfillmentProof: true, manualFulfillmentEvidence: true,
            transactions: { where: { type: { in: ['OPERATION_DEDUCT', 'REFUND'] } } },
        } })
        const hold = async () => {
            if (!['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(op.status)) await tx.operation.update({
                where: { id: op.id }, data: { status: 'REVIEW_REQUIRED', completedAt: null, finalConfirmExpiry: null, heartbeatExpiry: null },
            })
            return { status: 'REVIEW_REQUIRED' as const }
        }
        if (op.purpose !== 'INSTALLMENT') return hold()
        const evidence = op.installmentEvidence
        const decision = evidence && op.providerMutationStartedAt && input.expectedCorrelationKey === evidence.correlationKey
            ? decideInstallmentEvidence({ operationId: op.id, beinAccountId: op.beinAccountId ?? '', cardNumber: op.cardNumber,
                installmentId: savedInstallmentId(op.responseData) ?? '', correlationKey: input.expectedCorrelationKey,
                mutationStartedAt: op.providerMutationStartedAt }, evidence) : 'REVIEW_REQUIRED'
        const preMutation = input.preMutation === true && !op.providerMutationStartedAt && !evidence
        if (!preMutation && decision === 'REVIEW_REQUIRED') return hold()
        if (evidence && (Number(evidence.amount) !== op.amount || evidence.currency !== 'USD')) return hold()
        const settlements = await tx.renewalRefundSettlement.findMany({ where: { operationId: op.id } })
        if (settlements.some(isRefundSettlementVeto) || op.fulfillmentProof || op.manualFulfillmentEvidence) return hold()
        const refunds = op.transactions.filter(t => t.type === 'REFUND')
        const deductions = op.transactions.filter(t => t.type === 'OPERATION_DEDUCT')
        let owner: ReturnType<typeof resolveAuditOwner>
        try { owner = resolveAuditOwner(op) } catch { return hold() }
        if (owner.kind !== 'RESELLER' || deductions.length !== 1 || deductions[0].userId !== owner.id ||
            !Number.isFinite(deductions[0].amount) || deductions[0].amount >= 0) return hold()
        const refundAmount = Math.round(-deductions[0].amount * 100) / 100
        if (refundAmount <= 0) return hold()
        if (decision === 'COMPLETE') {
            const ledger = op.chargedBeinSpendLedger
            if (refunds.length || !ledger || ledger.beinAccountId !== op.beinAccountId || ledger.userId !== owner.id || ledger.customerId ||
                ledger.currency !== 'USD' || ledger.spendAmount !== Number(evidence?.amount)) return hold()
            if (op.status === 'COMPLETED') return { status: 'ALREADY_FINALIZED' }
        } else {
            if (op.chargedBeinSpendLedger || op.providerPaymentState === 'CHARGED') return hold()
            if (refunds.length) return op.status === 'FAILED' && refunds.length === 1 && refunds[0].userId === owner.id &&
                refunds[0].amount === refundAmount ? { status: 'ALREADY_FINALIZED' } : hold()
        }
        if (!['COMPLETING', 'REVIEW_REQUIRED'].includes(op.status)) return hold()
        const completedAt = new Date()
        if (decision !== 'COMPLETE') {
            const user = await tx.user.update({ where: { id: owner.id }, data: { balance: { increment: refundAmount } } })
            await tx.transaction.create({ data: { userId: owner.id, operationId: op.id, type: 'REFUND', amount: refundAmount,
                balanceAfter: user.balance, notes: 'INSTALLMENT_CANONICAL_REFUND' } })
            const awards = await tx.pointLedgerEntry.findMany({ where: { operationId: op.id, sourceType: 'OPERATION_SPEND', points: { gt: 0 } } })
            await tx.pointLedgerEntry.createMany({ data: awards.map(entry => ({ ownerUserId: entry.ownerUserId,
                ownerRoleAtTime: entry.ownerRoleAtTime, operationId: op.id, sourceType: 'POINT_REVERSAL' as const,
                sourceId: `${op.id}:${entry.ownerUserId}:refund`, points: -entry.points, status: 'REDEEMED' as const })), skipDuplicates: true })
        }
        await tx.operation.update({ where: { id: op.id }, data: {
            status: decision === 'COMPLETE' ? 'COMPLETED' : 'FAILED', completedAt, finalConfirmExpiry: null, heartbeatExpiry: null,
            providerPaymentState: decision === 'COMPLETE' ? 'CHARGED' : 'NOT_CHARGED',
        } })
        if (decision === 'COMPLETE') await captureOperationSpendAwardRunInTransaction(tx, op.id, 'INSTALLMENT_SETTLEMENT', completedAt)
        await tx.cardLifecycleReservation.updateMany({ where: { operationId: op.id, releasedAt: null },
            data: { releasedAt: completedAt, releaseReason: 'SAFE_TERMINAL:INSTALLMENT_SETTLEMENT' } })
        await tx.providerAccountCausalReservation.updateMany({ where: { operationId: op.id, releasedAt: null },
            data: { releasedAt: completedAt, releaseReason: 'SAFE_TERMINAL:INSTALLMENT_SETTLEMENT' } })
        return { status: decision === 'COMPLETE' ? 'COMPLETED' : 'FAILED_AND_REFUNDED' }
    })
}
