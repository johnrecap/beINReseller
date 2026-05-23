import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { notificationSettingsSchema } from '@/lib/credit-requests/types'
import {
    getNotificationSettings,
    upsertNotificationSettings,
} from '@/lib/credit-requests/notifications'

function clean(value: string | null | undefined) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

function maskToken(value: string | null | undefined) {
    if (!value) return null
    if (value.length <= 8) return '********'
    return `${value.slice(0, 4)}...${value.slice(-4)}`
}

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const settings = await getNotificationSettings()

        return NextResponse.json({
            settings: {
                telegramEnabled: settings?.telegramEnabled ?? false,
                telegramBotTokenConfigured: Boolean(settings?.telegramBotTokenEncrypted),
                telegramBotTokenMasked: maskToken(settings?.telegramBotTokenEncrypted),
                telegramTargetId: settings?.telegramTargetId || '',
                telegramTargetLabel: settings?.telegramTargetLabel || '',
                defaultWhatsappGroupUrl: settings?.defaultWhatsappGroupUrl || '',
                defaultWhatsappPhone: settings?.defaultWhatsappPhone || '',
                defaultWhatsappLabel: settings?.defaultWhatsappLabel || '',
            },
        })
    } catch (error) {
        console.error('Admin notification settings list error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = notificationSettingsSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid notification settings data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const existing = await getNotificationSettings()
        const newToken = clean(parsed.data.telegramBotToken)
        const tokenValue = parsed.data.clearTelegramBotToken
            ? null
            : newToken ?? existing?.telegramBotTokenEncrypted ?? null

        const saved = await upsertNotificationSettings({
            telegramEnabled: parsed.data.telegramEnabled,
            telegramBotTokenEncrypted: tokenValue,
            telegramTargetId: clean(parsed.data.telegramTargetId),
            telegramTargetLabel: clean(parsed.data.telegramTargetLabel),
            defaultWhatsappGroupUrl: clean(parsed.data.defaultWhatsappGroupUrl),
            defaultWhatsappPhone: clean(parsed.data.defaultWhatsappPhone),
            defaultWhatsappLabel: clean(parsed.data.defaultWhatsappLabel),
            updatedByAdminId: authResult.user.id,
        })

        await prisma.activityLog.create({
            data: {
                userId: authResult.user.id,
                action: 'ADMIN_NOTIFICATION_SETTINGS_UPDATED',
                targetId: saved.id,
                targetType: 'NotificationSetting',
                details: {
                    telegramEnabled: saved.telegramEnabled,
                    telegramTargetLabel: saved.telegramTargetLabel,
                    telegramBotTokenConfigured: Boolean(saved.telegramBotTokenEncrypted),
                    defaultWhatsappLabel: saved.defaultWhatsappLabel,
                },
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            },
        })

        return NextResponse.json({
            success: true,
            settings: {
                telegramEnabled: saved.telegramEnabled,
                telegramBotTokenConfigured: Boolean(saved.telegramBotTokenEncrypted),
                telegramBotTokenMasked: maskToken(saved.telegramBotTokenEncrypted),
                telegramTargetId: saved.telegramTargetId || '',
                telegramTargetLabel: saved.telegramTargetLabel || '',
                defaultWhatsappGroupUrl: saved.defaultWhatsappGroupUrl || '',
                defaultWhatsappPhone: saved.defaultWhatsappPhone || '',
                defaultWhatsappLabel: saved.defaultWhatsappLabel || '',
            },
        })
    } catch (error) {
        console.error('Admin notification settings update error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
