/**
 * Store Subscription Heartbeat
 * POST /api/store/subscriptions/[id]/heartbeat
 * 
 * Keeps the subscription alive by updating the lastHeartbeat timestamp.
 * This prevents auto-cancellation of active subscriptions.
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        
        // 1. Get authenticated customer
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('غير مصرح', 401, 'UNAUTHORIZED')
        }
        
        // 2. Find subscription
        const subscription = await prisma.storeSubscription.findUnique({
            where: { id },
            select: {
                id: true,
                customerId: true,
                operationId: true,
                status: true,
            }
        })
        
        if (!subscription) {
            return errorResponse('الاشتراك غير موجود', 404, 'NOT_FOUND')
        }
        
        // 3. Verify ownership
        if (subscription.customerId !== customer.id) {
            return errorResponse('غير مصرح بالوصول', 403, 'FORBIDDEN')
        }
        
        // 4. Update heartbeat on the operation if exists
        if (subscription.operationId) {
            const now = new Date()
            const heartbeatExpiry = new Date(now.getTime() + 60 * 1000) // 60 seconds from now
            
            await prisma.operation.update({
                where: { id: subscription.operationId },
                data: {
                    lastHeartbeat: now,
                    heartbeatExpiry: heartbeatExpiry,
                }
            }).catch(() => {}) // Ignore if operation doesn't exist
        }
        
        // 5. Update subscription updatedAt
        await prisma.storeSubscription.update({
            where: { id },
            data: { updatedAt: new Date() }
        })
        
        return successResponse({
            alive: true,
            timestamp: new Date().toISOString()
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
