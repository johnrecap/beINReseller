import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
    formatCreditRequestTelegramMessage,
    sendTelegramMessage,
} from '@/lib/credit-requests/telegram'

type CreditRequestTelegramNotificationInput = {
    creditRequestId: string
    requestNumber: string
    username: string
    amountUsd: number
    paymentMethod: string
    agentId: string
    agentName: string
    sourceGroup: string
}

type NotificationResult = {
    attempted: boolean
    provider: 'TELEGRAM'
    targetType: 'TELEGRAM_CHAT'
    targetLabel: string | null
    status: 'PENDING' | 'SENT' | 'FAILED' | 'DISABLED'
    error?: string | null
}

const NOTIFICATION_SETTINGS_SINGLETON_KEY = 'default'

function summarizeError(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 500) : 'Unknown Telegram error'
}

export async function getNotificationSettings() {
    return prisma.notificationSetting.upsert({
        where: { singletonKey: NOTIFICATION_SETTINGS_SINGLETON_KEY },
        update: {},
        create: {
            singletonKey: NOTIFICATION_SETTINGS_SINGLETON_KEY,
        },
    })
}

export async function upsertNotificationSettings(data: {
    telegramEnabled: boolean
    telegramBotTokenEncrypted: string | null
    telegramTargetId: string | null
    telegramTargetLabel: string | null
    defaultWhatsappGroupUrl: string | null
    defaultWhatsappPhone: string | null
    defaultWhatsappLabel: string | null
    updatedByAdminId: string
}) {
    return prisma.notificationSetting.upsert({
        where: { singletonKey: NOTIFICATION_SETTINGS_SINGLETON_KEY },
        update: data,
        create: {
            singletonKey: NOTIFICATION_SETTINGS_SINGLETON_KEY,
            ...data,
        },
    })
}

export async function sendCreditRequestTelegramNotification(
    input: CreditRequestTelegramNotificationInput
): Promise<NotificationResult> {
    const settings = await getNotificationSettings()
    const targetId = settings?.telegramTargetId?.trim() || ''
    const targetLabel = settings?.telegramTargetLabel?.trim() || targetId || null
    const token = settings?.telegramBotTokenEncrypted?.trim() || ''
    const message = formatCreditRequestTelegramMessage(input)

    const log = await prisma.whatsAppNotificationLog.create({
        data: {
            eventType: 'CREDIT_REQUEST_CREATED',
            provider: 'TELEGRAM',
            targetType: 'TELEGRAM_CHAT',
            targetGroupId: targetId || null,
            targetGroupNameSnapshot: targetLabel,
            creditRequestId: input.creditRequestId,
            agentId: input.agentId,
            payloadSummary: message,
            status: 'PENDING',
        },
        select: { id: true },
    })

    if (!settings?.telegramEnabled || !targetId || !token) {
        const error = !settings?.telegramEnabled
            ? 'Telegram notifications are disabled'
            : !targetId
                ? 'Missing Telegram target id'
                : 'Missing Telegram bot token'

        await prisma.whatsAppNotificationLog.update({
            where: { id: log.id },
            data: {
                status: 'DISABLED',
                error,
                attemptCount: 0,
                lastAttemptAt: new Date(),
            },
        })

        return {
            attempted: false,
            provider: 'TELEGRAM',
            targetType: 'TELEGRAM_CHAT',
            targetLabel,
            status: 'DISABLED',
            error,
        }
    }

    try {
        const sent = await sendTelegramMessage({
            botToken: token,
            targetId,
            message,
            timeoutMs: Number(process.env.TELEGRAM_TIMEOUT_MS || 5000),
        })

        await prisma.whatsAppNotificationLog.update({
            where: { id: log.id },
            data: {
                status: 'SENT',
                providerMessageId: sent.providerMessageId,
                providerResponse: sent.responseSummary as Prisma.InputJsonValue,
                attemptCount: 1,
                lastAttemptAt: new Date(),
                sentAt: new Date(),
            },
        })

        return {
            attempted: true,
            provider: 'TELEGRAM',
            targetType: 'TELEGRAM_CHAT',
            targetLabel,
            status: 'SENT',
            error: null,
        }
    } catch (error) {
        const messageText = summarizeError(error)
        await prisma.whatsAppNotificationLog.update({
            where: { id: log.id },
            data: {
                status: 'FAILED',
                error: messageText,
                attemptCount: 1,
                lastAttemptAt: new Date(),
            },
        })

        return {
            attempted: true,
            provider: 'TELEGRAM',
            targetType: 'TELEGRAM_CHAT',
            targetLabel,
            status: 'FAILED',
            error: messageText,
        }
    }
}
