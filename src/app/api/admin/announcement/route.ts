import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { createAnnouncementSchema } from '@/lib/announcement'

/**
 * GET /api/admin/announcement
 * List all announcement banners (admin only)
 */
export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
        }

        const banners = await prisma.announcementBanner.findMany({
            orderBy: { createdAt: 'desc' }
        })

        return NextResponse.json({
            success: true,
            banners
        })
    } catch (error) {
        console.error('Error fetching banners:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to fetch banners' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/admin/announcement
 * Create a new announcement banner (admin only)
 */
export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json()
        const parsed = createAnnouncementSchema.safeParse(body)

        if (!parsed.success) {
            const firstError = parsed.error.issues[0]?.message || 'Invalid data'
            return NextResponse.json(
                { success: false, error: firstError },
                { status: 400 }
            )
        }

        const {
            message,
            isActive,
            animationType,
            colors,
            textSize,
            position,
            startDate,
            endDate,
            imageUrl,
            imageAlt,
        } = parsed.data

        // If making this banner active, deactivate others (in a transaction)
        const banner = await prisma.$transaction(async (tx) => {
            if (isActive) {
                await tx.announcementBanner.updateMany({
                    where: { isActive: true },
                    data: { isActive: false }
                })
            }

            return tx.announcementBanner.create({
                data: {
                    message: message || '',
                    imageUrl: imageUrl ?? null,
                    imageAlt: imageAlt ?? null,
                    isActive,
                    animationType,
                    colors,
                    textSize,
                    position,
                    startDate: startDate ?? null,
                    endDate: endDate ?? null,
                }
            })
        })

        return NextResponse.json({
            success: true,
            banner
        })
    } catch (error) {
        console.error('Error creating banner:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to create banner' },
            { status: 500 }
        )
    }
}
