import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'

function normalizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

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
        
        const {
            message,
            isActive = true,
            animationType = 'gradient',
            colors = [],
            textSize = 'medium',
            position = 'top',
            isDismissable = true,
            startDate,
            endDate,
            imageUrl,
            imageAlt
        } = body

        const normalizedMessage = normalizeOptionalText(message)
        const normalizedImageUrl = normalizeOptionalText(imageUrl)
        const normalizedImageAlt = normalizeOptionalText(imageAlt)

        // Validate content
        if (!normalizedMessage && !normalizedImageUrl) {
            return NextResponse.json(
                { success: false, error: 'Provide announcement text or image' },
                { status: 400 }
            )
        }
        if (normalizedMessage && normalizedMessage.length > 500) {
            return NextResponse.json(
                { success: false, error: 'Message must be under 500 characters' },
                { status: 400 }
            )
        }
        if (normalizedImageUrl && !normalizedImageUrl.startsWith('/uploads/')) {
            return NextResponse.json(
                { success: false, error: 'Invalid image URL' },
                { status: 400 }
            )
        }
        if (normalizedImageAlt && normalizedImageAlt.length > 120) {
            return NextResponse.json(
                { success: false, error: 'Image alt text must be under 120 characters' },
                { status: 400 }
            )
        }

        // Validate animation type
        const validAnimations = ['gradient', 'typing', 'glow', 'slide', 'marquee', 'none']
        if (!validAnimations.includes(animationType)) {
            return NextResponse.json(
                { success: false, error: 'Invalid animation type' },
                { status: 400 }
            )
        }

        // Validate text size
        const validSizes = ['small', 'medium', 'large']
        if (!validSizes.includes(textSize)) {
            return NextResponse.json(
                { success: false, error: 'Invalid text size' },
                { status: 400 }
            )
        }

        // Validate position
        const validPositions = ['top', 'bottom', 'floating']
        if (!validPositions.includes(position)) {
            return NextResponse.json(
                { success: false, error: 'Invalid position' },
                { status: 400 }
            )
        }

        // If making this banner active, deactivate others
        if (isActive) {
            await prisma.announcementBanner.updateMany({
                where: { isActive: true },
                data: { isActive: false }
            })
        }

        const banner = await prisma.announcementBanner.create({
            data: {
                message: normalizedMessage || '',
                imageUrl: normalizedImageUrl,
                imageAlt: normalizedImageAlt,
                isActive,
                animationType,
                colors,
                textSize,
                position,
                isDismissable,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null
            }
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
