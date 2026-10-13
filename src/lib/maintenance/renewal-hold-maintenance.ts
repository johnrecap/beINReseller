import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { finalizeWebPreMutationRenewalTermination } from '@/lib/operations/pre-mutation-renewal-finalization'
import { reviewCapabilitySelect } from '@/lib/financial-review/capabilities'
import { hasProvenUnsubmittedPayment, RENEWAL_BLOCKING_ISSUES } from '../../../shared/operations/renewal-pre-payment'
import { quoteData } from '../../../shared/operations/package-quote'

export interface RenewalHoldMaintenanceSummary { inspected: number; repaired: number; held: number; errors: string[] }
let afterId: string | undefined

export async function repairRenewalHolds(options: { limit?: number; now?: Date } = {}): Promise<RenewalHoldMaintenanceSummary> {
    const now = options.now ?? new Date()
    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(200, Math.floor(options.limit!))) : 50
    const summary: RenewalHoldMaintenanceSummary = { inspected: 0, repaired: 0, held: 0, errors: [] }
    const rows = await prisma.operation.findMany({ where: {
        administrativeStopRequestedAt: null,
        type: 'RENEW', userId: { not: null }, customerId: null,
        AND: [{ OR: [{ purpose: null }, { purpose: 'RENEWAL' }] }],
        ...(afterId ? { id: { gt: afterId } } : {}),
        OR: [
            { status: { in: ['FAILED', 'CANCELLED', 'EXPIRED'] }, OR: [
                { integrityIssues: { some: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, issueType: { in: [...RENEWAL_BLOCKING_ISSUES] } } } },
                { cardLifecycleReservation: { is: { releasedAt: null } } },
                { providerAccountCausalReservation: { is: { releasedAt: null } } },
            ] },
            // Only newly admitted policy-versioned reviews can close automatically.
            // Legacy reviews, including the reported historical charges, need an admin.
            { status: 'REVIEW_REQUIRED', renewalFlowVersion: 2, updatedAt: { lt: new Date(now.getTime() - 120_000) } },
        ],
    }, select: { ...reviewCapabilitySelect,
        integrityIssues: { where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }, select: { issueType: true } },
    }, orderBy: { id: 'asc' }, take: limit })
    afterId = rows.length === limit ? rows.at(-1)!.id : undefined
    for (const op of rows) {
        summary.inspected++
        try {
            const eligibleReview = op.status !== 'REVIEW_REQUIRED' ||
                (op.renewalFlowVersion === 2 && quoteData(op.responseData).prePaymentClosurePolicyVersion === 1)
            if (!eligibleReview || !hasProvenUnsubmittedPayment(op) || op.integrityIssues.some(row =>
                ['DUPLICATE_RENEWAL_CHARGE_BURST', 'STRIPE_RENEWAL_REFUND_CONFLICT'].includes(row.issueType))) {
                summary.held++
                console.info('[RenewalHold] Maintenance:', JSON.stringify({ operationId: op.id, stage: 'ASSESSMENT',
                    decision: 'HELD', reason: !eligibleReview ? 'HISTORICAL_REVIEW_REQUIRES_ADMIN' : 'EVIDENCE_NOT_RELEASABLE' }))
                continue
            }
            const result = await finalizeWebPreMutationRenewalTermination({ operationId: op.id,
                terminalStatus: 'FAILED', allowedStatuses: ['REVIEW_REQUIRED'], repairOnly: true,
                responseMessage: 'PACKAGE_SELECTION_UNVERIFIED', releaseReason: 'SAFE_TERMINAL:PRE_PAYMENT_MAINTENANCE',
                executionIdle: async accountId => !accountId || await redis.exists(
                    `bein:account:lock:${accountId}`, `bein:account:execution-lease:${accountId}`) === 0,
            })
            const repaired = (result.status === 'TERMINATED' || result.status === 'ALREADY_TERMINATED') && !result.remainingHolds
            if (repaired) summary.repaired++
            else summary.held++
            console.info('[RenewalHold] Maintenance:', JSON.stringify({ operationId: op.id,
                stage: 'PRE_PAYMENT', decision: result.status, reason: 'reason' in result ? result.reason : 'CLOSURE_COMMITTED' }))
        } catch {
            summary.errors.push(op.id)
            console.error('[RenewalHold] Maintenance:', JSON.stringify({ operationId: op.id,
                stage: 'ASSESSMENT', decision: 'CHECK_FAILED', reason: 'HOLD_REPAIR_UNAVAILABLE' }))
        }
    }
    return summary
}
