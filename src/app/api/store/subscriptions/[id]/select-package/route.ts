/**
 * Store Subscription Select Package
 * POST /api/store/subscriptions/[id]/select-package
 * 
 * Customer selects a package from beIN. Creates Stripe PaymentIntent.
 * Returns clientSecret for payment.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { calculateCustomerPrice, toStripeAmount, CURRENCY_CONFIG, getStripeSecretKey } from '@/lib/store-pricing'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import {
    ensureGuardedRenewalOperationReservation,
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'
import {
    buildStorePaymentIntentIdempotencyKey,
    decideExistingStorePaymentClaim,
    isStoreCreditDebitLedgerConsistent,
    matchesPersistedStorePaymentSelection,
    STORE_CREDIT_DEBIT_REASON_CODE,
    STORE_PAYMENT_INTENT_IN_PROGRESS_CODE,
    STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
    STORE_PAYMENT_SELECTION_LOCKED_CODE,
} from '@/lib/store-subscription-payment-claim'
import { markStoreSubscriptionPaymentReviewRequired } from '@/lib/store-subscription-payment-finalization'

interface RouteParams {
    params: Promise<{ id: string }>
}

interface AvailablePackage {
    index: number
    name: string
    price: number
    checkboxSelector?: string
}

// Validation schema
const selectPackageSchema = z.object({
    packageIndex: z.number().int().min(0),
    useStoreCredit: z.boolean().optional().default(true), // Use store credit if available
})

const PAYMENT_INTENT_UNAVAILABLE_CODE = 'PAYMENT_INTENT_UNAVAILABLE'
const MAX_STORE_MONEY_MINOR = 2_147_483_647

async function markPaymentIntentReviewRequired(input: {
    subscriptionId: string
    operationId: string
    cardNumber: string
}): Promise<void> {
    try {
        await prisma.$transaction((tx) => markStoreSubscriptionPaymentReviewRequired(tx, {
            ...input,
            reasonCode: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
        }))
    } catch (error) {
        console.error('Failed to persist store payment-intent review state:', error)
    }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }
        
        const { id } = await params
        const body = await request.json()
        
        // 2. Validate input
        const result = selectPackageSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { packageIndex, useStoreCredit } = result.data
        
        // Read only the immutable ownership/operation link before entering the
        // card-serialized claim transaction. Every financial value is re-read
        // under locks below.
        const initialSubscription = await prisma.storeSubscription.findUnique({
            where: { id },
            select: {
                customerId: true,
                operation: {
                    select: { id: true, cardNumber: true },
                },
            },
        })

        if (!initialSubscription) {
            return errorResponse('Subscription not found', 404, 'NOT_FOUND')
        }
        if (initialSubscription.customerId !== customer.id) {
            return errorResponse('Unauthorized access to this subscription', 403, 'FORBIDDEN')
        }
        if (!initialSubscription.operation) {
            return errorResponse('Renewal operation not found', 409, 'RENEWAL_OPERATION_MISSING')
        }

        const stripeSecretKey = await getStripeSecretKey()
        const now = new Date()
        const claim = await prisma.$transaction(async (tx) => {
            await ensureGuardedRenewalOperationReservation(tx, {
                operationId: initialSubscription.operation!.id,
                cardNumber: initialSubscription.operation!.cardNumber,
            })
            await tx.$queryRaw`SELECT id FROM "store_subscriptions" WHERE id = ${id} FOR UPDATE`
            await tx.$queryRaw`SELECT id FROM "customers" WHERE id = ${customer.id} FOR UPDATE`

            const subscription = await tx.storeSubscription.findUnique({
                where: { id },
                include: {
                    operation: {
                        select: {
                            id: true,
                            cardNumber: true,
                            status: true,
                            availablePackages: true,
                            selectedPackage: true,
                        },
                    },
                    customer: {
                        select: {
                            id: true,
                            email: true,
                            storeCredit: true,
                        },
                    },
                    payment: {
                        select: { status: true },
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

            if (!subscription) {
                return { kind: 'ERROR', code: 'NOT_FOUND', status: 404 } as const
            }
            if (subscription.customerId !== customer.id || !subscription.customer) {
                return { kind: 'ERROR', code: 'FORBIDDEN', status: 403 } as const
            }
            if (
                !subscription.operation ||
                subscription.operation.id !== initialSubscription.operation!.id ||
                subscription.operation.cardNumber !== subscription.cardNumber
            ) {
                return { kind: 'ERROR', code: 'RENEWAL_OPERATION_MISSING', status: 409 } as const
            }

            const packages = subscription.operation.availablePackages as AvailablePackage[] | null
            if (!packages || !Array.isArray(packages)) {
                return { kind: 'ERROR', code: 'NO_PACKAGES', status: 400 } as const
            }
            const matchingPackages = packages.filter((candidate) => candidate.index === packageIndex)
            const selectedPackage = matchingPackages.length === 1 ? matchingPackages[0] : null
            if (!selectedPackage) {
                return { kind: 'ERROR', code: 'PACKAGE_NOT_FOUND', status: 400 } as const
            }
            if (
                !selectedPackage.name?.trim() ||
                !Number.isFinite(selectedPackage.price) ||
                selectedPackage.price <= 0 ||
                !Number.isFinite(subscription.markupPercent) ||
                subscription.markupPercent < 0
            ) {
                return { kind: 'ERROR', code: 'PACKAGE_PRICE_INVALID', status: 409 } as const
            }

            if (
                subscription.currency !== CURRENCY_CONFIG.SA.code &&
                subscription.currency !== CURRENCY_CONFIG.EG.code
            ) {
                return { kind: 'ERROR', code: 'CURRENCY_INVALID', status: 409 } as const
            }
            const country = subscription.currency === CURRENCY_CONFIG.EG.code ? 'EG' : 'SA'
            const currencyConfig = CURRENCY_CONFIG[country]
            const customerPrice = calculateCustomerPrice(
                selectedPackage.price,
                subscription.markupPercent
            )
            const customerPriceMinor = toStripeAmount(customerPrice, country)
            if (
                !Number.isFinite(customerPrice) ||
                customerPrice <= 0 ||
                !Number.isSafeInteger(customerPriceMinor) ||
                customerPriceMinor <= 0 ||
                customerPriceMinor > MAX_STORE_MONEY_MINOR
            ) {
                return { kind: 'ERROR', code: 'PACKAGE_PRICE_INVALID', status: 409 } as const
            }
            const persistedCreditMinor = toStripeAmount(subscription.creditUsed, country)
            if (!isStoreCreditDebitLedgerConsistent({
                creditUsedMinor: persistedCreditMinor,
                currency: currencyConfig.code,
                entries: subscription.creditLedgerEntries,
            })) {
                await tx.operation.updateMany({
                    where: {
                        id: subscription.operation.id,
                        status: 'AWAITING_PACKAGE',
                    },
                    data: {
                        status: 'REVIEW_REQUIRED',
                        responseMessage: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                    },
                })
                await tx.storeSubscription.update({
                    where: { id: subscription.id },
                    data: { resultMessage: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE },
                })
                return {
                    kind: 'ERROR',
                    code: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                    status: 409,
                } as const
            }
            const decision = decideExistingStorePaymentClaim({
                persisted: {
                    status: subscription.status,
                    packageName: subscription.packageName,
                    packagePrice: subscription.packagePrice,
                    price: subscription.price,
                    creditUsed: subscription.creditUsed,
                    stripePaymentIntentId: subscription.stripePaymentIntentId,
                    paymentId: subscription.paymentId,
                    paymentStatus: subscription.payment?.status || null,
                    updatedAt: subscription.updatedAt,
                    selectedPackage: subscription.operation.selectedPackage,
                },
                selectedPackage,
                customerPrice,
                now,
            })

            if (decision === 'IN_PROGRESS') {
                return {
                    kind: 'ERROR',
                    code: STORE_PAYMENT_INTENT_IN_PROGRESS_CODE,
                    status: 409,
                } as const
            }
            if (decision === 'SELECTION_CONFLICT') {
                return {
                    kind: 'ERROR',
                    code: STORE_PAYMENT_SELECTION_LOCKED_CODE,
                    status: 409,
                } as const
            }
            if (decision === 'REVIEW_REQUIRED') {
                await tx.operation.updateMany({
                    where: {
                        id: subscription.operation.id,
                        status: 'AWAITING_PACKAGE',
                    },
                    data: {
                        status: 'REVIEW_REQUIRED',
                        responseMessage: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                    },
                })
                await tx.storeSubscription.update({
                    where: { id: subscription.id },
                    data: { resultMessage: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE },
                })
                return {
                    kind: 'ERROR',
                    code: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                    status: 409,
                } as const
            }
            if (decision === 'INVALID_STATUS') {
                return { kind: 'ERROR', code: 'INVALID_STATUS', status: 400 } as const
            }
            if (decision === 'ALREADY_ADVANCED') {
                return {
                    kind: 'ALREADY_ADVANCED',
                    subscriptionId: subscription.id,
                    operationId: subscription.operation.id,
                    packageName: selectedPackage.name,
                    price: subscription.price,
                    creditUsed: subscription.creditUsed,
                } as const
            }

            if (decision === 'REUSE_INTENT') {
                if (!stripeSecretKey) {
                    return { kind: 'ERROR', code: 'STRIPE_NOT_CONFIGURED', status: 500 } as const
                }
                const amountToPay = Number((subscription.price - subscription.creditUsed).toFixed(2))
                return {
                    kind: 'REUSE_INTENT',
                    subscriptionId: subscription.id,
                    operationId: subscription.operation.id,
                    cardNumber: subscription.cardNumber,
                    customerId: subscription.customerId,
                    customerEmail: subscription.customer.email || '',
                    selectedPackage,
                    customerPrice: subscription.price,
                    creditUsed: subscription.creditUsed,
                    amountToPay,
                    amountMinor: toStripeAmount(amountToPay, country),
                    country,
                    currencyCode: currencyConfig.code,
                    stripeCurrencyCode: currencyConfig.stripeCode,
                    stripePaymentIntentId: subscription.stripePaymentIntentId!,
                    paymentId: subscription.paymentId!,
                } as const
            }

            const availableCreditMinor = toStripeAmount(
                subscription.customer.storeCredit,
                country
            )
            if (
                !Number.isFinite(subscription.customer.storeCredit) ||
                subscription.customer.storeCredit < 0 ||
                !Number.isSafeInteger(availableCreditMinor) ||
                availableCreditMinor < 0 ||
                availableCreditMinor > MAX_STORE_MONEY_MINOR
            ) {
                await tx.operation.updateMany({
                    where: {
                        id: subscription.operation.id,
                        status: 'AWAITING_PACKAGE',
                    },
                    data: {
                        status: 'REVIEW_REQUIRED',
                        responseMessage: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                    },
                })
                await tx.storeSubscription.update({
                    where: { id: subscription.id },
                    data: { resultMessage: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE },
                })
                return {
                    kind: 'ERROR',
                    code: STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                    status: 409,
                } as const
            }
            const creditUsedMinor = useStoreCredit
                ? Math.min(availableCreditMinor, customerPriceMinor)
                : 0
            const amountMinor = customerPriceMinor - creditUsedMinor
            const creditUsed = creditUsedMinor / currencyConfig.multiplier
            const amountToPay = amountMinor / currencyConfig.multiplier

            if (amountMinor > 0 && !stripeSecretKey) {
                return { kind: 'ERROR', code: 'STRIPE_NOT_CONFIGURED', status: 500 } as const
            }

            const subscriptionUpdate = await tx.storeSubscription.updateMany({
                where: {
                    id: subscription.id,
                    status: 'AWAITING_PACKAGE',
                    stripePaymentIntentId: null,
                    paymentId: null,
                },
                data: {
                    status: amountMinor === 0 ? 'PAID' : 'AWAITING_PAYMENT',
                    packageName: selectedPackage.name,
                    packagePrice: selectedPackage.price,
                    price: customerPrice,
                    creditUsed,
                    resultMessage: null,
                },
            })
            const operationUpdate = await tx.operation.updateMany({
                where: {
                    id: subscription.operation.id,
                    cardNumber: subscription.cardNumber,
                    status: 'AWAITING_PACKAGE',
                },
                data: {
                    selectedPackage: JSON.parse(JSON.stringify(selectedPackage)),
                    amount: selectedPackage.price,
                    ...(amountMinor === 0 ? { status: 'COMPLETING' as const } : {}),
                },
            })
            const creditUpdate = creditUsed > 0
                ? await tx.customer.updateMany({
                    where: {
                        id: subscription.customerId,
                        storeCredit: { gte: creditUsed },
                    },
                    data: { storeCredit: { decrement: creditUsed } },
                })
                : { count: 1 }

            if (creditUsedMinor > 0) {
                await tx.storeCreditLedgerEntry.create({
                    data: {
                        subscriptionId: subscription.id,
                        customerId: subscription.customerId,
                        entryType: 'DEBIT',
                        amountMinor: creditUsedMinor,
                        balanceBeforeMinor: availableCreditMinor,
                        balanceAfterMinor: availableCreditMinor - creditUsedMinor,
                        currency: currencyConfig.code,
                        reasonCode: STORE_CREDIT_DEBIT_REASON_CODE,
                    },
                })
            }

            if (
                subscriptionUpdate.count !== 1 ||
                operationUpdate.count !== 1 ||
                creditUpdate.count !== 1
            ) {
                throw new Error('STORE_PAYMENT_CLAIM_RACE')
            }

            if (amountMinor === 0) {
                await createOperationDispatch(tx, {
                    operationId: subscription.operation.id,
                    type: 'COMPLETE_PURCHASE',
                    cardNumber: subscription.cardNumber,
                    customerId: subscription.customerId,
                    amount: selectedPackage.price,
                })
                return {
                    kind: 'FULL_CREDIT',
                    subscriptionId: subscription.id,
                    operationId: subscription.operation.id,
                    packageName: selectedPackage.name,
                    price: customerPrice,
                    creditUsed,
                } as const
            }

            return {
                kind: 'CREATE_INTENT',
                subscriptionId: subscription.id,
                operationId: subscription.operation.id,
                cardNumber: subscription.cardNumber,
                customerId: subscription.customerId,
                customerEmail: subscription.customer.email || '',
                selectedPackage,
                customerPrice,
                creditUsed,
                amountToPay,
                amountMinor,
                country,
                currencyCode: currencyConfig.code,
                stripeCurrencyCode: currencyConfig.stripeCode,
                stripePaymentIntentId: null,
                paymentId: null,
            } as const
        })

        if (claim.kind === 'ERROR') {
            return errorResponse(claim.code, claim.status, claim.code)
        }

        if (claim.kind === 'FULL_CREDIT') {
            const dispatchResult = await dispatchPendingOperationJobs({
                operationIds: [claim.operationId],
            })
            return successResponse({
                subscriptionId: claim.subscriptionId,
                status: 'PAID',
                packageName: claim.packageName,
                price: claim.price,
                creditUsed: claim.creditUsed,
                amountToPay: 0,
                queued: dispatchResult.failed === 0,
                message: 'Your balance was used to cover the full amount. Processing operation...',
            })
        }

        if (claim.kind === 'ALREADY_ADVANCED') {
            const dispatchResult = await dispatchPendingOperationJobs({
                operationIds: [claim.operationId],
            })
            return successResponse({
                subscriptionId: claim.subscriptionId,
                status: 'PAID',
                packageName: claim.packageName,
                price: claim.price,
                creditUsed: claim.creditUsed,
                amountToPay: 0,
                queued: dispatchResult.failed === 0,
                reused: true,
                message: 'Payment confirmed successfully. Processing operation...',
            })
        }

        const stripe = new Stripe(stripeSecretKey!)
        let paymentIntent: Stripe.PaymentIntent
        if (claim.kind === 'REUSE_INTENT') {
            try {
                paymentIntent = await stripe.paymentIntents.retrieve(claim.stripePaymentIntentId)
            } catch {
                return errorResponse(
                    PAYMENT_INTENT_UNAVAILABLE_CODE,
                    503,
                    PAYMENT_INTENT_UNAVAILABLE_CODE
                )
            }
        } else {
            try {
                paymentIntent = await stripe.paymentIntents.create({
                    amount: claim.amountMinor,
                    currency: claim.stripeCurrencyCode,
                    metadata: {
                        source: 'store_renewal',
                        operationId: claim.operationId,
                        subscriptionId: claim.subscriptionId,
                        customerId: claim.customerId,
                        customerEmail: claim.customerEmail,
                        packageIndex: claim.selectedPackage.index.toString(),
                        packageName: claim.selectedPackage.name,
                        beinPrice: claim.selectedPackage.price.toString(),
                        customerPrice: claim.customerPrice.toString(),
                        creditUsed: claim.creditUsed.toString(),
                    },
                    description: `beIN Subscription: ${claim.selectedPackage.name}`,
                }, {
                    idempotencyKey: buildStorePaymentIntentIdempotencyKey({
                        operationId: claim.operationId,
                        subscriptionId: claim.subscriptionId,
                        packageIndex: claim.selectedPackage.index,
                    }),
                })
            } catch {
                await markPaymentIntentReviewRequired(claim)
                return errorResponse(
                    STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                    409,
                    STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE
                )
            }
        }

        const intentMatchesClaim = (
            paymentIntent.id &&
            paymentIntent.client_secret &&
            paymentIntent.status !== 'canceled' &&
            paymentIntent.amount === claim.amountMinor &&
            paymentIntent.currency === claim.stripeCurrencyCode &&
            paymentIntent.metadata.subscriptionId === claim.subscriptionId &&
            paymentIntent.metadata.operationId === claim.operationId &&
            paymentIntent.metadata.customerId === claim.customerId &&
            paymentIntent.metadata.packageIndex === claim.selectedPackage.index.toString() &&
            paymentIntent.metadata.packageName === claim.selectedPackage.name &&
            paymentIntent.metadata.beinPrice === claim.selectedPackage.price.toString() &&
            paymentIntent.metadata.customerPrice === claim.customerPrice.toString() &&
            paymentIntent.metadata.creditUsed === claim.creditUsed.toString()
        )
        if (!intentMatchesClaim) {
            await markPaymentIntentReviewRequired(claim)
            return errorResponse(
                STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                409,
                STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE
            )
        }

        if (claim.kind === 'CREATE_INTENT') {
            try {
                await prisma.$transaction(async (tx) => {
                    await ensureGuardedRenewalOperationReservation(tx, {
                        operationId: claim.operationId,
                        cardNumber: claim.cardNumber,
                    })
                    await tx.$queryRaw`SELECT id FROM "store_subscriptions" WHERE id = ${claim.subscriptionId} FOR UPDATE`
                    const current = await tx.storeSubscription.findUnique({
                        where: { id: claim.subscriptionId },
                        include: {
                            operation: { select: { selectedPackage: true } },
                            payment: { select: { status: true } },
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
                        !current ||
                        current.status !== 'AWAITING_PAYMENT' ||
                        current.stripePaymentIntentId ||
                        current.paymentId ||
                        !isStoreCreditDebitLedgerConsistent({
                            creditUsedMinor: toStripeAmount(current.creditUsed, claim.country),
                            currency: claim.currencyCode,
                            entries: current.creditLedgerEntries,
                        }) ||
                        !matchesPersistedStorePaymentSelection({
                            persisted: {
                                status: current.status,
                                packageName: current.packageName,
                                packagePrice: current.packagePrice,
                                price: current.price,
                                creditUsed: current.creditUsed,
                                stripePaymentIntentId: current.stripePaymentIntentId,
                                paymentId: current.paymentId,
                                paymentStatus: current.payment?.status || null,
                                updatedAt: current.updatedAt,
                                selectedPackage: current.operation?.selectedPackage,
                            },
                            selectedPackage: claim.selectedPackage,
                            customerPrice: claim.customerPrice,
                        })
                    ) {
                        throw new Error('STORE_PAYMENT_CLAIM_LOST')
                    }

                    const payment = await tx.payment.create({
                        data: {
                            customerId: claim.customerId,
                            stripePaymentIntentId: paymentIntent.id,
                            amount: claim.amountToPay,
                            currency: claim.currencyCode,
                            status: 'PENDING',
                            type: 'SUBSCRIPTION',
                            metadata: {
                                source: 'store_renewal',
                                operationId: claim.operationId,
                                subscriptionId: claim.subscriptionId,
                                packageName: claim.selectedPackage.name,
                                creditUsed: claim.creditUsed,
                            },
                        },
                    })
                    const subscriptionUpdate = await tx.storeSubscription.updateMany({
                        where: {
                            id: claim.subscriptionId,
                            status: 'AWAITING_PAYMENT',
                            stripePaymentIntentId: null,
                            paymentId: null,
                        },
                        data: {
                            stripePaymentIntentId: paymentIntent.id,
                            paymentId: payment.id,
                        },
                    })
                    if (subscriptionUpdate.count !== 1) {
                        throw new Error('STORE_PAYMENT_CLAIM_LOST')
                    }
                })
            } catch {
                await markPaymentIntentReviewRequired(claim)
                return errorResponse(
                    STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE,
                    409,
                    STORE_PAYMENT_INTENT_REVIEW_REQUIRED_CODE
                )
            }
        }

        return successResponse({
            subscriptionId: claim.subscriptionId,
            status: 'AWAITING_PAYMENT',
            packageName: claim.selectedPackage.name,
            price: claim.customerPrice,
            creditUsed: claim.creditUsed,
            amountToPay: claim.amountToPay,
            currency: claim.currencyCode,
            clientSecret: paymentIntent.client_secret,
            reused: claim.kind === 'REUSE_INTENT',
            message: 'Please complete payment to finish the operation',
        })
        
    } catch (error) {
        if (isRenewalCreationBlockedError(error)) {
            const payload = renewalCreationBlockedPayload(error)
            return errorResponse(payload.error, 409, payload.code)
        }
        return handleApiError(error)
    }
}
