import type { Prisma } from '@prisma/client'
import { createOperationDispatch } from '@/lib/operation-dispatch'
import { ensureGuardedRenewalOperationReservation } from '@/lib/operations/renewal-creation-guard'
import { CURRENCY_CONFIG, toStripeAmount } from '@/lib/store-pricing'
import { isStoreCreditDebitLedgerConsistent } from '@/lib/store-subscription-payment-claim'

export type StorePaymentFinalizationResult = 'FINALIZED' | 'ALREADY_FINALIZED'

export async function markStoreSubscriptionPaymentReviewRequired(
    tx: Prisma.TransactionClient,
    input: {
        subscriptionId: string
        operationId: string
        cardNumber: string
        reasonCode: string
    }
): Promise<void> {
    await ensureGuardedRenewalOperationReservation(tx, {
        operationId: input.operationId,
        cardNumber: input.cardNumber,
    })
    await tx.operation.updateMany({
        where: {
            id: input.operationId,
            status: 'AWAITING_PACKAGE',
        },
        data: {
            status: 'REVIEW_REQUIRED',
            responseMessage: input.reasonCode,
        },
    })
    await tx.storeSubscription.updateMany({
        where: {
            id: input.subscriptionId,
            status: 'AWAITING_PAYMENT',
        },
        data: { resultMessage: input.reasonCode },
    })
}

export async function finalizeStoreSubscriptionPayment(
    tx: Prisma.TransactionClient,
    input: {
        subscriptionId: string
        operationId: string
        cardNumber: string
        customerId: string
        paymentIntentId: string
    }
): Promise<StorePaymentFinalizationResult> {
    await ensureGuardedRenewalOperationReservation(tx, {
        operationId: input.operationId,
        cardNumber: input.cardNumber,
    })

    await tx.$queryRaw`SELECT id FROM "store_subscriptions" WHERE id = ${input.subscriptionId} FOR UPDATE`

    const subscription = await tx.storeSubscription.findUnique({
        where: { id: input.subscriptionId },
        include: {
            payment: {
                select: {
                    id: true,
                    customerId: true,
                    stripePaymentIntentId: true,
                    amount: true,
                    currency: true,
                    status: true,
                },
            },
            operation: {
                select: {
                    id: true,
                    cardNumber: true,
                    status: true,
                },
            },
            creditLedgerEntries: {
                where: { entryType: 'DEBIT' },
                select: {
                    amountMinor: true,
                    balanceBeforeMinor: true,
                    balanceAfterMinor: true,
                    currency: true,
                },
            },
        },
    })

    if (
        !subscription ||
        subscription.customerId !== input.customerId ||
        subscription.operationId !== input.operationId ||
        subscription.operation?.cardNumber !== input.cardNumber ||
        subscription.stripePaymentIntentId !== input.paymentIntentId ||
        !subscription.payment ||
        subscription.payment.customerId !== input.customerId ||
        subscription.payment.stripePaymentIntentId !== input.paymentIntentId
    ) {
        throw new Error('STORE_PAYMENT_LINK_MISMATCH')
    }

    const country = subscription.currency === CURRENCY_CONFIG.EG.code ? 'EG' : 'SA'
    const currency = CURRENCY_CONFIG[country].code
    const expectedProviderAmount = subscription.price - subscription.creditUsed
    if (
        subscription.currency !== currency ||
        !Number.isFinite(expectedProviderAmount) ||
        expectedProviderAmount <= 0 ||
        subscription.payment.currency !== currency ||
        toStripeAmount(subscription.payment.amount, country) !==
            toStripeAmount(expectedProviderAmount, country)
    ) {
        throw new Error('STORE_PAYMENT_AMOUNT_MISMATCH')
    }
    if (!isStoreCreditDebitLedgerConsistent({
        creditUsedMinor: toStripeAmount(subscription.creditUsed, country),
        currency,
        entries: subscription.creditLedgerEntries,
    })) {
        throw new Error('STORE_CREDIT_LEDGER_REVIEW_REQUIRED')
    }

    if (subscription.status !== 'AWAITING_PAYMENT') {
        if (
            ['PAID', 'PROCESSING', 'AWAITING_CAPTCHA', 'COMPLETING', 'COMPLETED'].includes(subscription.status) &&
            subscription.payment.status === 'SUCCEEDED'
        ) {
            return 'ALREADY_FINALIZED'
        }
        throw new Error('STORE_PAYMENT_STATE_CONFLICT')
    }

    const paymentUpdate = await tx.payment.updateMany({
        where: {
            id: subscription.payment.id,
            stripePaymentIntentId: input.paymentIntentId,
            customerId: input.customerId,
            status: { in: ['PENDING', 'PROCESSING', 'FAILED', 'SUCCEEDED'] },
        },
        data: { status: 'SUCCEEDED' },
    })
    const subscriptionUpdate = await tx.storeSubscription.updateMany({
        where: {
            id: subscription.id,
            status: 'AWAITING_PAYMENT',
            paymentId: subscription.payment.id,
            stripePaymentIntentId: input.paymentIntentId,
        },
        data: { status: 'PAID' },
    })
    const operationUpdate = await tx.operation.updateMany({
        where: {
            id: input.operationId,
            cardNumber: input.cardNumber,
            status: { in: ['AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM'] },
        },
        data: { status: 'COMPLETING' },
    })

    if (
        paymentUpdate.count !== 1 ||
        subscriptionUpdate.count !== 1 ||
        operationUpdate.count !== 1
    ) {
        throw new Error('STORE_PAYMENT_STATE_CONFLICT')
    }

    await createOperationDispatch(tx, {
        operationId: input.operationId,
        type: 'COMPLETE_PURCHASE',
        cardNumber: input.cardNumber,
        customerId: input.customerId,
        amount: subscription.packagePrice || 0,
    })

    return 'FINALIZED'
}
