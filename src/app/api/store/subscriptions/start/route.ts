/**
 * Store Subscription Start
 * POST /api/store/subscriptions/start
 * 
 * Customer enters beIN card number to start a subscription renewal.
 * Creates a StoreSubscription + Operation, then fetches packages from beIN.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { getMarkupPercentage } from '@/lib/store-pricing'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import {
    createGuardedRenewalOperation,
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'

// Validation schema
const startSchema = z.object({
    cardNumber: z.string()
        .min(10, 'Card number must be at least 10 digits')
        .max(16, 'Card number must be at most 16 digits')
        .regex(/^\d+$/, 'Card number must contain only digits'),
})

export async function POST(request: NextRequest) {
    try {
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)

        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }

        // 2. Validate input
        const body = await request.json()
        const result = startSchema.safeParse(body)

        if (!result.success) {
            return validationErrorResponse(result.error)
        }

        const { cardNumber } = result.data

        // 3. Check for existing pending subscription for this card
        const existingSubscription = await prisma.storeSubscription.findFirst({
            where: {
                customerId: customer.id,
                cardNumber,
                status: {
                    in: ['PENDING', 'AWAITING_PACKAGE', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'AWAITING_CAPTCHA', 'COMPLETING']
                },
            },
        })

        if (existingSubscription) {
            // Age alone is not evidence that provider/payment work never began.
            // Never cancel or release money while that evidence is ambiguous.
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

            if (existingSubscription.createdAt < tenMinutesAgo) {
                return errorResponse(
                    'The previous renewal requires review before another renewal can start',
                    409,
                    'SUBSCRIPTION_REVIEW_REQUIRED'
                )
            } else {
                return errorResponse(
                    'There is an active operation for this card',
                    400,
                    'SUBSCRIPTION_IN_PROGRESS'
                )
            }
        }

        // 4. Get markup percentage from settings
        const markupPercent = await getMarkupPercentage()

        // 5. Get full customer data
        const fullCustomer = await prisma.customer.findUnique({
            where: { id: customer.id },
            select: { country: true, storeCredit: true }
        })

        const currency = fullCustomer?.country === 'EG' ? 'EGP' : 'SAR'

        // 6-8. Create the operation, durable card claim, store row, and outbox
        // atomically. Queue delivery is retryable after commit.
        const { operation, subscription } = await prisma.$transaction(async (tx) => {
            const operation = await createGuardedRenewalOperation(tx, {
                cardNumber,
                data: {
                    customerId: customer.id,
                    amount: 0,
                    status: 'PENDING',
                    providerPaymentState: 'NOT_SUBMITTED',
                    fulfillmentState: 'UNVERIFIED',
                },
            })

            const subscription = await tx.storeSubscription.create({
                data: {
                    customerId: customer.id,
                    cardNumber,
                    status: 'PENDING',
                    currency,
                    price: 0,
                    markupPercent,
                    operationId: operation.id,
                },
                select: {
                    id: true,
                    cardNumber: true,
                    status: true,
                    currency: true,
                    createdAt: true,
                },
            })

            await createOperationDispatch(tx, {
                operationId: operation.id,
                type: 'START_RENEWAL',
                cardNumber,
                customerId: customer.id,
            })

            return { operation, subscription }
        })

        const dispatchResult = await dispatchPendingOperationJobs({
            operationIds: [operation.id],
        })
        if (dispatchResult.failed > 0) {
            console.error('Failed to dispatch store renewal; saved for retry:', operation.id)
        }

        // 9. Return subscription info
        return successResponse({
            subscription: {
                id: subscription.id,
                cardNumber: cardNumber,
                status: subscription.status,
                currency: subscription.currency,
                storeCredit: fullCustomer?.storeCredit || 0,
                createdAt: subscription.createdAt.toISOString(),
            },
            message: 'Fetching available packages...',
            queued: dispatchResult.failed === 0,
        }, 'Operation started successfully', 201)

    } catch (error) {
        if (isRenewalCreationBlockedError(error)) {
            const payload = renewalCreationBlockedPayload(error)
            return errorResponse(payload.error, 409, payload.code)
        }
        return handleApiError(error)
    }
}
