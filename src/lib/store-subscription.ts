/**
 * Store Subscription Utilities
 * 
 * Helper functions for handling subscription status changes,
 * particularly for failed operations (refund to store credit).
 */

import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { CURRENCY_CONFIG, toStripeAmount } from '@/lib/store-pricing'
import { isStoreCreditDebitLedgerConsistent } from '@/lib/store-subscription-payment-claim'

export const STORE_SUBSCRIPTION_SETTLEMENT_REVIEW_CODE = 'STORE_SUBSCRIPTION_SETTLEMENT_REVIEW_REQUIRED'
export const STORE_STRIPE_REFUND_REQUIRED_CODE = 'STORE_STRIPE_REFUND_REQUIRED'

async function markStoreSubscriptionSettlementReview(
    tx: Prisma.TransactionClient,
    input: {
        subscriptionId: string
        operation: {
            id: string
            userId: string | null
            beinAccountId: string | null
            amount: number
        } | null
        reasonCode: string
        details?: Prisma.InputJsonValue
    }
): Promise<void> {
    await tx.storeSubscription.updateMany({
        where: { id: input.subscriptionId },
        data: { resultMessage: input.reasonCode },
    })
    if (!input.operation) return

    await tx.operation.updateMany({
        where: { id: input.operation.id },
        data: { responseMessage: input.reasonCode },
    })
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
            beinAccountId: input.operation.beinAccountId,
            issueType: 'STRIPE_RENEWAL_REFUND_CONFLICT',
            severity: 'HIGH',
            status: 'OPEN',
            operationAmount: input.operation.amount,
            details: {
                reasonCode: input.reasonCode,
                source: 'store_subscription_terminal_settlement',
                ...(input.details && typeof input.details === 'object' && !Array.isArray(input.details)
                    ? input.details
                    : {}),
            },
        },
        update: {
            status: 'OPEN',
            lastSeenAt: new Date(),
            details: {
                reasonCode: input.reasonCode,
                source: 'store_subscription_terminal_settlement',
                ...(input.details && typeof input.details === 'object' && !Array.isArray(input.details)
                    ? input.details
                    : {}),
            },
        },
    })
}

/**
 * Handle a failed store subscription
 * - Adds the paid amount to customer's store credit
 * - Updates subscription status
 * 
 * @param subscriptionId The store subscription ID
 * @param errorMessage Optional error message
 */
export async function handleFailedSubscription(
    subscriptionId: string,
    errorMessage?: string
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "store_subscriptions" WHERE id = ${subscriptionId} FOR UPDATE`
        const subscription = await tx.storeSubscription.findUnique({
            where: { id: subscriptionId },
            include: {
                payment: {
                    select: { amount: true, currency: true, status: true },
                },
                operation: {
                    select: {
                        id: true,
                        userId: true,
                        beinAccountId: true,
                        amount: true,
                        type: true,
                        providerMutationStartedAt: true,
                        providerPaymentState: true,
                        fulfillmentState: true,
                        fulfillmentVerificationOutcome: true,
                        fulfillmentProof: { select: { id: true } },
                    },
                },
                creditLedgerEntries: {
                    select: {
                        entryType: true,
                        amountMinor: true,
                        balanceBeforeMinor: true,
                        balanceAfterMinor: true,
                        currency: true,
                    },
                },
            },
        })

        if (!subscription) return
        if (!['PAID', 'PROCESSING', 'AWAITING_CAPTCHA', 'COMPLETING'].includes(subscription.status)) {
            return
        }

        const safeProviderFailure = (
            subscription.operation?.type === 'RENEW' &&
            (
                (
                    !subscription.operation.providerMutationStartedAt &&
                    subscription.operation.providerPaymentState === 'NOT_SUBMITTED' &&
                    subscription.operation.fulfillmentState === 'UNVERIFIED' &&
                    !subscription.operation.fulfillmentProof
                ) ||
                (
                    subscription.operation.providerPaymentState === 'NOT_CHARGED' &&
                    subscription.operation.fulfillmentState === 'NOT_FOUND' &&
                    subscription.operation.fulfillmentVerificationOutcome === 'VALID_NO_MATCH' &&
                    !subscription.operation.fulfillmentProof
                )
            )
        )
        if (!safeProviderFailure) {
            await markStoreSubscriptionSettlementReview(tx, {
                subscriptionId: subscription.id,
                operation: subscription.operation,
                reasonCode: STORE_SUBSCRIPTION_SETTLEMENT_REVIEW_CODE,
                details: { safeProviderFailure: false },
            })
            return
        }

        const country = subscription.currency === CURRENCY_CONFIG.EG.code ? 'EG' : 'SA'
        const currency = CURRENCY_CONFIG[country].code
        const debitEntries = subscription.creditLedgerEntries.filter(
            (entry) => entry.entryType === 'DEBIT'
        )
        const creditUsedMinor = toStripeAmount(subscription.creditUsed, country)
        if (!isStoreCreditDebitLedgerConsistent({
            creditUsedMinor,
            currency,
            entries: debitEntries,
        })) {
            await markStoreSubscriptionSettlementReview(tx, {
                subscriptionId: subscription.id,
                operation: subscription.operation,
                reasonCode: STORE_SUBSCRIPTION_SETTLEMENT_REVIEW_CODE,
                details: { storeCreditLedgerConsistent: false },
            })
            return
        }

        const totalRefundMinor = toStripeAmount(subscription.price, country)
        const providerPaidMinor = subscription.payment?.status === 'SUCCEEDED'
            ? toStripeAmount(subscription.payment.amount, country)
            : 0
        if (
            totalRefundMinor <= 0 ||
            creditUsedMinor + providerPaidMinor !== totalRefundMinor ||
            (subscription.payment && subscription.payment.currency !== currency)
        ) {
            await markStoreSubscriptionSettlementReview(tx, {
                subscriptionId: subscription.id,
                operation: subscription.operation,
                reasonCode: STORE_SUBSCRIPTION_SETTLEMENT_REVIEW_CODE,
                details: {
                    totalRefundMinor,
                    creditUsedMinor,
                    providerPaidMinor,
                    currency,
                },
            })
            return
        }

        if (providerPaidMinor > 0) {
            await markStoreSubscriptionSettlementReview(tx, {
                subscriptionId: subscription.id,
                operation: subscription.operation,
                reasonCode: STORE_STRIPE_REFUND_REQUIRED_CODE,
                details: {
                    providerPaidMinor,
                    creditUsedMinor,
                    currency,
                },
            })
            return
        }

        const existingRefund = subscription.creditLedgerEntries.find(
            (entry) => entry.entryType === 'REFUND'
        )
        if (existingRefund) {
            if (
                existingRefund.amountMinor === creditUsedMinor &&
                existingRefund.currency === currency &&
                existingRefund.balanceAfterMinor - existingRefund.balanceBeforeMinor === creditUsedMinor
            ) {
                await tx.storeSubscription.updateMany({
                    where: { id: subscription.id, status: { not: 'REFUNDED' } },
                    data: {
                        status: 'REFUNDED',
                        refundedAt: new Date(),
                        resultMessage: 'STORE_CREDIT_RESTORED_AFTER_PROVIDER_SAFE_FAILURE',
                    },
                })
                return
            }
            await markStoreSubscriptionSettlementReview(tx, {
                subscriptionId: subscription.id,
                operation: subscription.operation,
                reasonCode: STORE_SUBSCRIPTION_SETTLEMENT_REVIEW_CODE,
                details: { conflictingRefundLedger: true },
            })
            return
        }

        await tx.$queryRaw`SELECT id FROM "customers" WHERE id = ${subscription.customerId} FOR UPDATE`
        const customer = await tx.customer.findUnique({
            where: { id: subscription.customerId },
            select: { storeCredit: true },
        })
        if (!customer) {
            await markStoreSubscriptionSettlementReview(tx, {
                subscriptionId: subscription.id,
                operation: subscription.operation,
                reasonCode: STORE_SUBSCRIPTION_SETTLEMENT_REVIEW_CODE,
                details: { customerMissing: true },
            })
            return
        }

        const balanceBeforeMinor = toStripeAmount(customer.storeCredit, country)
        await tx.storeCreditLedgerEntry.create({
            data: {
                subscriptionId: subscription.id,
                customerId: subscription.customerId,
                entryType: 'REFUND',
                amountMinor: creditUsedMinor,
                balanceBeforeMinor,
                balanceAfterMinor: balanceBeforeMinor + creditUsedMinor,
                currency,
                reasonCode: 'STORE_CREDIT_RESTORED_AFTER_PROVIDER_SAFE_FAILURE',
            },
        })
        await tx.customer.update({
            where: { id: subscription.customerId },
            data: { storeCredit: { increment: subscription.creditUsed } },
        })
        await tx.storeSubscription.update({
            where: { id: subscription.id },
            data: {
                status: 'REFUNDED',
                refundedAt: new Date(),
                resultMessage: errorMessage || 'STORE_CREDIT_RESTORED_AFTER_PROVIDER_SAFE_FAILURE',
            },
        })

        console.log(`[Store] Subscription ${subscriptionId} restored ${subscription.creditUsed} ${currency} of original store credit for customer ${subscription.customerId}.`)
    })
}

/**
 * Sync subscription status from operation
 * Called by worker or cron job
 */
export async function syncSubscriptionStatus(operationId: string): Promise<void> {
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        include: {
            storeSubscription: true,
        }
    })
    
    if (!operation || !operation.storeSubscription) return
    
    const subscription = operation.storeSubscription
    
    switch (operation.status) {
        case 'COMPLETED':
            await prisma.storeSubscription.updateMany({
                where: {
                    id: subscription.id,
                    status: { in: ['PAID', 'PROCESSING', 'AWAITING_CAPTCHA', 'COMPLETING'] },
                },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    resultMessage: operation.responseMessage || 'Renewal completed successfully',
                }
            })
            break
            
        case 'FAILED':
        case 'CANCELLED':
        case 'EXPIRED':
            await handleFailedSubscription(
                subscription.id,
                operation.error || operation.responseMessage || 'Operation failed'
            )
            break
            
        case 'AWAITING_CAPTCHA':
            await prisma.storeSubscription.updateMany({
                where: { id: subscription.id, status: { in: ['PAID', 'PROCESSING'] } },
                data: { status: 'AWAITING_CAPTCHA' }
            })
            break
            
        case 'AWAITING_PACKAGE':
            await prisma.storeSubscription.updateMany({
                where: { id: subscription.id, status: 'PENDING' },
                data: { status: 'AWAITING_PACKAGE' }
            })
            break
    }
}

export async function syncPendingStoreSubscriptionSettlements(limit = 50): Promise<{
    scanned: number
    synchronized: number
    errors: string[]
}> {
    const candidates = await prisma.storeSubscription.findMany({
        where: {
            status: { in: ['PAID', 'PROCESSING', 'AWAITING_CAPTCHA', 'COMPLETING'] },
            operation: {
                is: { status: { in: ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'] } },
            },
        },
        select: { operationId: true },
        orderBy: { updatedAt: 'asc' },
        take: Math.max(1, Math.min(200, Math.trunc(limit))),
    })
    let synchronized = 0
    const errors: string[] = []
    for (const candidate of candidates) {
        if (!candidate.operationId) continue
        try {
            await syncSubscriptionStatus(candidate.operationId)
            synchronized += 1
        } catch {
            errors.push(candidate.operationId)
        }
    }
    return { scanned: candidates.length, synchronized, errors }
}
