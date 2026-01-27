/**
 * Activity Tracker - Worker Version
 * 
 * Lightweight activity tracking for the worker process.
 * Updates user stats when operations complete.
 */

import { prisma } from './prisma';

/**
 * Track operation completion in the worker.
 * Updates user's lastOperationAt and totalOperations.
 */
export async function trackOperationComplete(
    userId: string,
    operationId: string,
    operationType: string,
    amount?: number,
    metadata?: Record<string, unknown>
): Promise<void> {
    try {
        await prisma.$transaction([
            // Update user activity stats
            prisma.user.update({
                where: { id: userId },
                data: {
                    lastOperationAt: new Date(),
                    totalOperations: { increment: 1 }
                }
            }),
            // Create activity log
            prisma.activityLog.create({
                data: {
                    userId,
                    action: 'OPERATION_COMPLETE',
                    targetId: operationId,
                    targetType: 'Operation',
                    details: { operationType, amount, ...metadata }
                }
            })
        ]);
    } catch (error) {
        // Don't fail the operation if tracking fails
        console.error('[ActivityTracker] Failed to track operation completion:', error);
    }
}

/**
 * Track operation start
 */
export async function trackOperationStart(
    userId: string,
    operationId: string,
    operationType: string,
    cardNumber?: string
): Promise<void> {
    try {
        await prisma.activityLog.create({
            data: {
                userId,
                action: 'OPERATION_START',
                targetId: operationId,
                targetType: 'Operation',
                details: { 
                    operationType, 
                    cardNumber: cardNumber ? `****${cardNumber.slice(-4)}` : undefined 
                }
            }
        });
    } catch (error) {
        console.error('[ActivityTracker] Failed to track operation start:', error);
    }
}

/**
 * Track operation failure
 */
export async function trackOperationFail(
    userId: string,
    operationId: string,
    operationType: string,
    reason?: string
): Promise<void> {
    try {
        await prisma.activityLog.create({
            data: {
                userId,
                action: 'OPERATION_FAIL',
                targetId: operationId,
                targetType: 'Operation',
                details: { operationType, reason }
            }
        });
    } catch (error) {
        console.error('[ActivityTracker] Failed to track operation failure:', error);
    }
}

export default {
    trackOperationComplete,
    trackOperationStart,
    trackOperationFail
};
