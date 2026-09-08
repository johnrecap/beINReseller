/**
 * Store Subscription Status
 * GET /api/store/subscriptions/[id]
 * 
 * Poll subscription status. Returns packages when available, captcha when needed, etc.
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'
import { applyMarkupToPackages } from '@/lib/store-pricing'

interface RouteParams {
    params: Promise<{ id: string }>
}

interface AvailablePackage {
    index: number
    name: string
    price: number
    checkboxSelector?: string
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)

        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }

        const { id } = await params

        // 2. Get subscription with operation data
        const subscription = await prisma.storeSubscription.findUnique({
            where: { id },
            include: {
                operation: {
                    select: {
                        id: true,
                        status: true,
                        availablePackages: true,
                        captchaImage: true,
                        captchaExpiry: true,
                        responseMessage: true,
                        responseData: true,
                        stbNumber: true,
                        error: true,
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

        // 4. Project operation progress without mutating financial state from a GET request.
        const operation = subscription.operation
        let effectiveStatus = subscription.status
        let settlementPending = false
        if (operation) {
            const subscriptionTerminal = ['COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'].includes(
                subscription.status
            )
            if (!subscriptionTerminal) {
                if (operation.status === 'AWAITING_PACKAGE' && subscription.status === 'PENDING') {
                    effectiveStatus = 'AWAITING_PACKAGE'
                } else if (
                    operation.status === 'AWAITING_CAPTCHA' &&
                    ['PAID', 'PROCESSING'].includes(subscription.status)
                ) {
                    effectiveStatus = 'AWAITING_CAPTCHA'
                } else if (operation.status === 'COMPLETING') {
                    effectiveStatus = 'COMPLETING'
                } else if (operation.status === 'COMPLETED') {
                    effectiveStatus = 'COMPLETED'
                } else if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(operation.status)) {
                    // A terminal provider operation still needs a separate atomic cash/credit settlement.
                    settlementPending = true
                }
            }
        }

        // 5. Build response based on status
        const response: Record<string, unknown> = {
            id: subscription.id,
            cardNumber: subscription.cardNumber,
            status: effectiveStatus,
            currency: subscription.currency,
            price: subscription.price,
            packageName: subscription.packageName,
            creditUsed: subscription.creditUsed,
            createdAt: subscription.createdAt.toISOString(),
            updatedAt: subscription.updatedAt.toISOString(),
            ...(settlementPending && {
                settlementPending: true,
                settlementReasonCode: 'STORE_SUBSCRIPTION_SETTLEMENT_PENDING',
            }),
        }

        // Add status-specific data
        switch (effectiveStatus) {
            case 'AWAITING_PACKAGE':
                // Include available packages with markup
                if (operation?.availablePackages) {
                    const packages = operation.availablePackages as unknown as AvailablePackage[]
                    response.packages = applyMarkupToPackages(packages, subscription.markupPercent)
                    response.stbNumber = operation.stbNumber
                }
                break

            case 'AWAITING_CAPTCHA':
                // Include captcha info
                if (operation?.captchaImage) {
                    const expiryTime = operation.captchaExpiry ? new Date(operation.captchaExpiry).getTime() : 0
                    const now = Date.now()
                    response.captcha = {
                        image: operation.captchaImage,
                        expiresIn: Math.max(0, Math.floor((expiryTime - now) / 1000)),
                    }
                }
                break

            case 'COMPLETED':
                response.completedAt = subscription.completedAt?.toISOString()
                response.resultMessage = operation?.responseMessage || 'Renewal completed successfully'
                break

            case 'FAILED':
                response.failedAt = subscription.failedAt?.toISOString()
                response.error = subscription.resultMessage || operation?.error || 'Operation failed'
                break
        }

        return successResponse({ subscription: response })

    } catch (error) {
        return handleApiError(error)
    }
}
