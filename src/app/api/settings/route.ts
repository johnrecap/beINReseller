import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

// Allow public read or restricted? 
// For now, let's say some settings might be public (maintenance), but for this API it's the ADMIN management API.
// We might need a separate public endpoint or use this one with filtering. 
// Given the requirements, this seems to be the ADMIN route.

export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id || authUser.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const settings = await prisma.setting.findMany()

        // Convert to object
        const settingsMap = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value
            return acc
        }, {} as Record<string, string>)

        return NextResponse.json(settingsMap)

    } catch (error) {
        console.error('Get settings error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id || authUser.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        // Rate Limit
        const { allowed, result: limitResult } = await withRateLimit(
            `admin:${authUser.id}`,
            RATE_LIMITS.admin
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'تجاوزت الحد المسموح، انتظر قليلاً' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

        const body = await request.json()
        // Body is expected to be { key: value, key2: value2 }

        const updates = Object.entries(body).map(([key, value]) => {
            return prisma.setting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) }
            })
        })

        await prisma.$transaction(updates)

        // Filter sensitive data for logging
        const SENSITIVE_KEYS = [
            'bein_password',
            'bein_totp_secret',
            'captcha_2captcha_key'
        ]

        const safeDetails = Object.fromEntries(
            Object.entries(body).map(([key, value]) => [
                key,
                SENSITIVE_KEYS.includes(key) ? '********' : value
            ])
        )

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: authUser.id,
                action: 'ADMIN_UPDATE_SETTINGS',
                details: JSON.stringify(safeDetails),
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' })

    } catch (error) {
        console.error('Update settings error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
