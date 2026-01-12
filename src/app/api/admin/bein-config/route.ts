import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'

// All beIN-related setting keys
const BEIN_SETTINGS_KEYS = [
    // Credentials
    'bein_username',
    'bein_password',
    'bein_totp_secret',

    // Captcha
    'captcha_2captcha_key',
    'captcha_enabled',

    // URLs
    'bein_login_url',
    'bein_renew_url',
    'bein_check_url',
    'bein_signal_url',

    // Login Selectors
    'bein_sel_username',
    'bein_sel_password',
    'bein_sel_2fa',
    'bein_sel_captcha_img',
    'bein_sel_captcha_input',
    'bein_sel_submit',

    // Renew Selectors
    'bein_sel_card_input',
    'bein_sel_duration',
    'bein_sel_renew_submit',
    'bein_sel_success_msg',
    'bein_sel_error_msg',

    // Check Balance Selectors
    'bein_sel_check_card',
    'bein_sel_check_submit',
    'bein_sel_balance_result',

    // Advanced
    'worker_session_timeout',
    'worker_max_retries',
    'worker_headless',
]

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const settings = await prisma.setting.findMany({
            where: {
                key: { in: BEIN_SETTINGS_KEYS }
            }
        })

        // Convert to object, masking sensitive values
        const config: Record<string, string> = {}

        settings.forEach(s => {
            // Mask sensitive fields
            if (s.key === 'bein_password' && s.value) {
                config[s.key] = '••••••••'
            } else if (s.key === 'bein_totp_secret' && s.value) {
                config[s.key] = s.value.slice(0, 4) + '••••••••'
            } else if (s.key === 'captcha_2captcha_key' && s.value) {
                config[s.key] = '••••••••' + s.value.slice(-4)
            } else {
                config[s.key] = s.value
            }
        })

        return NextResponse.json(config)

    } catch (error) {
        console.error('Get beIN config error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}

export async function PUT(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const body = await request.json()

        // Filter to only allow known keys
        const updates = Object.entries(body).filter(([key]) =>
            BEIN_SETTINGS_KEYS.includes(key)
        )

        // Skip masked values (don't overwrite with masked data)
        const validUpdates = updates.filter(([key, value]) => {
            const val = value as string
            if (key === 'bein_password' && val === '••••••••') return false
            if (key === 'bein_totp_secret' && val.includes('••••••••')) return false
            if (key === 'captcha_2captcha_key' && val.startsWith('••••••••')) return false
            return true
        })

        // Upsert all settings
        const upserts = validUpdates.map(([key, value]) => {
            return prisma.setting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) }
            })
        })

        await prisma.$transaction(upserts)

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: session.user.id,
                action: 'ADMIN_UPDATE_BEIN_CONFIG',
                details: JSON.stringify({ keysUpdated: validUpdates.map(([k]) => k) }),
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({ success: true, message: 'تم حفظ إعدادات beIN بنجاح' })

    } catch (error) {
        console.error('Update beIN config error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
