import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { createAnnouncementSchema, type CreateAnnouncementInput } from '@/lib/announcement'

type ParsedCreateAnnouncement = ReturnType<typeof createAnnouncementSchema.parse>

function buildAnnouncementCreateData(data: ParsedCreateAnnouncement) {
    return {
        message: data.message || '',
        imageUrl: data.imageUrl ?? null,
        imageAlt: data.imageAlt ?? null,
        isActive: data.isActive,
        animationType: data.animationType,
        colors: data.colors,
        textSize: data.textSize,
        position: data.position,
        isDismissable: data.isDismissable,
        displayMode: data.displayMode,
        imageFit: data.imageFit,
        sliderEnabled: data.sliderEnabled,
        sliderAutoplay: data.sliderAutoplay,
        sliderIntervalMs: data.sliderIntervalMs,
        sliderCardsDesktop: data.sliderCardsDesktop,
        sliderCardsTablet: data.sliderCardsTablet,
        sliderCardsMobile: data.sliderCardsMobile,
        tickerEnabled: data.tickerEnabled,
        tickerText: data.tickerText ?? null,
        tickerSpeed: data.tickerSpeed,
        tickerDirection: data.tickerDirection,
        tickerPosition: data.tickerPosition,
        tickerBackgroundColor: data.tickerBackgroundColor,
        tickerTextColor: data.tickerTextColor,
        dismissalVersion: data.dismissalVersion,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
    }
}

function buildSlideCreateData(slides: ParsedCreateAnnouncement['slides'], bannerId: string) {
    return slides.map((slide, index) => ({
        bannerId,
        imageUrl: slide.imageUrl || '',
        imageAlt: slide.imageAlt ?? null,
        title: slide.title ?? null,
        description: slide.description ?? null,
        linkLabel: slide.linkLabel ?? null,
        linkUrl: slide.linkUrl ?? null,
        sortOrder: slide.sortOrder ?? index,
        isActive: slide.isActive,
        imageFit: slide.imageFit,
    }))
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
            include: {
                slides: {
                    orderBy: { sortOrder: 'asc' }
                }
            },
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

        const body = await request.json() as CreateAnnouncementInput
        const parsed = createAnnouncementSchema.safeParse(body)

        if (!parsed.success) {
            const firstError = parsed.error.issues[0]?.message || 'Invalid data'
            return NextResponse.json(
                { success: false, error: firstError },
                { status: 400 }
            )
        }

        const data = parsed.data

        const banner = await prisma.$transaction(async (tx) => {
            if (data.isActive) {
                await tx.announcementBanner.updateMany({
                    where: { isActive: true },
                    data: { isActive: false }
                })
            }

            const created = await tx.announcementBanner.create({
                data: buildAnnouncementCreateData(data)
            })

            const slides = buildSlideCreateData(data.slides, created.id)
            if (slides.length > 0) {
                await tx.announcementSlide.createMany({
                    data: slides
                })
            }

            return tx.announcementBanner.findUnique({
                where: { id: created.id },
                include: {
                    slides: {
                        orderBy: { sortOrder: 'asc' }
                    }
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
