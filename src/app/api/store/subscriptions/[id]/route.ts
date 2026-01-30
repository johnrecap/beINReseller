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
            return errorResponse('غير مصرح', 401, 'UNAUTHORIZED')
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
            return errorResponse('الاشتراك غير موجود', 404, 'NOT_FOUND')
        }
        
        // 3. Check ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('غير مصرح بالوصول لهذا الاشتراك', 403, 'FORBIDDEN')
        }
        
        // 4. Sync status from operation if needed
        const operation = subscription.operation
        if (operation) {
            // Update subscription status based on operation status
            let newStatus = subscription.status
            
            switch (operation.status) {
                case 'AWAITING_PACKAGE':
                    if (subscription.status === 'PENDING') {
                        newStatus = 'AWAITING_PACKAGE'
                    }
                    break
                case 'AWAITING_CAPTCHA':
                    if (subscription.status === 'PAID' || subscription.status === 'PROCESSING') {
                        newStatus = 'AWAITING_CAPTCHA'
                    }
                    break
                case 'COMPLETING':
                    if (subscription.status !== 'COMPLETED') {
                        newStatus = 'COMPLETING'
                    }
                    break
                case 'COMPLETED':
                    newStatus = 'COMPLETED'
                    break
                case 'FAILED':
                case 'CANCELLED':
                case 'EXPIRED':
                    newStatus = 'FAILED'
                    break
            }
            
            if (newStatus !== subscription.status) {
                await prisma.storeSubscription.update({
                    where: { id: subscription.id },
                    data: { 
                        status: newStatus,
                        ...(newStatus === 'COMPLETED' && { completedAt: new Date() }),
                        ...(newStatus === 'FAILED' && { 
                            failedAt: new Date(),
                            resultMessage: operation.error || operation.responseMessage 
                        }),
                    }
                })
                subscription.status = newStatus
            }
        }
        
        // 5. Build response based on status
        const response: Record<string, unknown> = {
            id: subscription.id,
            cardNumber: `****${subscription.cardNumber.slice(-4)}`,
            status: subscription.status,
            currency: subscription.currency,
            price: subscription.price,
            packageName: subscription.packageName,
            creditUsed: subscription.creditUsed,
            createdAt: subscription.createdAt.toISOString(),
            updatedAt: subscription.updatedAt.toISOString(),
        }
        
        // Add status-specific data
        switch (subscription.status) {
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
                response.resultMessage = operation?.responseMessage || 'تم التجديد بنجاح'
                break
                
            case 'FAILED':
                response.failedAt = subscription.failedAt?.toISOString()
                response.error = subscription.resultMessage || operation?.error || 'فشلت العملية'
                break
        }
        
        return successResponse({ subscription: response })
        
    } catch (error) {
        return handleApiError(error)
    }
}
