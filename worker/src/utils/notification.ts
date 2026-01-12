/**
 * Notification Service (Worker)
 * 
 * Helper functions for creating notifications from the worker.
 */

import { prisma } from '../lib/prisma'

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
