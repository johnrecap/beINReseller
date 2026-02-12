import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

const poolSettings = [
    { key: 'pool_round_robin_enabled', value: 'true' },
    { key: 'pool_max_requests_per_account', value: '5' },
    { key: 'pool_rate_limit_window_seconds', value: '300' },
    { key: 'pool_cooldown_after_failures', value: '3' },
    { key: 'pool_cooldown_duration_seconds', value: '600' },
    { key: 'pool_min_delay_ms', value: '2000' },
    { key: 'pool_max_delay_ms', value: '5000' },
    { key: 'pool_random_delay_enabled', value: 'true' },
    { key: 'pool_max_consecutive_failures', value: '5' },
    { key: 'pool_auto_disable_on_error', value: 'true' },
]

// POST /api/admin/seed-pool-settings - Seed Pool settings (Admin only)
export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const results = []

        // Seed Pool settings
        for (const setting of poolSettings) {
            await prisma.setting.upsert({
                where: { key: setting.key },
                update: { value: setting.value },
                create: setting,
            })
            results.push(`✅ ${setting.key} = ${setting.value}`)
        }

        // Check for existing beIN account in settings and migrate
        const username = await prisma.setting.findUnique({ where: { key: 'bein_username' } })
        const password = await prisma.setting.findUnique({ where: { key: 'bein_password' } })
        const totpSecret = await prisma.setting.findUnique({ where: { key: 'bein_totp_secret' } })

        let accountMigrated = false
        if (username?.value && password?.value) {
            const existing = await prisma.beinAccount.findUnique({
                where: { username: username.value }
            })

            if (!existing) {
                await prisma.beinAccount.create({
                    data: {
                        username: username.value,
                        password: password.value,
                        totpSecret: totpSecret?.value || null,
                        label: 'Original account',
                        isActive: true,
                        priority: 10,
                    }
                })
                accountMigrated = true
                results.push(`✅ Migrated existing account: ${username.value}`)
            } else {
                results.push(`⏭️ Account already exists: ${username.value}`)
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Pool settings seeded successfully',
            accountMigrated,
            results,
        })

    } catch (error) {
        console.error('Seed Pool settings error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// GET /api/admin/seed-pool-settings - Get current Pool settings (Admin only)
export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const settings = await prisma.setting.findMany({
            where: { key: { startsWith: 'pool_' } }
        })

        return NextResponse.json({
            success: true,
            settings: settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {}),
        })

    } catch (error) {
        console.error('Get Pool settings error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
