/**
 * Store Subscription Utilities
 * 
 * Helper functions for handling subscription status changes,
 * particularly for failed operations (refund to store credit).
 */

import prisma from '@/lib/prisma'

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
    const subscription = await prisma.storeSubscription.findUnique({
        where: { id: subscriptionId },
        include: {
            payment: true,
            customer: true,
        }
    })
    
    if (!subscription) return
    
    // Only process if subscription was paid
    if (subscription.status !== 'PAID' && subscription.status !== 'PROCESSING' && 
        subscription.status !== 'AWAITING_CAPTCHA' && subscription.status !== 'COMPLETING') {
        return
    }
    
    // Calculate amount to refund to store credit
    // This is the actual amount paid (not including credit used)
    const amountPaid = subscription.price - subscription.creditUsed
    
    // Refund full price to store credit (including credit used + new payment)
    const totalRefund = subscription.price
    
    await prisma.$transaction([
        // Update subscription status
        prisma.storeSubscription.update({
            where: { id: subscriptionId },
            data: {
                status: 'FAILED',
                failedAt: new Date(),
                resultMessage: errorMessage || 'فشلت العملية',
            }
        }),
        // Add store credit
        prisma.customer.update({
            where: { id: subscription.customerId },
            data: {
                storeCredit: { increment: totalRefund }
            }
        })
    ])
    
    console.log(`[Store] Subscription ${subscriptionId} failed. Added ${totalRefund} ${subscription.currency} to customer ${subscription.customerId} store credit.`)
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
            await prisma.storeSubscription.update({
                where: { id: subscription.id },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    resultMessage: operation.responseMessage || 'تم التجديد بنجاح',
                }
            })
            break
            
        case 'FAILED':
        case 'CANCELLED':
        case 'EXPIRED':
            await handleFailedSubscription(
                subscription.id,
                operation.error || operation.responseMessage || 'فشلت العملية'
            )
            break
            
        case 'AWAITING_CAPTCHA':
            await prisma.storeSubscription.update({
                where: { id: subscription.id },
                data: { status: 'AWAITING_CAPTCHA' }
            })
            break
            
        case 'AWAITING_PACKAGE':
            await prisma.storeSubscription.update({
                where: { id: subscription.id },
                data: { status: 'AWAITING_PACKAGE' }
            })
            break
    }
}
