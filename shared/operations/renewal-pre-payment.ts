import type { Prisma } from '@prisma/client'
import { quoteData } from './package-quote'

export const FINAL_CONFIRMATION_JOBS = ['CONFIRM_PURCHASE', 'CONFIRM_INSTALLMENT'] as const
export const LOCAL_PRE_PAYMENT_ISSUES = ['PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED', 'FULFILLMENT_PROOF_CONFLICT'] as const
export const RENEWAL_BLOCKING_ISSUES = [...LOCAL_PRE_PAYMENT_ISSUES,
    'DUPLICATE_RENEWAL_CHARGE_BURST', 'STRIPE_RENEWAL_REFUND_CONFLICT'] as const
const PRE_PAYMENT_PHASES = ['PACKAGE_PREPARATION', 'PROVIDER_SALE_PREPARATION_STARTED',
    'CANCELLATION_CONFIRM', 'FINAL_CONFIRMATION', 'FINAL_CONFIRMATION_REQUESTED',
    'CUSTOMER_DEDUCTED', 'DISPATCH_PENDING', 'DISPATCH_FAILED', 'RECOVERY_TIMEOUT']

export interface PrePaymentContext {
    status: string; responseData?: unknown; renewalFlowVersion?: number | null
    providerMutationStartedAt?: Date | null; providerMutationStage?: string | null
    providerPaymentState?: string | null; fulfillmentState?: string | null; fulfillmentAuthority?: string | null
    chargedBeinSpendLedger?: unknown; fulfillmentProof?: unknown; manualFulfillmentEvidence?: unknown
    dispatches?: Array<{ jobType: string; status: string; attempts: number }>
}

export function finalProviderMutationMayHaveStarted(input: PrePaymentContext): boolean {
    const data = quoteData(input.responseData)
    const phase = data.operationPhase ?? data.phase
    if (input.providerMutationStartedAt || input.providerMutationStage ||
        (input.providerPaymentState && input.providerPaymentState !== 'NOT_SUBMITTED')) return true
    if ([data.finalProviderMutationStartedAt, data.finalPayRequestStartedAt, data.finalPaySubmittedAt]
        .some(value => value !== null && value !== undefined && value !== '') || data.finalPaySubmitted === true) return true
    if (data.providerMutationMayHaveStarted === true && !(input.renewalFlowVersion === 2 &&
        ['PROVIDER_SALE_PREPARATION_STARTED', 'FINAL_CONFIRMATION_REQUESTED'].includes(String(phase)))) return true
    if (['FINAL_PROVIDER_MUTATION_STARTED', 'FINAL_PAY_REQUEST_STARTED', 'FINAL_PAY_SUBMITTED',
        'POST_FINAL_PAY_REVIEW'].includes(String(phase))) return true
    return input.status === 'COMPLETING' && !PRE_PAYMENT_PHASES.includes(String(phase))
}

// Positive evidence is mandatory when clearing an old safety issue. Missing
// markers alone (especially in a legacy row) are not proof that no sale occurred.
export function hasProvenUnsubmittedPayment(input: PrePaymentContext): boolean {
    const data = quoteData(input.responseData)
    return input.providerPaymentState === 'NOT_SUBMITTED' && data.finalPaySubmitted === false &&
        PRE_PAYMENT_PHASES.includes(String(data.operationPhase ?? data.phase)) &&
        !finalProviderMutationMayHaveStarted(input) && input.fulfillmentState === 'UNVERIFIED' &&
        input.fulfillmentAuthority === 'NONE' && !input.chargedBeinSpendLedger &&
        !input.fulfillmentProof && !input.manualFulfillmentEvidence &&
        !(input.dispatches || []).some(row => FINAL_CONFIRMATION_JOBS.some(job => job === row.jobType) &&
            (!['PENDING', 'CANCELLED'].includes(row.status) || row.attempts !== 0))
}

export async function closePrePaymentHolds(tx: Prisma.TransactionClient,
    operation: PrePaymentContext & { id: string; userId: string | null; customerId: string | null; purpose?: string | null },
    options: { at: Date; reason: string; actorId?: string }) {
    const { at, reason, actorId } = options
    let resolved = 0
    if (operation.userId && !operation.customerId && operation.purpose !== 'INSTALLMENT' &&
        hasProvenUnsubmittedPayment(operation)) {
        const result = await tx.operationIntegrityIssue.updateMany({
            where: { operationId: operation.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] },
                issueType: { in: [...LOCAL_PRE_PAYMENT_ISSUES] } },
            data: { status: 'RESOLVED', reviewedAt: at, reviewNote: `PROVEN_PRE_PAYMENT_CLOSURE:${reason}`,
                ...(actorId ? { reviewedById: actorId } : {}) },
        })
        resolved = result.count
    }
    // A cross-operation duplicate or Stripe conflict is not disproved by this
    // operation's pre-payment evidence. Keep its protections and show the cause.
    const remaining = await tx.operationIntegrityIssue.count({ where: { operationId: operation.id,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] }, issueType: { in: [...RENEWAL_BLOCKING_ISSUES] } } })
    await tx.operationDispatch.updateMany({ where: { operationId: operation.id,
        jobType: { in: [...FINAL_CONFIRMATION_JOBS] }, status: 'PENDING', attempts: 0 },
        data: { status: 'CANCELLED', lastError: reason } })
    let cardReleased = 0
    let accountReleased = 0
    if (remaining === 0) {
        const card = await tx.cardLifecycleReservation.updateMany({ where: { operationId: operation.id, releasedAt: null },
            data: { releasedAt: at, releaseReason: reason } })
        const account = await tx.providerAccountCausalReservation.updateMany({ where: { operationId: operation.id, releasedAt: null },
            data: { releasedAt: at, releaseReason: reason } })
        cardReleased = card.count
        accountReleased = account.count
    }
    console.info('[RenewalHold] Closure:', JSON.stringify({ operationId: operation.id,
        stage: 'PRE_PAYMENT', decision: remaining ? 'BLOCKING_ISSUE_RETAINED' : 'CLOSURE_PREPARED',
        resolved, remaining, cardReleased, accountReleased }))
    return { resolved, remaining, cardReleased, accountReleased }
}
