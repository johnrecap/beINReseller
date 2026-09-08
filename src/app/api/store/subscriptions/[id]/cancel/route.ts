/**
 * Store Subscription Cancel
 * POST /api/store/subscriptions/[id]/cancel
 * 
 * Cancels a subscription only before any payment or store-credit claim.
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import {
    decideStoreRenewalCancellationSafety,
    ensureGuardedRenewalOperationReservation,
    isRenewalCreationBlockedError,
} from '@/lib/operations/renewal-creation-guard'
import {
    releaseCardLifecycleReservation,
    resolveCardLifecycleReservationDisposition,
} from '@/lib/operations/card-lifecycle-reservation'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }
        
        const { id } = await params
        
        // 2. Get subscription
        const subscription = await prisma.storeSubscription.findUnique({
            where: { id },
            include: {
                operation: {
                    select: {
                        id: true,
                        cardNumber: true,
                        status: true,
                        providerPaymentState: true,
                        providerMutationStartedAt: true,
                        fulfillmentAuthority: true,
                        fulfillmentProof: { select: { id: true } },
                        integrityIssues: {
                            where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
                            select: { id: true },
                            take: 1,
                        },
                    },
                },
                creditLedgerEntries: {
                    where: { entryType: 'DEBIT' },
                    select: { id: true },
                    take: 1,
                },
            }
        })
        
        if (!subscription) {
            return errorResponse('Subscription not found', 404, 'NOT_FOUND')
        }
        
        // 3. Check ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('Unauthorized access to this subscription', 403, 'FORBIDDEN')
        }
        
        // 4. Check if cancellable
        if (subscription.status === 'AWAITING_PAYMENT') {
            return errorResponse(
                'Cancellation requires review because payment or fulfillment evidence is ambiguous',
                409,
                'CANCELLATION_REVIEW_REQUIRED'
            )
        }
        const cancellableStatuses = ['PENDING', 'AWAITING_PACKAGE']
        if (!cancellableStatuses.includes(subscription.status)) {
            return errorResponse(
                'Cannot cancel this subscription. Current status: ' + subscription.status,
                400,
                'CANNOT_CANCEL'
            )
        }
        
        if (!subscription.operation) {
            return errorResponse(
                'Cancellation requires review because the renewal operation is missing',
                409,
                'CANCELLATION_REVIEW_REQUIRED'
            )
        }

        // 5. Make the cancellation decision again under the same card,
        // subscription, and customer locks used by package selection. The
        // pre-transaction read is authorization/UI context only; otherwise a
        // concurrent selection could create an in-flight Stripe intent after
        // this route had already decided cancellation was safe.
        const cancellation = await prisma.$transaction(async (tx) => {
            await ensureGuardedRenewalOperationReservation(tx, {
                operationId: subscription.operation!.id,
                cardNumber: subscription.operation!.cardNumber,
            })

            await tx.$queryRaw`SELECT id FROM "store_subscriptions" WHERE id = ${subscription.id} FOR UPDATE`
            await tx.$queryRaw`SELECT id FROM "customers" WHERE id = ${customer.id} FOR UPDATE`

            const current = await tx.storeSubscription.findUnique({
                where: { id: subscription.id },
                include: {
                    operation: {
                        select: {
                            id: true,
                            cardNumber: true,
                            status: true,
                            providerPaymentState: true,
                            providerMutationStartedAt: true,
                            fulfillmentAuthority: true,
                            fulfillmentProof: { select: { id: true } },
                            integrityIssues: {
                                where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
                                select: { id: true },
                                take: 1,
                            },
                        },
                    },
                    creditLedgerEntries: {
                        where: { entryType: 'DEBIT' },
                        select: { id: true },
                        take: 1,
                    },
                },
            })

            if (
                !current ||
                current.customerId !== customer.id ||
                !current.operation ||
                current.operation.id !== subscription.operation!.id ||
                current.operation.cardNumber !== subscription.operation!.cardNumber
            ) {
                throw new Error('CANCELLATION_REVIEW_REQUIRED')
            }

            const cancellationDecision = decideStoreRenewalCancellationSafety({
                subscriptionStatus: current.status,
                operationStatus: current.operation.status,
                stripePaymentIntentId: current.stripePaymentIntentId,
                paymentId: current.paymentId,
                providerPaymentState: current.operation.providerPaymentState,
                providerMutationStartedAt: current.operation.providerMutationStartedAt,
                fulfillmentAuthority: current.operation.fulfillmentAuthority,
                fulfillmentProofExists: !!current.operation.fulfillmentProof,
                unresolvedIntegrityIssueExists: current.operation.integrityIssues.length > 0,
                storeCreditDebitExists: (
                    current.creditLedgerEntries.length > 0 ||
                    current.creditUsed > 0
                ),
            })
            if (cancellationDecision.action !== 'CANCEL_SAFE') {
                throw new Error('CANCELLATION_REVIEW_REQUIRED')
            }

            const subscriptionUpdate = await tx.storeSubscription.updateMany({
                where: {
                    id: current.id,
                    status: { in: ['PENDING', 'AWAITING_PACKAGE'] },
                    stripePaymentIntentId: null,
                    paymentId: null,
                    creditUsed: 0,
                },
                data: { status: 'CANCELLED' },
            })
            const operationUpdate = await tx.operation.updateMany({
                where: {
                    id: current.operation.id,
                    status: 'AWAITING_PACKAGE',
                    providerMutationStartedAt: null,
                    providerPaymentState: { in: ['NOT_SUBMITTED'] },
                    fulfillmentProof: null,
                },
                data: { status: 'CANCELLED' },
            })
            if (subscriptionUpdate.count !== 1 || operationUpdate.count !== 1) {
                throw new Error('CANCELLATION_REVIEW_REQUIRED')
            }

            await releaseCardLifecycleReservation(tx, {
                operationId: current.operation.id,
                disposition: resolveCardLifecycleReservationDisposition({
                    operationStatus: 'CANCELLED',
                    terminalResolutionSafe: true,
                    manualReviewResolutionId: null,
                }),
            })

            return { creditRefunded: 0, currency: current.currency }
        })
        
        return successResponse({
            subscriptionId: subscription.id,
            status: 'CANCELLED',
            creditRefunded: cancellation.creditRefunded,
            message: cancellation.creditRefunded > 0
                ? `Subscription cancelled and ${cancellation.creditRefunded} ${cancellation.currency} refunded to your balance`
                : 'Subscription cancelled',
        })
        
    } catch (error) {
        if (
            isRenewalCreationBlockedError(error) ||
            (error instanceof Error && error.message === 'CANCELLATION_REVIEW_REQUIRED')
        ) {
            return errorResponse(
                'Cancellation requires review because payment or fulfillment evidence is ambiguous',
                409,
                'CANCELLATION_REVIEW_REQUIRED'
            )
        }
        return handleApiError(error)
    }
}
