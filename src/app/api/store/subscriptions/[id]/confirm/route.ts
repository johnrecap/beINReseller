/**
 * Store Subscription Final Confirm
 * POST /api/store/subscriptions/[id]/confirm
 * 
 * Final confirmation step if required by beIN (OK button).
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import {
    ensureGuardedRenewalOperationReservation,
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'

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
        
        // 2. Get subscription with operation
        const subscription = await prisma.storeSubscription.findUnique({
            where: { id },
            include: {
                operation: {
                    select: {
                        id: true,
                        cardNumber: true,
                        status: true,
                        finalConfirmExpiry: true,
                    }
                }
            }
        })
        
        if (!subscription) {
            return errorResponse('Subscription not found', 404, 'NOT_FOUND')
        }
        
        // 3. Check ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('Unauthorized access to this subscription', 403, 'FORBIDDEN')
        }
        
        // 4. Check status
        if (subscription.operation?.status !== 'AWAITING_FINAL_CONFIRM') {
            return errorResponse('Subscription does not require final confirmation', 400, 'CONFIRM_NOT_REQUIRED')
        }
        
        // 5. Check if expired
        const operation = subscription.operation
        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            return errorResponse('Confirmation expired - please start a new operation', 400, 'CONFIRM_EXPIRED')
        }
        
        // 6-7. Assert the durable card claim and persist dispatch atomically.
        await prisma.$transaction(async (tx) => {
            await ensureGuardedRenewalOperationReservation(tx, {
                operationId: operation.id,
                cardNumber: operation.cardNumber,
            })
            await createOperationDispatch(tx, {
                operationId: operation.id,
                type: 'CONFIRM_PURCHASE',
                cardNumber: operation.cardNumber,
                customerId: customer.id,
            })
            await tx.storeSubscription.update({
                where: { id: subscription.id },
                data: { status: 'COMPLETING' },
            })
        })

        const dispatchResult = await dispatchPendingOperationJobs({
            operationIds: [operation.id],
        })
        if (dispatchResult.failed > 0) {
            console.error('Failed to dispatch store confirm-purchase; saved for retry:', operation.id)
        }
        
        return successResponse({
            subscriptionId: subscription.id,
            status: 'COMPLETING',
            message: 'Confirming final payment...',
            queued: dispatchResult.failed === 0,
        })
        
    } catch (error) {
        if (isRenewalCreationBlockedError(error)) {
            const payload = renewalCreationBlockedPayload(error)
            return errorResponse(payload.error, 409, payload.code)
        }
        return handleApiError(error)
    }
}
