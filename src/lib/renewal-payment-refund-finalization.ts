import type { OperationStatus, PaymentStatus, Prisma } from '@prisma/client'
import {
    acquireCardLifecycleReservation,
    releaseCardLifecycleReservation,
    resolveCardLifecycleReservationDisposition,
} from '@/lib/operations/card-lifecycle-reservation'
import { lockRenewalCardLifecycle } from '@/lib/operations/renewal-creation-guard'
import {
    buildMobileRenewalMetadata,
    isExactMobileRenewalProviderPayment,
    isObject,
    mobileRenewalMetadataMatches,
    parseMobileRenewalMetadata,
    sameMobileRenewalMinorAmount,
} from '@/lib/mobile-renewal-payment-contract'
import { isStoreCreditDebitLedgerConsistent } from '@/lib/store-subscription-payment-claim'
import { CURRENCY_CONFIG, toStripeAmount } from '@/lib/store-pricing'

export const STRIPE_RENEWAL_REFUND_REVIEW_CODE = 'STRIPE_RENEWAL_REFUND_REVIEW_REQUIRED'
export const STRIPE_RENEWAL_REFUNDED_CODE = 'STRIPE_RENEWAL_REFUNDED_BEFORE_PROVIDER'
export const STRIPE_STORE_CREDIT_REFUND_REASON_CODE = 'STRIPE_RENEWAL_FULL_REFUND'

const MAX_MONEY_MINOR = 2_147_483_647
const PROVIDER_REVIEW_HOLD_MS = 10 * 60_000
const TERMINAL_OPERATION_STATUSES = new Set<OperationStatus>([
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
])
const REFUNDABLE_PAYMENT_STATUSES = new Set<PaymentStatus>([
    'PENDING',
    'PROCESSING',
    'FAILED',
    'SUCCEEDED',
])

export interface RenewalProviderRefund {
    charge: {
        id: string
        paymentIntentId: string
        amount: number
        amountRefunded: number
        currency: string
        refunded: boolean
    }
    paymentIntent: {
        id: string
        status: string
        amount: number
        amountReceived: number
        currency: string
        metadata: Record<string, string>
    }
    observedAt?: Date
}

export type RenewalPaymentRefundFinalizationResult = {
    result: 'REFUNDED' | 'ALREADY_REFUNDED' | 'REVIEW_REQUIRED'
    operationId: string
    source: 'store_renewal' | 'mobile_renewal'
}

export function decideRenewalRefundSafety(input: {
    exactProviderAndLocalLink: boolean
    fullProviderRefund: boolean
    reservationOwned: boolean
    operationStatus: string
    subscriptionStatus?: string | null
    source: 'store_renewal' | 'mobile_renewal'
    paymentStatus: string
    providerMutationStarted: boolean
    providerPaymentState: string | null
    fulfillmentState: string | null
    fulfillmentAuthority: string | null
    fulfillmentProofExists: boolean
    chargedProviderLedgerExists: boolean
    dispatchState: 'MISSING' | 'PENDING_UNCLAIMED' | 'CLAIMED_OR_SENT' | 'STOPPED'
    refundLedgerExists: boolean
}): 'SAFE_REFUND' | 'REPLAY' | 'REVIEW_REQUIRED' {
    const sourceStateSafe = input.source === 'store_renewal'
        ? (
            (input.operationStatus === 'AWAITING_PACKAGE' &&
                input.subscriptionStatus === 'AWAITING_PAYMENT') ||
            (input.operationStatus === 'COMPLETING' &&
                input.subscriptionStatus === 'PAID')
        )
        : ['AWAITING_FINAL_CONFIRM', 'COMPLETING'].includes(input.operationStatus)
    const dispatchSafe = input.dispatchState === 'MISSING' ||
        input.dispatchState === 'PENDING_UNCLAIMED'
    const providerSafe = !input.providerMutationStarted &&
        input.providerPaymentState === 'NOT_SUBMITTED' &&
        input.fulfillmentState === 'UNVERIFIED' &&
        input.fulfillmentAuthority === 'NONE' &&
        !input.fulfillmentProofExists &&
        !input.chargedProviderLedgerExists

    if (
        input.exactProviderAndLocalLink &&
        input.fullProviderRefund &&
        input.paymentStatus === 'REFUNDED' &&
        input.operationStatus === 'CANCELLED' &&
        (input.source === 'mobile_renewal' || input.subscriptionStatus === 'REFUNDED') &&
        (input.dispatchState === 'MISSING' || input.dispatchState === 'STOPPED')
    ) {
        return 'REPLAY'
    }

    if (
        input.exactProviderAndLocalLink &&
        input.fullProviderRefund &&
        input.reservationOwned &&
        sourceStateSafe &&
        providerSafe &&
        dispatchSafe &&
        REFUNDABLE_PAYMENT_STATUSES.has(input.paymentStatus as PaymentStatus) &&
        !input.refundLedgerExists
    ) {
        return 'SAFE_REFUND'
    }

    return 'REVIEW_REQUIRED'
}

function countryForCurrency(currency: string): 'SA' | 'EG' | null {
    if (currency === CURRENCY_CONFIG.SA.code) return 'SA'
    if (currency === CURRENCY_CONFIG.EG.code) return 'EG'
    return null
}

function parseStoreSelectedPackage(value: Prisma.JsonValue | null): {
    index: number | null
    name: string
    price: number
} | null {
    if (
        !isObject(value) ||
        typeof value.name !== 'string' ||
        typeof value.price !== 'number' ||
        !value.name.trim() ||
        !Number.isFinite(value.price) ||
        value.price <= 0
    ) {
        return null
    }
    const index = typeof value.index === 'number' && Number.isInteger(value.index)
        ? value.index
        : null
    return { index, name: value.name, price: value.price }
}

function dispatchState(dispatch: {
    status: string
    attempts: number
    dispatchedAt: Date | null
} | null): 'MISSING' | 'PENDING_UNCLAIMED' | 'CLAIMED_OR_SENT' | 'STOPPED' {
    if (!dispatch) return 'MISSING'
    if (dispatch.status === 'PENDING' && dispatch.attempts === 0 && !dispatch.dispatchedAt) {
        return 'PENDING_UNCLAIMED'
    }
    if (['CANCELLED', 'REVIEW_REQUIRED'].includes(dispatch.status)) return 'STOPPED'
    return 'CLAIMED_OR_SENT'
}

function refundLedgerMatches(input: {
    entries: Array<{
        amountMinor: number
        balanceBeforeMinor: number
        balanceAfterMinor: number
        currency: string
        reasonCode: string
    }>
    amountMinor: number
    currency: string
}): boolean {
    if (input.amountMinor === 0) return input.entries.length === 0
    if (input.entries.length !== 1) return false
    const entry = input.entries[0]
    return entry.amountMinor === input.amountMinor &&
        entry.currency === input.currency &&
        entry.reasonCode === STRIPE_STORE_CREDIT_REFUND_REASON_CODE &&
        entry.balanceAfterMinor - entry.balanceBeforeMinor === entry.amountMinor
}

type ProviderReservationReviewHold =
    | 'HELD'
    | 'HELD_BY_CONFLICT_OPERATION'
    | 'NOT_APPLICABLE'

async function lockProviderReservationKeys(
    tx: Prisma.TransactionClient,
    operationId: string,
    accountIds: string[]
): Promise<void> {
    const keys = [
        `provider-reservation:operation:${operationId}`,
        ...[...new Set(accountIds.filter(Boolean))]
            .sort()
            .map((accountId) => `provider-reservation:account:${accountId}`),
    ]
    for (const key of keys) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`
    }
}

async function holdProviderAccountReservationForReview(
    tx: Prisma.TransactionClient,
    input: {
        operationId: string
        beinAccountId: string | null
        now: Date
    }
): Promise<ProviderReservationReviewHold> {
    const hint = await tx.providerAccountCausalReservation.findUnique({
        where: { operationId: input.operationId },
        select: { beinAccountId: true },
    })
    const targetAccountId = input.beinAccountId || hint?.beinAccountId || null
    if (!targetAccountId) return 'NOT_APPLICABLE'

    await lockProviderReservationKeys(tx, input.operationId, [
        targetAccountId,
        hint?.beinAccountId || '',
    ])

    const existing = await tx.providerAccountCausalReservation.findUnique({
        where: { operationId: input.operationId },
    })
    if (existing?.releasedAt === null) {
        await tx.providerAccountCausalReservation.update({
            where: { operationId: input.operationId },
            data: {
                renewedAt: input.now,
                automaticWindowEndsAt: new Date(Math.max(
                    existing.automaticWindowEndsAt.getTime(),
                    input.now.getTime() + PROVIDER_REVIEW_HOLD_MS
                )),
            },
        })
        return 'HELD'
    }

    const conflict = await tx.providerAccountCausalReservation.findFirst({
        where: {
            beinAccountId: targetAccountId,
            releasedAt: null,
            operationId: { not: input.operationId },
        },
        select: { operationId: true },
    })
    if (conflict) return 'HELD_BY_CONFLICT_OPERATION'

    const automaticWindowEndsAt = new Date(input.now.getTime() + PROVIDER_REVIEW_HOLD_MS)
    if (existing) {
        await tx.providerAccountCausalReservation.update({
            where: { operationId: input.operationId },
            data: {
                beinAccountId: targetAccountId,
                reservationGeneration: { increment: 1 },
                acquiredAt: input.now,
                renewedAt: input.now,
                automaticWindowEndsAt,
                releasedAt: null,
                releaseReason: null,
            },
        })
    } else {
        await tx.providerAccountCausalReservation.create({
            data: {
                operationId: input.operationId,
                beinAccountId: targetAccountId,
                reservationGeneration: 1,
                acquiredAt: input.now,
                renewedAt: input.now,
                automaticWindowEndsAt,
            },
        })
    }
    return 'HELD'
}

async function releaseProviderAccountReservationAfterSafeRefund(
    tx: Prisma.TransactionClient,
    input: { operationId: string; now: Date }
): Promise<void> {
    const existing = await tx.providerAccountCausalReservation.findUnique({
        where: { operationId: input.operationId },
        select: { beinAccountId: true, releasedAt: true },
    })
    if (!existing || existing.releasedAt) return

    await lockProviderReservationKeys(tx, input.operationId, [existing.beinAccountId])
    await tx.providerAccountCausalReservation.updateMany({
        where: { operationId: input.operationId, releasedAt: null },
        data: {
            releasedAt: input.now,
            releaseReason: `SAFE_TERMINAL:${STRIPE_RENEWAL_REFUNDED_CODE}`,
        },
    })
}

async function markRefundReviewRequired(
    tx: Prisma.TransactionClient,
    input: {
        operation: {
            id: string
            userId: string | null
            status: OperationStatus
            amount: number
        }
        subscriptionId: string | null
        paymentId: string
        providerRefundExact: boolean
        fullRefund: boolean
        refundedAmount: number
        paymentStatus: PaymentStatus
        chargeId: string
        paymentIntentId: string
        providerReservationHold: ProviderReservationReviewHold
    }
): Promise<void> {
    await tx.operationDispatch.updateMany({
        where: {
            operationId: input.operation.id,
            jobType: { in: ['COMPLETE_PURCHASE', 'CONFIRM_PURCHASE'] },
            status: 'PENDING',
        },
        data: {
            status: 'REVIEW_REQUIRED',
            lastError: STRIPE_RENEWAL_REFUND_REVIEW_CODE,
        },
    })

    if (TERMINAL_OPERATION_STATUSES.has(input.operation.status)) {
        await tx.operation.updateMany({
            where: { id: input.operation.id, status: input.operation.status },
            data: { responseMessage: STRIPE_RENEWAL_REFUND_REVIEW_CODE },
        })
    } else {
        await tx.operation.updateMany({
            where: { id: input.operation.id, status: input.operation.status },
            data: {
                status: 'REVIEW_REQUIRED',
                responseMessage: STRIPE_RENEWAL_REFUND_REVIEW_CODE,
            },
        })
    }

    if (input.subscriptionId) {
        await tx.storeSubscription.updateMany({
            where: { id: input.subscriptionId },
            data: { resultMessage: STRIPE_RENEWAL_REFUND_REVIEW_CODE },
        })
    }

    if (input.providerRefundExact) {
        await tx.payment.updateMany({
            where: {
                id: input.paymentId,
                status: input.paymentStatus,
            },
            data: {
                status: input.fullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
                refundedAmount: input.refundedAmount,
                refundedAt: new Date(),
            },
        })
    }

    const details = {
        reasonCode: STRIPE_RENEWAL_REFUND_REVIEW_CODE,
        chargeId: input.chargeId,
        paymentIntentId: input.paymentIntentId,
        fullRefund: input.fullRefund,
        refundedAmount: input.refundedAmount,
        providerReservationHold: input.providerReservationHold,
    }
    await tx.operationIntegrityIssue.upsert({
        where: {
            operationId_issueType: {
                operationId: input.operation.id,
                issueType: 'STRIPE_RENEWAL_REFUND_CONFLICT',
            },
        },
        create: {
            operationId: input.operation.id,
            userId: input.operation.userId,
            issueType: 'STRIPE_RENEWAL_REFUND_CONFLICT',
            severity: 'HIGH',
            status: 'OPEN',
            operationAmount: input.operation.amount,
            details,
        },
        update: {
            severity: 'HIGH',
            status: 'OPEN',
            lastSeenAt: new Date(),
            details,
        },
    })
}

export async function finalizeRenewalPaymentRefund(
    tx: Prisma.TransactionClient,
    input: RenewalProviderRefund
): Promise<RenewalPaymentRefundFinalizationResult> {
    const paymentHint = await tx.payment.findUnique({
        where: { stripePaymentIntentId: input.charge.paymentIntentId },
        select: {
            id: true,
            customerId: true,
            status: true,
            metadata: true,
            subscription: { select: { id: true, operationId: true } },
        },
    })
    if (!paymentHint) throw new Error('RENEWAL_REFUND_PAYMENT_NOT_FOUND')

    const localMetadata = parseMobileRenewalMetadata(paymentHint.metadata)
    const providerMetadata = input.paymentIntent.metadata
    // The durable local relation is authoritative for choosing the renewal
    // subtype. Provider/local source mismatches are handled as review evidence,
    // not allowed to redirect the refund to another operation shape.
    const source: 'store_renewal' | 'mobile_renewal' = paymentHint.subscription
        ? 'store_renewal'
        : 'mobile_renewal'
    const operationId = source === 'store_renewal'
        ? paymentHint.subscription?.operationId
        : localMetadata?.operationId || providerMetadata.operationId
    if (!operationId) throw new Error('RENEWAL_REFUND_OPERATION_NOT_FOUND')

    const operationHint = await tx.operation.findUnique({
        where: { id: operationId },
        select: { id: true, cardNumber: true, status: true },
    })
    if (!operationHint) throw new Error('RENEWAL_REFUND_OPERATION_NOT_FOUND')

    // This is the same outer lock used by renewal creation. It closes the
    // terminal-refund race where a new renewal could be created before the
    // review issue/card hold became durable.
    await lockRenewalCardLifecycle(tx, operationHint.cardNumber)
    const reservation = await acquireCardLifecycleReservation(tx, {
        operationId: operationHint.id,
        cardNumber: operationHint.cardNumber,
    })
    const reservationOwned =
        reservation.status === 'ACQUIRED' ||
        reservation.status === 'ALREADY_HELD'

    await tx.$queryRaw`SELECT id FROM "operations" WHERE id = ${operationId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${paymentHint.id} FOR UPDATE`
    if (paymentHint.subscription) {
        await tx.$queryRaw`SELECT id FROM "store_subscriptions" WHERE id = ${paymentHint.subscription.id} FOR UPDATE`
    }
    await tx.$queryRaw`SELECT id FROM "customers" WHERE id = ${paymentHint.customerId} FOR UPDATE`

    const [operation, payment, customer, subscription, dispatches] = await Promise.all([
        tx.operation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                userId: true,
                customerId: true,
                beinAccountId: true,
                type: true,
                cardNumber: true,
                amount: true,
                status: true,
                selectedPackage: true,
                providerMutationStartedAt: true,
                providerPaymentState: true,
                fulfillmentState: true,
                fulfillmentAuthority: true,
                fulfillmentProof: { select: { id: true } },
                chargedBeinSpendLedger: { select: { id: true } },
            },
        }),
        tx.payment.findUnique({
            where: { id: paymentHint.id },
            select: {
                id: true,
                customerId: true,
                stripePaymentIntentId: true,
                amount: true,
                currency: true,
                status: true,
                type: true,
                metadata: true,
                order: { select: { id: true } },
                subscription: { select: { id: true } },
            },
        }),
        tx.customer.findUnique({
            where: { id: paymentHint.customerId },
            select: { id: true, storeCredit: true },
        }),
        paymentHint.subscription
            ? tx.storeSubscription.findUnique({
                where: { id: paymentHint.subscription.id },
                include: {
                    creditLedgerEntries: {
                        select: {
                            entryType: true,
                            amountMinor: true,
                            balanceBeforeMinor: true,
                            balanceAfterMinor: true,
                            currency: true,
                            reasonCode: true,
                        },
                    },
                },
            })
            : Promise.resolve(null),
        tx.operationDispatch.findMany({
            where: {
                operationId,
                jobType: { in: ['COMPLETE_PURCHASE', 'CONFIRM_PURCHASE'] },
            },
            select: { jobType: true, status: true, attempts: true, dispatchedAt: true },
        }),
    ])

    if (
        !operation ||
        !payment ||
        !customer ||
        operation.type !== 'RENEW' ||
        operation.cardNumber !== operationHint.cardNumber ||
        !operation.customerId ||
        operation.customerId !== payment.customerId ||
        payment.customerId !== customer.id ||
        payment.type !== 'SUBSCRIPTION' ||
        payment.order !== null ||
        payment.stripePaymentIntentId !== input.charge.paymentIntentId
    ) {
        throw new Error('RENEWAL_REFUND_LOCAL_LINK_MISMATCH')
    }

    const selectedPackage = parseStoreSelectedPackage(operation.selectedPackage)
    const paymentLocalMetadata = isObject(payment.metadata) ? payment.metadata : null
    let expectedMinor = -1
    let currencyCode = ''
    let storeCreditMinor = 0
    let exactProviderAndLocalLink = false

    if (
        source === 'store_renewal' &&
        subscription &&
        selectedPackage &&
        selectedPackage.index !== null
    ) {
        const country = countryForCurrency(subscription.currency)
        if (country) {
            currencyCode = CURRENCY_CONFIG[country].code
            expectedMinor = toStripeAmount(subscription.price - subscription.creditUsed, country)
            storeCreditMinor = toStripeAmount(subscription.creditUsed, country)
            const debitEntries = subscription.creditLedgerEntries
                .filter((entry) => entry.entryType === 'DEBIT')
            exactProviderAndLocalLink =
                subscription.customerId === customer.id &&
                subscription.operationId === operation.id &&
                subscription.paymentId === payment.id &&
                subscription.stripePaymentIntentId === payment.stripePaymentIntentId &&
                subscription.cardNumber === operation.cardNumber &&
                subscription.packageName === selectedPackage.name &&
                subscription.packagePrice === selectedPackage.price &&
                Number.isSafeInteger(expectedMinor) &&
                expectedMinor > 0 &&
                expectedMinor <= MAX_MONEY_MINOR &&
                payment.currency === currencyCode &&
                toStripeAmount(payment.amount, country) === expectedMinor &&
                paymentLocalMetadata?.source === 'store_renewal' &&
                paymentLocalMetadata.operationId === operation.id &&
                paymentLocalMetadata.subscriptionId === subscription.id &&
                paymentLocalMetadata.packageName === selectedPackage.name &&
                sameMobileRenewalMinorAmount(
                    paymentLocalMetadata.creditUsed as string | number,
                    subscription.creditUsed
                ) &&
                input.paymentIntent.id === payment.stripePaymentIntentId &&
                input.paymentIntent.status === 'succeeded' &&
                input.paymentIntent.amount === expectedMinor &&
                input.paymentIntent.amountReceived === expectedMinor &&
                input.paymentIntent.currency === CURRENCY_CONFIG[country].stripeCode &&
                providerMetadata.source === 'store_renewal' &&
                providerMetadata.operationId === operation.id &&
                providerMetadata.subscriptionId === subscription.id &&
                providerMetadata.customerId === customer.id &&
                providerMetadata.packageIndex === selectedPackage.index.toString() &&
                providerMetadata.packageName === selectedPackage.name &&
                sameMobileRenewalMinorAmount(providerMetadata.beinPrice, selectedPackage.price) &&
                sameMobileRenewalMinorAmount(providerMetadata.customerPrice, subscription.price) &&
                sameMobileRenewalMinorAmount(providerMetadata.creditUsed, subscription.creditUsed) &&
                isStoreCreditDebitLedgerConsistent({
                    creditUsedMinor: storeCreditMinor,
                    currency: currencyCode,
                    entries: debitEntries,
                })
        }
    } else if (source === 'mobile_renewal' && !subscription && selectedPackage) {
        const mobileMetadata = parseMobileRenewalMetadata(payment.metadata)
        const localBeinPrice = Number(mobileMetadata?.beinPrice)
        const localCustomerPrice = Number(mobileMetadata?.customerPrice)
        currencyCode = payment.currency
        const country = countryForCurrency(currencyCode)
        expectedMinor = country ? toStripeAmount(payment.amount, country) : -1
        const expectedMetadata = buildMobileRenewalMetadata({
            operationId: operation.id,
            customerId: customer.id,
            packageName: mobileMetadata?.packageName || '',
            beinPrice: localBeinPrice,
            customerPrice: localCustomerPrice,
        })
        exactProviderAndLocalLink =
            payment.subscription === null &&
            mobileMetadata?.source === 'mobile_renewal' &&
            mobileMetadata.operationId === operation.id &&
            mobileMetadata.customerId === customer.id &&
            Number.isFinite(localBeinPrice) &&
            localBeinPrice > 0 &&
            sameMobileRenewalMinorAmount(localCustomerPrice, payment.amount) &&
            selectedPackage.name === mobileMetadata.packageName &&
            sameMobileRenewalMinorAmount(selectedPackage.price, localBeinPrice) &&
            sameMobileRenewalMinorAmount(operation.amount, payment.amount) &&
            mobileRenewalMetadataMatches(payment.metadata, expectedMetadata) &&
            isExactMobileRenewalProviderPayment({
                provider: input.paymentIntent,
                operationId: operation.id,
                customerId: customer.id,
                packageName: mobileMetadata.packageName,
                beinPrice: localBeinPrice,
                customerPrice: payment.amount,
                currency: payment.currency,
                requireSucceeded: true,
            })
    }

    const chargeExact = exactProviderAndLocalLink &&
        input.charge.paymentIntentId === input.paymentIntent.id &&
        input.charge.amount === expectedMinor &&
        input.charge.amountRefunded > 0 &&
        input.charge.amountRefunded <= input.charge.amount &&
        input.charge.currency === input.paymentIntent.currency
    const fullRefund = chargeExact &&
        input.charge.refunded &&
        input.charge.amountRefunded === expectedMinor
    const refundEntries = subscription?.creditLedgerEntries
        .filter((entry) => entry.entryType === 'REFUND') || []
    const expectedJobType = source === 'store_renewal'
        ? 'COMPLETE_PURCHASE'
        : 'CONFIRM_PURCHASE'
    const expectedDispatch = dispatches.find((entry) => entry.jobType === expectedJobType) || null
    const unexpectedDispatchExists = dispatches.some((entry) => entry.jobType !== expectedJobType)
    const currentDispatchState = unexpectedDispatchExists
        ? 'CLAIMED_OR_SENT'
        : dispatchState(expectedDispatch)
    const safety = decideRenewalRefundSafety({
        exactProviderAndLocalLink: chargeExact,
        fullProviderRefund: fullRefund,
        reservationOwned,
        operationStatus: operation.status,
        subscriptionStatus: subscription?.status,
        source,
        paymentStatus: payment.status,
        providerMutationStarted: !!operation.providerMutationStartedAt,
        providerPaymentState: operation.providerPaymentState,
        fulfillmentState: operation.fulfillmentState,
        fulfillmentAuthority: operation.fulfillmentAuthority,
        fulfillmentProofExists: !!operation.fulfillmentProof,
        chargedProviderLedgerExists: !!operation.chargedBeinSpendLedger,
        dispatchState: currentDispatchState,
        refundLedgerExists: refundEntries.length > 0,
    })

    if (safety === 'REPLAY') {
        const ledgerReplayValid = source === 'mobile_renewal' || refundLedgerMatches({
            entries: refundEntries,
            amountMinor: storeCreditMinor,
            currency: currencyCode,
        })
        if (ledgerReplayValid) {
            const replayedAt = input.observedAt || new Date()
            await releaseCardLifecycleReservation(tx, {
                operationId: operation.id,
                disposition: resolveCardLifecycleReservationDisposition({
                    operationStatus: 'CANCELLED',
                    terminalResolutionSafe: true,
                    manualReviewResolutionId: null,
                }),
                now: replayedAt,
            })
            await releaseProviderAccountReservationAfterSafeRefund(tx, {
                operationId: operation.id,
                now: replayedAt,
            })
            return { result: 'ALREADY_REFUNDED', operationId: operation.id, source }
        }
    }

    if (safety !== 'SAFE_REFUND') {
        const reviewAt = input.observedAt || new Date()
        const providerReservationHold = await holdProviderAccountReservationForReview(tx, {
            operationId: operation.id,
            beinAccountId: operation.beinAccountId,
            now: reviewAt,
        })
        await markRefundReviewRequired(tx, {
            operation,
            subscriptionId: subscription?.id || null,
            paymentId: payment.id,
            providerRefundExact: chargeExact,
            fullRefund,
            refundedAmount: input.charge.amountRefunded / 100,
            paymentStatus: payment.status,
            chargeId: input.charge.id,
            paymentIntentId: input.paymentIntent.id,
            providerReservationHold,
        })
        return { result: 'REVIEW_REQUIRED', operationId: operation.id, source }
    }

    if (expectedDispatch?.status === 'PENDING') {
        const stopped = await tx.operationDispatch.updateMany({
            where: {
                operationId: operation.id,
                jobType: expectedJobType,
                status: 'PENDING',
                attempts: 0,
                dispatchedAt: null,
            },
            data: {
                status: 'CANCELLED',
                lastError: STRIPE_RENEWAL_REFUNDED_CODE,
            },
        })
        if (stopped.count !== 1) throw new Error('RENEWAL_REFUND_DISPATCH_RACE')
    }

    if (source === 'store_renewal' && subscription && storeCreditMinor > 0) {
        const balanceBeforeMinor = toStripeAmount(customer.storeCredit, countryForCurrency(currencyCode)!)
        if (
            !Number.isSafeInteger(balanceBeforeMinor) ||
            balanceBeforeMinor < 0 ||
            balanceBeforeMinor + storeCreditMinor > MAX_MONEY_MINOR
        ) {
            throw new Error('RENEWAL_REFUND_BALANCE_REVIEW_REQUIRED')
        }
        await tx.storeCreditLedgerEntry.create({
            data: {
                subscriptionId: subscription.id,
                customerId: customer.id,
                entryType: 'REFUND',
                amountMinor: storeCreditMinor,
                balanceBeforeMinor,
                balanceAfterMinor: balanceBeforeMinor + storeCreditMinor,
                currency: currencyCode,
                reasonCode: STRIPE_STORE_CREDIT_REFUND_REASON_CODE,
            },
        })
        await tx.customer.update({
            where: { id: customer.id },
            data: { storeCredit: { increment: subscription.creditUsed } },
        })
    }

    const now = input.observedAt || new Date()
    const paymentUpdate = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: [...REFUNDABLE_PAYMENT_STATUSES] } },
        data: {
            status: 'REFUNDED',
            refundedAmount: input.charge.amountRefunded / 100,
            refundedAt: now,
        },
    })
    const operationUpdate = await tx.operation.updateMany({
        where: { id: operation.id, status: operation.status },
        data: {
            status: 'CANCELLED',
            responseMessage: STRIPE_RENEWAL_REFUNDED_CODE,
        },
    })
    const subscriptionUpdate = subscription
        ? await tx.storeSubscription.updateMany({
            where: { id: subscription.id, status: subscription.status },
            data: {
                status: 'REFUNDED',
                refundedAt: now,
                resultMessage: STRIPE_RENEWAL_REFUNDED_CODE,
            },
        })
        : { count: 1 }
    if (
        paymentUpdate.count !== 1 ||
        operationUpdate.count !== 1 ||
        subscriptionUpdate.count !== 1
    ) {
        throw new Error('RENEWAL_REFUND_STATE_RACE')
    }

    await releaseCardLifecycleReservation(tx, {
        operationId: operation.id,
        disposition: resolveCardLifecycleReservationDisposition({
            operationStatus: 'CANCELLED',
            terminalResolutionSafe: true,
            manualReviewResolutionId: null,
        }),
        now,
    })
    await releaseProviderAccountReservationAfterSafeRefund(tx, {
        operationId: operation.id,
        now,
    })

    return { result: 'REFUNDED', operationId: operation.id, source }
}
