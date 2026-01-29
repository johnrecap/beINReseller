import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

// All beIN-related setting keys
// NOTE: Credentials (bein_username, bein_password, bein_totp_secret) are now stored
// in the BeinAccount table for multi-account support
const BEIN_SETTINGS_KEYS = [
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

    // Pool Settings (Account Distribution)
    'pool_max_requests_per_account',
    'pool_rate_limit_window_seconds',
    'pool_cooldown_after_failures',
    'pool_cooldown_duration_seconds',
    'pool_min_delay_ms',
    'pool_max_delay_ms',
    'pool_max_consecutive_failures',
    'pool_auto_disable_on_error',

    // Advanced Worker Settings
    'worker_session_timeout',
    'worker_max_retries',
    'worker_headless',

    // User Proxy Settings
    'user_proxy_limit',  // Number of users with proxy linked (display only)
]

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
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
            if (s.key === 'captcha_2captcha_key' && s.value) {
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

export async function PUT(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }
        const adminUser = authResult.user

        const body = await request.json()

        // Filter to only allow known keys
        const updates = Object.entries(body).filter(([key]) =>
            BEIN_SETTINGS_KEYS.includes(key)
        )

        // Skip masked values (don't overwrite with masked data)
        const validUpdates = updates.filter(([key, value]) => {
            const val = value as string
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
                userId: adminUser.id,
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
