export const STORE_PAYMENT_INTENT_CLAIM_TTL_MS = 2 * 60 * 1000

export const STORE_PAYMENT_INTENT_IN_PROGRESS_CODE = 'PAYMENT_INTENT_CREATION_IN_PROGRESS'
export const STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE = 'PAYMENT_INTENT_REVIEW_REQUIRED'
export const STORE_PAYMENT_SELECTION_LOCKED_CODE = 'PAYMENT_SELECTION_LOCKED'
export const STORE_CREDIT_DEBIT_REASON_CODE = 'STORE_SUBSCRIPTION_PACKAGE_SELECTION'

export interface StorePaymentPackageSelection {
    index: number
    name: string
    price: number
}

interface PersistedStorePaymentSelection {
    status: string
    packageName: string | null
    packagePrice: number | null
    price: number
    creditUsed: number
    stripePaymentIntentId: string | null
    paymentId: string | null
    paymentStatus: string | null
    updatedAt: Date
    selectedPackage: unknown
}

export type ExistingStorePaymentClaimDecision =
    | 'CLAIM_NEW'
    | 'IN_PROGRESS'
    | 'REUSE_INTENT'
    | 'ALREADY_ADVANCED'
    | 'SELECTION_CONFLICT'
    | 'REVIEW_REQUIRED'
    | 'INVALID_STATUS'

interface StoreCreditDebitLedgerSnapshot {
    amountMinor: number
    balanceBeforeMinor: number
    balanceAfterMinor: number
    currency: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isStoreCreditDebitLedgerConsistent(input: {
    creditUsedMinor: number
    currency: string
    entries: StoreCreditDebitLedgerSnapshot[]
}): boolean {
    if (input.creditUsedMinor === 0) {
        return input.entries.length === 0
    }
    if (input.creditUsedMinor < 0 || input.entries.length !== 1) {
        return false
    }

    const entry = input.entries[0]
    return (
        entry.amountMinor === input.creditUsedMinor &&
        entry.currency === input.currency &&
        entry.balanceBeforeMinor - entry.balanceAfterMinor === entry.amountMinor &&
        entry.balanceAfterMinor >= 0
    )
}

export function buildStorePaymentIntentIdempotencyKey(input: {
    operationId: string
    subscriptionId: string
    packageIndex: number
}): string {
    return `store-renewal:${input.operationId}:${input.subscriptionId}:package:${input.packageIndex}`
}

export function matchesPersistedStorePaymentSelection(input: {
    persisted: PersistedStorePaymentSelection
    selectedPackage: StorePaymentPackageSelection
    customerPrice: number
}): boolean {
    const persistedPackage = isRecord(input.persisted.selectedPackage)
        ? input.persisted.selectedPackage
        : null

    return (
        persistedPackage?.index === input.selectedPackage.index &&
        persistedPackage?.name === input.selectedPackage.name &&
        persistedPackage?.price === input.selectedPackage.price &&
        input.persisted.packageName === input.selectedPackage.name &&
        input.persisted.packagePrice === input.selectedPackage.price &&
        input.persisted.price === input.customerPrice &&
        input.persisted.creditUsed >= 0 &&
        input.persisted.creditUsed <= input.customerPrice
    )
}

export function decideExistingStorePaymentClaim(input: {
    persisted: PersistedStorePaymentSelection
    selectedPackage: StorePaymentPackageSelection
    customerPrice: number
    now: Date
}): ExistingStorePaymentClaimDecision {
    if (input.persisted.status === 'AWAITING_PACKAGE') {
        return (
            input.persisted.stripePaymentIntentId ||
            input.persisted.paymentId ||
            input.persisted.creditUsed > 0
        )
            ? 'REVIEW_REQUIRED'
            : 'CLAIM_NEW'
    }

    const matches = matchesPersistedStorePaymentSelection(input)
    if (!matches) {
        return input.persisted.status === 'AWAITING_PAYMENT'
            ? 'SELECTION_CONFLICT'
            : 'INVALID_STATUS'
    }

    if (input.persisted.status === 'AWAITING_PAYMENT') {
        if (input.persisted.stripePaymentIntentId && input.persisted.paymentId) {
            return ['PENDING', 'PROCESSING', 'FAILED', 'SUCCEEDED'].includes(
                input.persisted.paymentStatus || ''
            )
                ? 'REUSE_INTENT'
                : 'REVIEW_REQUIRED'
        }
        if (input.persisted.stripePaymentIntentId || input.persisted.paymentId) {
            return 'REVIEW_REQUIRED'
        }

        const claimAgeMs = input.now.getTime() - input.persisted.updatedAt.getTime()
        return claimAgeMs >= 0 && claimAgeMs <= STORE_PAYMENT_INTENT_CLAIM_TTL_MS
            ? 'IN_PROGRESS'
            : 'REVIEW_REQUIRED'
    }

    if (['PAID', 'PROCESSING', 'COMPLETING', 'COMPLETED'].includes(input.persisted.status)) {
        const fullyCoveredByCredit = (
            input.persisted.creditUsed === input.persisted.price &&
            !input.persisted.stripePaymentIntentId &&
            !input.persisted.paymentId
        )
        const linkedProviderPayment = (
            !!input.persisted.stripePaymentIntentId &&
            !!input.persisted.paymentId &&
            input.persisted.paymentStatus === 'SUCCEEDED'
        )
        return fullyCoveredByCredit || linkedProviderPayment
            ? 'ALREADY_ADVANCED'
            : 'REVIEW_REQUIRED'
    }

    return 'INVALID_STATUS'
}
