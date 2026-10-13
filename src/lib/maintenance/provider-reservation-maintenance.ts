import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { hasRecoveryProviderCompletionProof } from '@/lib/operations/recovery-proof'
import { getOperationPhaseEvidence, hasOperationFinancialExposureForReview } from '@/lib/operation-safety'

const ENDED = ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'] as const
const operationSelect = {
    id: true, type: true, purpose: true, status: true, beinAccountId: true, cardNumber: true,
    providerPaymentState: true, providerMutationStartedAt: true, providerMutationStage: true,
    fulfillmentAuthority: true, fulfillmentState: true, responseData: true,
    fulfillmentProof: { select: { id: true, operationId: true, beinAccountId: true, cardNumberSnapshot: true, invoiceNo: true, proofKind: true } },
    manualFulfillmentEvidence: { select: { id: true, operationId: true, beinAccountId: true, cardNumberSnapshot: true, invoiceNo: true } },
    chargedBeinSpendLedger: { select: { id: true } },
    cardLifecycleReservation: { select: { releasedAt: true, releaseReason: true } },
    integrityIssues: { where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }, select: { id: true } },
} satisfies Prisma.OperationSelect
type TerminalOperation = Prisma.OperationGetPayload<{ select: typeof operationSelect }>

export function terminalAccountReleaseReason(op: TerminalOperation): string | null {
    if (!ENDED.some(status => status === op.status) || op.integrityIssues.length) return null
    // Account execution ownership is separate from financial settlement and card
    // admission. This repair never invents completion, refund or provider proof.
    if (op.type !== 'RENEW') return 'NON_RENEW_ENDED'
    if (op.status === 'COMPLETED') {
        return op.purpose !== 'INSTALLMENT' && op.fulfillmentState === 'VERIFIED' &&
            hasRecoveryProviderCompletionProof({ ...op, operationId: op.id, responseData: {} })
            ? 'PROVEN_RENEWAL_COMPLETED' : null
    }
    const closedCard = op.cardLifecycleReservation
    if (closedCard?.releasedAt && /^(SAFE_TERMINAL|MANUAL_REVIEW_RESOLVED):\S/.test(closedCard.releaseReason ?? '')) {
        return 'DOMAIN_FINALIZER_CLOSED'
    }
    const phase = getOperationPhaseEvidence(op.responseData)
    const beforePayment = phase && ['PACKAGE_PREPARATION', 'FINAL_CONFIRMATION', 'CANCELLATION_CONFIRM'].includes(phase.phase ?? '') &&
        !phase.finalPaySubmitted && !phase.finalPayRequestStartedAt && !phase.finalPaySubmittedAt
    return op.providerPaymentState === 'NOT_SUBMITTED' && !op.providerMutationStartedAt &&
        !op.providerMutationStage && !op.chargedBeinSpendLedger && beforePayment &&
        !hasOperationFinancialExposureForReview({ operationStatus: op.status, operationResponseData: op.responseData })
        ? 'ENDED_BEFORE_PAYMENT' : null
}

export interface ProviderReservationMaintenanceSummary {
    inspected: number
    released: number
    held: number
    errors: string[]
}

// Rotate a bounded scan so held historical rows cannot starve later accounts.
let afterId: string | undefined
export async function repairTerminalProviderReservations(options: { limit?: number; now?: Date } = {}): Promise<ProviderReservationMaintenanceSummary> {
    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(200, Math.floor(options.limit!))) : 50
    const summary: ProviderReservationMaintenanceSummary = { inspected: 0, released: 0, held: 0, errors: [] }
    const rows = await prisma.providerAccountCausalReservation.findMany({
        where: { releasedAt: null, operation: { administrativeStopRequestedAt: null, status: { in: [...ENDED] } }, ...(afterId ? { id: { gt: afterId } } : {}) },
        select: { id: true, operationId: true, beinAccountId: true, reservationGeneration: true },
        orderBy: { id: 'asc' }, take: limit,
    })
    afterId = rows.length === limit ? rows.at(-1)!.id : undefined
    for (const row of rows) {
        summary.inspected++
        try {
            const released = await prisma.$transaction(async tx => {
                // The acquisition path takes the same row lock before creating,
                // reopening or moving a reservation.
                const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "operations" WHERE "id" = ${row.operationId} FOR UPDATE`
                if (locked.length !== 1) return false
                const op = await tx.operation.findUnique({ where: { id: row.operationId }, select: operationSelect })
                if (!op || op.beinAccountId !== row.beinAccountId) return false
                const reason = terminalAccountReleaseReason(op)
                if (!reason) return false
                // A still-running request must drain or lose its lease first.
                // Never delete an active or foreign Redis owner to recover capacity.
                if (await redis.exists(`bein:account:lock:${row.beinAccountId}`, `bein:account:execution-lease:${row.beinAccountId}`)) return false
                const result = await tx.providerAccountCausalReservation.updateMany({
                    where: { id: row.id, operationId: row.operationId, beinAccountId: row.beinAccountId,
                        reservationGeneration: row.reservationGeneration, releasedAt: null },
                    data: { releasedAt: options.now ?? new Date(), releaseReason: `SAFE_TERMINAL:MAINTENANCE_${reason}` },
                })
                return result.count === 1
            })
            if (released) summary.released++
            else summary.held++
        } catch { summary.errors.push(row.operationId) }
    }
    return summary
}
