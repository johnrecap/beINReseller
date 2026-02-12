/**
 * Notification Service (Worker)
 * 
 * Helper functions for creating notifications from the worker.
 */

import { prisma } from '../lib/prisma'
import { getRedisConnection } from '../lib/redis'

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

// ===== Low Balance Admin Alerts =====

const LOW_BALANCE_ALERT_COOLDOWN_KEY = 'bein:low_balance_alert:'
const ALERT_COOLDOWN_SECONDS = 3600  // 1 hour between alerts per account

/**
 * Get the low balance alert threshold from database settings
 * Default: 300 USD
 */
async function getLowBalanceThreshold(): Promise<number> {
    try {
        const setting = await prisma.setting.findUnique({
            where: { key: 'min_dealer_balance_alert' }
        })
        return setting?.value ? parseFloat(setting.value) : 300
    } catch {
        return 300
    }
}

/**
 * Notify all admins when a beIN account has low balance
 * 
 * Features:
 * - Only sends if the account has lowBalanceAlertEnabled = true
 * - Includes cooldown to prevent spam (max 1 alert per account per hour)
 * - Uses configurable threshold from database settings
 * 
 * @param accountId - The beIN account ID
 * @param accountName - Display name for the account
 * @param currentBalance - Current dealer balance in USD
 * @param requiredBalance - Required balance for the operation (optional)
 */
export async function notifyAdminLowBalance(
    accountId: string,
    accountName: string,
    currentBalance: number,
    requiredBalance?: number
): Promise<void> {
    try {
        // Check if alerts are enabled for this account
        const account = await prisma.beinAccount.findUnique({
            where: { id: accountId },
            select: { lowBalanceAlertEnabled: true }
        })
        
        if (!account?.lowBalanceAlertEnabled) {
            console.log(`[Notification] Low balance alert disabled for ${accountName}, skipping`)
            return
        }
        
        // Check if we already sent an alert recently (cooldown)
        const redis = getRedisConnection()
        const alertKey = `${LOW_BALANCE_ALERT_COOLDOWN_KEY}${accountId}`
        const recentAlert = await redis.get(alertKey)
        
        if (recentAlert) {
            console.log(`[Notification] Skipping low balance alert for ${accountName} (recent alert exists)`)
            return
        }
        
        // Get all admin users
        const admins = await prisma.user.findMany({
            where: { role: 'ADMIN', isActive: true },
            select: { id: true }
        })
        
        if (admins.length === 0) {
            console.log('[Notification] No admin users found for low balance alert')
            return
        }
        
        // Build message
        const threshold = await getLowBalanceThreshold()
        const message = requiredBalance
            ? `Account "${accountName}" - Current balance: ${currentBalance} USD. Required for operation: ${requiredBalance} USD`
            : `Account "${accountName}" - Current balance: ${currentBalance} USD (below ${threshold} USD)`
        
        // Create notification for each admin
        await prisma.notification.createMany({
            data: admins.map(admin => ({
                userId: admin.id,
                title: '⚠️ beIN account balance low',
                message,
                type: 'warning',
                link: '/admin/bein-accounts'
            }))
        })
        
        // Set cooldown (1 hour)
        await redis.setex(alertKey, ALERT_COOLDOWN_SECONDS, '1')
        
        console.log(`[Notification] 📧 Notified ${admins.length} admins about low balance for ${accountName}`)
    } catch (error: any) {
        console.error(`[Notification] Failed to send low balance alert: ${error.message}`)
    }
}

/**
 * Check if an account's balance is below the threshold and notify if needed
 * Used for proactive monitoring during keep-alive
 * 
 * @param accountId - The beIN account ID
 * @param accountName - Display name
 * @param currentBalance - Current balance
 */
export async function checkAndNotifyLowBalance(
    accountId: string,
    accountName: string,
    currentBalance: number | null
): Promise<void> {
    if (currentBalance === null) return
    
    const threshold = await getLowBalanceThreshold()
    if (currentBalance < threshold) {
        await notifyAdminLowBalance(accountId, accountName, currentBalance)
    }
}
