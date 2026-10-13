import { quoteData } from './package-quote'
import { hasProvenUnsubmittedPayment, RENEWAL_BLOCKING_ISSUES, type PrePaymentContext } from './renewal-pre-payment'

export type RenewalHoldReason = 'PRE_PAYMENT_REVIEW' | 'PAYMENT_UNCERTAIN' | 'PROVIDER_CHARGED' |
    'INTEGRITY_ISSUE' | 'RESERVATION_REMAINS'
export interface RenewalHoldInfo {
    blockReason: RenewalHoldReason
    stage: 'PRE_PAYMENT' | 'FINAL_PAYMENT' | 'REPORT_VERIFICATION' | 'UNKNOWN'
    lastCheckedAt: string
    issueTypes?: Array<typeof RENEWAL_BLOCKING_ISSUES[number]>
}

export function projectRenewalHold(op: PrePaymentContext & { type: string; updatedAt: Date | string;
    integrityIssues?: Array<{ issueType: string }>; cardLifecycleReservation?: { releasedAt: Date | null } | null;
    providerAccountCausalReservation?: { releasedAt: Date | null } | null }): RenewalHoldInfo | null {
    if (op.type !== 'RENEW') return null
    const issues = (op.integrityIssues || []).some(row => RENEWAL_BLOCKING_ISSUES.some(kind => kind === row.issueType))
    const reservation = op.cardLifecycleReservation?.releasedAt === null || op.providerAccountCausalReservation?.releasedAt === null
    if (op.status !== 'REVIEW_REQUIRED' && !(issues || reservation && ['FAILED', 'CANCELLED', 'EXPIRED', 'COMPLETED'].includes(op.status))) return null
    const data = quoteData(op.responseData)
    const beforePayment = hasProvenUnsubmittedPayment(op)
    const phase = String(data.operationPhase ?? data.phase ?? '')
    return {
        blockReason: issues ? 'INTEGRITY_ISSUE' : op.providerPaymentState === 'CHARGED' ? 'PROVIDER_CHARGED'
            : op.status !== 'REVIEW_REQUIRED' ? 'RESERVATION_REMAINS' : beforePayment ? 'PRE_PAYMENT_REVIEW' : 'PAYMENT_UNCERTAIN',
        stage: beforePayment ? 'PRE_PAYMENT' : ['VERIFYING', 'NOT_FOUND', 'CHECK_FAILED', 'PROOF_CONFLICT'].includes(op.fulfillmentState || '')
            ? 'REPORT_VERIFICATION' : op.providerMutationStartedAt || op.providerMutationStage || phase.startsWith('FINAL_PAY')
                || phase === 'FINAL_PROVIDER_MUTATION_STARTED' ? 'FINAL_PAYMENT' : 'UNKNOWN',
        lastCheckedAt: new Date(op.updatedAt).toISOString(),
        ...(issues ? { issueTypes: [...new Set((op.integrityIssues || []).map(row => row.issueType)
            .filter((kind): kind is typeof RENEWAL_BLOCKING_ISSUES[number] => RENEWAL_BLOCKING_ISSUES.some(value => value === kind)))] } : {}),
    }
}
