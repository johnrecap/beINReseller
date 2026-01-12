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
    const maskedCard = cardNumber.slice(0, 4) + '****' + cardNumber.slice(-4)

    if (success) {
        await createNotification({
            userId,
            title: 'تمت العملية بنجاح',
            message: `تم تنفيذ عملية ${getOperationTypeLabel(operationType)} للكارت ${maskedCard}`,
            type: 'success',
            link: '/dashboard/history',
        })
    } else {
        await createNotification({
            userId,
            title: 'فشلت العملية',
            message: `فشل تنفيذ عملية ${getOperationTypeLabel(operationType)} للكارت ${maskedCard}. تم استرداد المبلغ.`,
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
        title: 'تم إضافة رصيد',
        message: `تم إضافة ${amount.toFixed(2)} ر.س لحسابك. رصيدك الحالي: ${newBalance.toFixed(2)} ر.س`,
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
        title: 'تنبيه: رصيد منخفض',
        message: `رصيدك الحالي (${currentBalance.toFixed(2)} ر.س) أقل من الحد المنبه (${threshold.toFixed(2)} ر.س). قم بشحن رصيدك.`,
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
        RENEW: 'تجديد',
        CHECK_BALANCE: 'استعلام رصيد',
        SIGNAL_REFRESH: 'تحديث إشارة',
    }
    return labels[type] || type
}
