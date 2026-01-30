/**
 * Admin Store Settings API
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const settings = await prisma.storeSetting.findMany()
        
        // Convert to object
        const settingsObj: Record<string, string> = {}
        settings.forEach(s => {
            settingsObj[s.key] = s.value
        })

        return NextResponse.json({ success: true, data: settingsObj })
    } catch (error) {
        console.error('Error fetching settings:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json()

        // Update each setting
        const updates = Object.entries(body).map(([key, value]) =>
            prisma.storeSetting.upsert({
                where: { key },
                create: { key, value: String(value) },
                update: { value: String(value) },
            })
        )

        await Promise.all(updates)

        return NextResponse.json({ success: true, message: 'Settings updated' })
    } catch (error) {
        console.error('Error updating settings:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
