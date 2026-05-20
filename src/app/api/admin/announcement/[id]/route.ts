import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { updateAnnouncementSchema, type UpdateAnnouncementInput } from '@/lib/announcement'
import path from 'path'

interface RouteParams {
    params: Promise<{ id: string }>
}

type ParsedUpdateAnnouncement = ReturnType<typeof updateAnnouncementSchema.parse>
type ExistingAnnouncementForUpdate = NonNullable<Awaited<ReturnType<typeof getExistingAnnouncementForUpdate>>>

async function getExistingAnnouncementForUpdate(id: string) {
    return prisma.announcementBanner.findUnique({
        where: { id },
        include: {
            slides: {
                orderBy: { sortOrder: 'asc' }
            }
        }
    })
}

function buildAnnouncementUpdateData(data: ParsedUpdateAnnouncement, nextMessage?: string): Record<string, unknown> {
    const updateData: Record<string, unknown> = {}
    if (data.message !== undefined) updateData.message = nextMessage ?? data.message
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl
    if (data.imageAlt !== undefined) updateData.imageAlt = data.imageAlt
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.animationType !== undefined) updateData.animationType = data.animationType
    if (data.colors !== undefined) updateData.colors = data.colors
    if (data.textSize !== undefined) updateData.textSize = data.textSize
    if (data.position !== undefined) updateData.position = data.position
    if (data.isDismissable !== undefined) updateData.isDismissable = data.isDismissable
    if (data.displayMode !== undefined) updateData.displayMode = data.displayMode
    if (data.imageFit !== undefined) updateData.imageFit = data.imageFit
    if (data.sliderEnabled !== undefined) updateData.sliderEnabled = data.sliderEnabled
    if (data.sliderAutoplay !== undefined) updateData.sliderAutoplay = data.sliderAutoplay
    if (data.sliderIntervalMs !== undefined) updateData.sliderIntervalMs = data.sliderIntervalMs
    if (data.sliderCardsDesktop !== undefined) updateData.sliderCardsDesktop = data.sliderCardsDesktop
    if (data.sliderCardsTablet !== undefined) updateData.sliderCardsTablet = data.sliderCardsTablet
    if (data.sliderCardsMobile !== undefined) updateData.sliderCardsMobile = data.sliderCardsMobile
    if (data.tickerEnabled !== undefined) updateData.tickerEnabled = data.tickerEnabled
    if (data.tickerText !== undefined) updateData.tickerText = data.tickerText
    if (data.tickerSpeed !== undefined) updateData.tickerSpeed = data.tickerSpeed
    if (data.tickerDirection !== undefined) updateData.tickerDirection = data.tickerDirection
    if (data.tickerPosition !== undefined) updateData.tickerPosition = data.tickerPosition
    if (data.tickerBackgroundColor !== undefined) updateData.tickerBackgroundColor = data.tickerBackgroundColor
    if (data.tickerTextColor !== undefined) updateData.tickerTextColor = data.tickerTextColor
    if (data.dismissalVersion !== undefined) updateData.dismissalVersion = data.dismissalVersion
    if (data.startDate !== undefined) updateData.startDate = data.startDate
    if (data.endDate !== undefined) updateData.endDate = data.endDate
    return updateData
}

function buildSlideReplacementData(slides: NonNullable<ParsedUpdateAnnouncement['slides']>, bannerId: string) {
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

function nextStateHasContent(existing: ExistingAnnouncementForUpdate, data: ParsedUpdateAnnouncement): boolean {
    const nextMessage = data.message !== undefined ? (data.message?.trim() || '') : existing.message
    const nextImageUrl = data.imageUrl !== undefined ? data.imageUrl : existing.imageUrl
    const nextTickerEnabled = data.tickerEnabled !== undefined ? data.tickerEnabled : existing.tickerEnabled
    const nextTickerText = data.tickerText !== undefined ? data.tickerText : existing.tickerText
    const nextSlides = data.slides !== undefined ? data.slides : existing.slides
    const hasActiveSlide = nextSlides.some((slide) => slide.isActive !== false)

    return Boolean(
        nextMessage ||
        nextImageUrl ||
        hasActiveSlide ||
        (nextTickerEnabled && nextTickerText?.trim())
    )
}

/**
 * GET /api/admin/announcement/[id]
 * Get a single announcement banner
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        const banner = await prisma.announcementBanner.findUnique({
            where: { id },
            include: {
                slides: {
                    orderBy: { sortOrder: 'asc' }
                }
            }
        })

        if (!banner) {
            return NextResponse.json(
                { success: false, error: 'Banner not found' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            banner
        })
    } catch (error) {
        console.error('Error fetching banner:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to fetch banner' },
            { status: 500 }
        )
    }
}

/**
 * PUT /api/admin/announcement/[id]
 * Update an announcement banner
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json() as UpdateAnnouncementInput

        const parsed = updateAnnouncementSchema.safeParse(body)
        if (!parsed.success) {
            const firstError = parsed.error.issues[0]?.message || 'Invalid data'
            return NextResponse.json(
                { success: false, error: firstError },
                { status: 400 }
            )
        }

        const data = parsed.data

        const existingBanner = await getExistingAnnouncementForUpdate(id)

        if (!existingBanner) {
            return NextResponse.json(
                { success: false, error: 'Banner not found' },
                { status: 404 }
            )
        }

        const nextMessage = data.message !== undefined ? (data.message?.trim() || '') : existingBanner.message
        if (!nextStateHasContent(existingBanner, data)) {
            return NextResponse.json(
                { success: false, error: 'Provide announcement text, image, slide, or ticker' },
                { status: 400 }
            )
        }

        const updateData = buildAnnouncementUpdateData(data, nextMessage)

        const banner = await prisma.$transaction(async (tx) => {
            if (data.isActive === true) {
                await tx.announcementBanner.updateMany({
                    where: {
                        isActive: true,
                        id: { not: id }
                    },
                    data: { isActive: false }
                })
            }

            if (Object.keys(updateData).length > 0) {
                await tx.announcementBanner.update({
                    where: { id },
                    data: updateData
                })
            }

            if (data.slides !== undefined) {
                await tx.announcementSlide.deleteMany({
                    where: { bannerId: id }
                })

                const slides = buildSlideReplacementData(data.slides, id)
                if (slides.length > 0) {
                    await tx.announcementSlide.createMany({
                        data: slides
                    })
                }
            }

            return tx.announcementBanner.findUnique({
                where: { id },
                include: {
                    slides: {
                        orderBy: { sortOrder: 'asc' }
                    }
                }
            })
        })

        // Clean up old image if it was replaced
        if (
            data.imageUrl !== undefined &&
            existingBanner.imageUrl &&
            existingBanner.imageUrl !== data.imageUrl &&
            existingBanner.imageUrl.startsWith('/uploads/')
        ) {
            // Check if any other banner uses this same image before deleting
            const otherUsage = await prisma.announcementBanner.count({
                where: {
                    imageUrl: existingBanner.imageUrl,
                    id: { not: id }
                }
            })
            const slideUsage = await prisma.announcementSlide.count({
                where: {
                    imageUrl: existingBanner.imageUrl
                }
            })
            if (otherUsage === 0 && slideUsage === 0) {
                try {
                    const filePath = path.join(process.cwd(), 'public', existingBanner.imageUrl)
                    const { unlink } = await import('fs/promises')
                    await unlink(filePath)
                } catch (err) {
                    console.warn('Failed to remove old announcement image:', err)
                }
            }
        }

        return NextResponse.json({
            success: true,
            banner
        })
    } catch (error) {
        console.error('Error updating banner:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to update banner' },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/admin/announcement/[id]
 * Delete an announcement banner
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        const banner = await prisma.announcementBanner.delete({
            where: { id },
            select: { imageUrl: true }
        })

        // Only delete file if no other banner references it
        if (banner.imageUrl && banner.imageUrl.startsWith('/uploads/')) {
            const bannerUsage = await prisma.announcementBanner.count({
                where: { imageUrl: banner.imageUrl }
            })
            const slideUsage = await prisma.announcementSlide.count({
                where: { imageUrl: banner.imageUrl }
            })
            if (bannerUsage === 0 && slideUsage === 0) {
                try {
                    const filePath = path.join(process.cwd(), 'public', banner.imageUrl)
                    const { unlink } = await import('fs/promises')
                    await unlink(filePath)
                } catch (err) {
                    console.warn('Failed to remove announcement image:', err)
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Banner deleted successfully'
        })
    } catch (error) {
        console.error('Error deleting banner:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to delete banner' },
            { status: 500 }
        )
    }
}

/**
 * PATCH /api/admin/announcement/[id]
 * Toggle banner active state
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        // Get current state
        const current = await prisma.announcementBanner.findUnique({
            where: { id },
            select: { isActive: true }
        })

        if (!current) {
            return NextResponse.json(
                { success: false, error: 'Banner not found' },
                { status: 404 }
            )
        }

        const newActiveState = !current.isActive

        // If activating, deactivate others (in a transaction)
        const banner = await prisma.$transaction(async (tx) => {
            if (newActiveState) {
                await tx.announcementBanner.updateMany({
                    where: {
                        isActive: true,
                        id: { not: id }
                    },
                    data: { isActive: false }
                })
            }

            return tx.announcementBanner.update({
                where: { id },
                data: { isActive: newActiveState },
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
        console.error('Error toggling banner:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to toggle banner' },
            { status: 500 }
        )
    }
}
