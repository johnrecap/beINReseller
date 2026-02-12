/**
 * Store Subscription Captcha
 * GET /api/store/subscriptions/[id]/captcha - Get captcha image
 * POST /api/store/subscriptions/[id]/captcha - Submit captcha solution
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * GET - Returns the captcha image
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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
                        status: true,
                        captchaImage: true,
                        captchaExpiry: true,
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
        if (subscription.status !== 'AWAITING_CAPTCHA' && subscription.operation?.status !== 'AWAITING_CAPTCHA') {
            return errorResponse('Subscription does not require captcha currently', 400, 'CAPTCHA_NOT_REQUIRED')
        }
        
        // 5. Get captcha from operation
        const operation = subscription.operation
        if (!operation?.captchaImage) {
            return errorResponse('Captcha image not available', 404, 'NO_CAPTCHA')
        }
        
        // 6. Calculate expiry time
        const expiryTime = operation.captchaExpiry ? new Date(operation.captchaExpiry).getTime() : 0
        const now = Date.now()
        const expiresIn = Math.max(0, Math.floor((expiryTime - now) / 1000))
        
        return successResponse({
            captchaImage: operation.captchaImage,
            expiresIn,
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}

/**
 * POST - Submits the captcha solution
 */
const submitCaptchaSchema = z.object({
    solution: z.string().min(1, 'Captcha solution is required'),
})

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
        const result = submitCaptchaSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const { solution } = result.data
        
        // 3. Get subscription with operation
        const subscription = await prisma.storeSubscription.findUnique({
            where: { id },
            include: {
                operation: {
                    select: {
                        id: true,
                        status: true,
                    }
                }
            }
        })
        
        if (!subscription) {
            return errorResponse('Subscription not found', 404, 'NOT_FOUND')
        }
        
        // 4. Check ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('Unauthorized access to this subscription', 403, 'FORBIDDEN')
        }
        
        // 5. Check status
        if (subscription.operation?.status !== 'AWAITING_CAPTCHA') {
            return errorResponse('Subscription does not require captcha currently', 400, 'CAPTCHA_NOT_REQUIRED')
        }
        
        // 6. Update operation with captcha solution
        await prisma.operation.update({
            where: { id: subscription.operation.id },
            data: { captchaSolution: solution }
        })
        
        // 7. Update subscription status
        await prisma.storeSubscription.update({
            where: { id: subscription.id },
            data: { status: 'COMPLETING' }
        })
        
        return successResponse({
            subscriptionId: subscription.id,
            status: 'COMPLETING',
            message: 'Captcha submitted. Processing operation...',
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
