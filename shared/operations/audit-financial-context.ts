// Pure financial contract used by Phase 3 finalizers.
// Inputs must come from locked, normalized evidence; these decisions do not move money.
export interface AuditOwnerInput { userId?: string | null; customerId?: string | null }

export function resolveAuditOwner(input: AuditOwnerInput, expected?: AuditOwnerInput): {
    kind: 'RESELLER' | 'CUSTOMER'; id: string
} {
    const valid = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value === value.trim()
    if ((input.userId != null && !valid(input.userId)) || (input.customerId != null && !valid(input.customerId)) ||
        Number(valid(input.userId)) + Number(valid(input.customerId)) !== 1) throw new Error('AUDIT_OWNER_INVALID')
    const owner = valid(input.userId) ? { kind: 'RESELLER' as const, id: input.userId } : { kind: 'CUSTOMER' as const, id: input.customerId! }
    if (expected) {
        const original = resolveAuditOwner(expected)
        if (owner.kind !== original.kind || owner.id !== original.id) throw new Error('AUDIT_OWNER_CONFLICT')
    }
    return owner
}

// Exact due-item fingerprint from the loaded provider page; never a settlement receipt.
export function installmentIdentity(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    const row = value as Record<string, unknown>
    const texts = ['package', 'monthsToPay', 'contractStartDate', 'contractExpiryDate'].map(key => row[key])
    const amounts = ['installment1', 'installment2', 'invoicePrice', 'dealerPrice'].map(key => row[key])
    if (texts.some(v => typeof v !== 'string' || !v.trim()) ||
        amounts.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0) || Number(row.dealerPrice) <= 0) return null
    return JSON.stringify([...texts, ...amounts])
}

interface InstallmentContext {
    operationId: string; beinAccountId: string; cardNumber: string; installmentId: string
    correlationKey: string; mutationStartedAt: Date
}
interface InstallmentEvidence extends InstallmentContext {
    observedAt: Date; paymentState: string; settlementState: string; evidenceVersion: number
    settlementReference: string | null; rejectionReference: string | null
}
export function decideInstallmentEvidence(context: InstallmentContext, evidence: InstallmentEvidence):
    'COMPLETE' | 'REFUND_ELIGIBLE' | 'REVIEW_REQUIRED' {
    const keys = ['operationId', 'beinAccountId', 'cardNumber', 'installmentId', 'correlationKey'] as const
    if (keys.some(key => !context[key]?.trim() || context[key] !== evidence[key]) ||
        evidence.evidenceVersion !== 1 ||
        !Number.isFinite(context.mutationStartedAt.getTime()) ||
        evidence.mutationStartedAt.getTime() !== context.mutationStartedAt.getTime() ||
        !Number.isFinite(evidence.observedAt.getTime()) ||
        evidence.observedAt < context.mutationStartedAt) return 'REVIEW_REQUIRED'
    if (evidence.paymentState === 'CHARGED' && evidence.settlementState === 'SETTLED' &&
        evidence.settlementReference?.trim() && !evidence.rejectionReference?.trim()) return 'COMPLETE'
    if (evidence.paymentState === 'NOT_CHARGED' && evidence.settlementState === 'NOT_SETTLED' &&
        evidence.rejectionReference?.trim() && !evidence.settlementReference?.trim()) return 'REFUND_ELIGIBLE'
    return 'REVIEW_REQUIRED'
}

export function isRefundSettlementVeto(settlement: {
    state: string; cancellationEvidenceReference?: string | null
    reservedExternalMinor?: number; reservedStoreCreditMinor?: number; reservedWalletMinor?: number
    confirmedExternalMinor?: number; confirmedStoreCreditMinor?: number; confirmedWalletMinor?: number
} | null): boolean {
    if (!settlement) return false
    return settlement.state !== 'CANCELLED' || !settlement.cancellationEvidenceReference?.trim() ||
        [settlement.reservedExternalMinor, settlement.reservedStoreCreditMinor, settlement.reservedWalletMinor,
            settlement.confirmedExternalMinor, settlement.confirmedStoreCreditMinor, settlement.confirmedWalletMinor]
            .some(amount => amount !== 0)
}

export function remainingRefundMinor(input: { original: number; confirmed: number; reserved: number }): number {
    if (Object.values(input).some(value => !Number.isSafeInteger(value) || value < 0) ||
        input.confirmed > input.original || input.reserved > input.original - input.confirmed) {
        throw new Error('AUDIT_REFUND_AMOUNT_INVALID')
    }
    return input.original - input.confirmed - input.reserved
}

export function inspectFixedPaymentClaim(claim: {
    claimedAt: Date | null; expiresAt: Date | null; key: string | null
}, now: Date): 'LEGACY_CLAIM_REVIEW' | 'INVALID_CLAIM' | 'IN_PROGRESS' | 'RECOVERY_REQUIRED' {
    if (!claim.claimedAt || !claim.expiresAt || !claim.key?.trim()) return 'LEGACY_CLAIM_REVIEW'
    const start = claim.claimedAt.getTime(), expiry = claim.expiresAt.getTime(), current = now.getTime()
    if (![start, expiry, current].every(Number.isFinite) || expiry - start !== 120000 || current < start) return 'INVALID_CLAIM'
    return current >= expiry ? 'RECOVERY_REQUIRED' : 'IN_PROGRESS'
}

export function isAuditActionRevisionAllowed(jobType: string, revision: number): boolean {
    return Number.isSafeInteger(revision) && revision >= 0 && (revision === 0 || jobType === 'APPLY_PROMO')
}
