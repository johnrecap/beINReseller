/**
 * Notification Service
 * 
 * Helper functions for creating and managing notifications.
 */

import prisma from '@/lib/prisma'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface CreateNotificationOptions {
    userId: string
    title: string
    message: string
    type?: NotificationType
    link?: string
}

/**
 * Create a notification for a user
 */
export async function createNotification({
    userId,
    title,
    message,
    type = 'info',
    link,
}: CreateNotificationOptions) {
    return prisma.notification.create({
        data: {
            userId,
            title,
            message,
            type,
            link,
        },
    })
}

/**
 * Notify about operation completion
 */
export async function notifyOperationCompleted(
    userId: string,
    operationType: string,
    cardNumber: string,
    success: boolean
) {
    const maskedCard = cardNumber

    if (success) {
        await createNotification({
            userId,
            title: 'Operation completed successfully',
            message: `Operation ${getOperationTypeLabel(operationType)} completed for card ${maskedCard}`,
            type: 'success',
            link: '/dashboard/history',
        })
    } else {
        await createNotification({
            userId,
            title: 'Operation failed',
            message: `Operation ${getOperationTypeLabel(operationType)} failed for card ${maskedCard}. Amount has been refunded.`,
            type: 'error',
            link: '/dashboard/history',
        })
    }
}

/**
 * Notify about balance addition
 */
export async function notifyBalanceAdded(
    userId: string,
    amount: number,
    newBalance: number
) {
    await createNotification({
        userId,
        title: 'Balance added',
        message: `${amount.toFixed(2)} added to your account. Current balance: ${newBalance.toFixed(2)}`,
        type: 'success',
        link: '/dashboard/transactions',
    })
}

/**
 * Notify about low balance
 */
export async function notifyLowBalance(
    userId: string,
    currentBalance: number,
    threshold: number
) {
    await createNotification({
        userId,
        title: 'Alert: Low balance',
        message: `Your current balance (${currentBalance.toFixed(2)}) is below the alert threshold (${threshold.toFixed(2)}). Please top up.`,
        type: 'warning',
        link: '/dashboard',
    })
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
        where: { userId, read: false },
    })
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { read: true },
    })
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
    })
}

function getOperationTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        RENEW: 'Renewal',
        CHECK_BALANCE: 'Balance Inquiry',
        SIGNAL_REFRESH: 'Signal Refresh',
    }
    return labels[type] || type
}
