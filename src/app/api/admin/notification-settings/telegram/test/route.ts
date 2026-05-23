import { NextRequest, NextResponse } from 'next/server'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { getNotificationSettings } from '@/lib/credit-requests/notifications'
import { sendTelegramMessage } from '@/lib/credit-requests/telegram'

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const settings = await getNotificationSettings()

        const token = settings?.telegramBotTokenEncrypted?.trim()
        const targetId = settings?.telegramTargetId?.trim()
        if (!settings || !token || !targetId) {
            return NextResponse.json(
                { error: 'Telegram bot token and target id are required before testing' },
                { status: 400 }
            )
        }

        const sent = await sendTelegramMessage({
            botToken: token,
            targetId,
            message: `Panel Telegram test message\nAdmin: ${authResult.user.username}`,
            timeoutMs: Number(process.env.TELEGRAM_TIMEOUT_MS || 5000),
        })

        await prisma.activityLog.create({
            data: {
                userId: authResult.user.id,
                action: 'ADMIN_TELEGRAM_NOTIFICATION_TEST',
                targetId: settings.id,
                targetType: 'NotificationSetting',
                details: {
                    status: 'SENT',
                    targetLabel: settings.telegramTargetLabel,
                    providerMessageId: sent.providerMessageId || null,
                },
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            },
        })

        return NextResponse.json({
            success: true,
            status: 'SENT',
            providerMessageId: sent.providerMessageId || null,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Telegram test failed'
        console.error('Admin Telegram test error:', message)
        return NextResponse.json({ error: message }, { status: 502 })
    }
}
