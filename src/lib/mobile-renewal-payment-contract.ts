import type { OperationStatus, PaymentStatus, Prisma } from '@prisma/client'
import { CURRENCY_CONFIG, toStripeAmount } from '@/lib/store-pricing'

export const PRETERMINAL_MOBILE_PAYMENT_STATUSES = new Set<PaymentStatus>([
    'PENDING',
    'PROCESSING',
    'FAILED',
])

const IDEMPOTENT_OPERATION_STATUSES = new Set<OperationStatus>([
    'COMPLETING',
    'COMPLETED',
    'REVIEW_REQUIRED',
])

export type MobileRenewalMetadata = {
    source: 'mobile_renewal'
    operationId: string
    customerId: string
    packageName: string
    beinPrice: string
    customerPrice: string
}

export type MobileRenewalProviderPayment = {
    id: string
    status: string
    amount: number
    amountReceived: number
    currency: string
    metadata: Record<string, string>
}

export type MobileRenewalPaymentTransition =
    | 'FINALIZE'
    | 'REPLAY_DISPATCH'
    | 'REPLAY_TERMINAL'
    | 'RECORD_SUCCESS_REVIEW'
    | 'IGNORE_TERMINAL_PAYMENT'
    | 'CONFLICT'

export function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function parseMobileRenewalMetadata(
    value: Prisma.JsonValue | Record<string, string> | null
): Record<string, string> | null {
    if (!isObject(value)) return null
    const parsed: Record<string, string> = {}
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'string') return null
        parsed[key] = entry
    }
    return parsed
}

function countryForCurrency(currency: string): 'SA' | 'EG' | null {
    const normalized = currency.toUpperCase()
    if (normalized === CURRENCY_CONFIG.SA.code) return 'SA'
    if (normalized === CURRENCY_CONFIG.EG.code) return 'EG'
    return null
}

export function sameMobileRenewalMinorAmount(left: string | number, right: number): boolean {
    const parsed = typeof left === 'number' ? left : Number(left)
    return Number.isFinite(parsed) && Math.round(parsed * 100) === Math.round(right * 100)
}

export function buildMobileRenewalMetadata(input: {
    operationId: string
    customerId: string
    packageName: string
    beinPrice: number
    customerPrice: number
}): MobileRenewalMetadata {
    return {
        source: 'mobile_renewal',
        operationId: input.operationId,
        customerId: input.customerId,
        packageName: input.packageName,
        beinPrice: input.beinPrice.toString(),
        customerPrice: input.customerPrice.toString(),
    }
}

export function mobileRenewalMetadataMatches(
    value: Prisma.JsonValue | Record<string, string> | null,
    expected: MobileRenewalMetadata
): boolean {
    const metadata = parseMobileRenewalMetadata(value)
    return !!metadata &&
        metadata.source === expected.source &&
        metadata.operationId === expected.operationId &&
        metadata.customerId === expected.customerId &&
        metadata.packageName === expected.packageName &&
        sameMobileRenewalMinorAmount(metadata.beinPrice, Number(expected.beinPrice)) &&
        sameMobileRenewalMinorAmount(metadata.customerPrice, Number(expected.customerPrice))
}

export function decideMobileRenewalPaymentTransition(input: {
    paymentStatus: PaymentStatus
    operationStatus: OperationStatus
}): MobileRenewalPaymentTransition {
    if (['REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'].includes(input.paymentStatus)) {
        return 'IGNORE_TERMINAL_PAYMENT'
    }

    if (
        PRETERMINAL_MOBILE_PAYMENT_STATUSES.has(input.paymentStatus) &&
        input.operationStatus === 'AWAITING_FINAL_CONFIRM'
    ) {
        return 'FINALIZE'
    }

    if (PRETERMINAL_MOBILE_PAYMENT_STATUSES.has(input.paymentStatus)) {
        return 'RECORD_SUCCESS_REVIEW'
    }

    if (input.paymentStatus === 'SUCCEEDED') {
        if (input.operationStatus === 'COMPLETING') return 'REPLAY_DISPATCH'
        if (IDEMPOTENT_OPERATION_STATUSES.has(input.operationStatus)) return 'REPLAY_TERMINAL'
        return 'RECORD_SUCCESS_REVIEW'
    }

    return 'CONFLICT'
}

export function isExactMobileRenewalProviderPayment(input: {
    provider: MobileRenewalProviderPayment
    operationId: string
    customerId: string
    packageName: string
    beinPrice: number
    customerPrice: number
    currency: string
    requireSucceeded: boolean
}): boolean {
    const country = countryForCurrency(input.currency)
    if (!country) return false

    const expectedMetadata = buildMobileRenewalMetadata(input)
    const expectedAmount = toStripeAmount(input.customerPrice, country)
    const expectedCurrency = CURRENCY_CONFIG[country].stripeCode

    return input.provider.id.length > 0 &&
        (!input.requireSucceeded || input.provider.status === 'succeeded') &&
        input.provider.amount === expectedAmount &&
        (!input.requireSucceeded || input.provider.amountReceived === expectedAmount) &&
        input.provider.currency.toLowerCase() === expectedCurrency &&
        mobileRenewalMetadataMatches(input.provider.metadata, expectedMetadata)
}
