import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Allow public read or restricted? 
// For now, let's say some settings might be public (maintenance), but for this API it's the ADMIN management API.
// We might need a separate public endpoint or use this one with filtering. 
// Given the requirements, this seems to be the ADMIN route.

export async function GET(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
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

export async function PUT(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
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

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: session.user.id,
                action: 'ADMIN_UPDATE_SETTINGS',
                details: JSON.stringify(body),
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' })

    } catch (error) {
        console.error('Update settings error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
