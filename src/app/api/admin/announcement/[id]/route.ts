import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { updateAnnouncementSchema } from '@/lib/announcement'
import path from 'path'

interface RouteParams {
    params: Promise<{ id: string }>
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
            where: { id }
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
        const body = await request.json()

        const parsed = updateAnnouncementSchema.safeParse(body)
        if (!parsed.success) {
            const firstError = parsed.error.issues[0]?.message || 'Invalid data'
            return NextResponse.json(
                { success: false, error: firstError },
                { status: 400 }
            )
        }

        const data = parsed.data

        const existingBanner = await prisma.announcementBanner.findUnique({
            where: { id },
            select: { message: true, imageUrl: true }
        })

        if (!existingBanner) {
            return NextResponse.json(
                { success: false, error: 'Banner not found' },
                { status: 404 }
            )
        }

        // Validate that at least message or image remains
        const nextMessage = data.message !== undefined ? (data.message?.trim() || '') : existingBanner.message
        const nextImageUrl = data.imageUrl !== undefined ? data.imageUrl : existingBanner.imageUrl
        if (!nextMessage && !nextImageUrl) {
            return NextResponse.json(
                { success: false, error: 'Provide announcement text or image' },
                { status: 400 }
            )
        }

        // Build update payload from only provided fields
        const updateData: Record<string, unknown> = {}
        if (data.message !== undefined) updateData.message = nextMessage
        if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl
        if (data.imageAlt !== undefined) updateData.imageAlt = data.imageAlt
        if (data.isActive !== undefined) updateData.isActive = data.isActive
        if (data.animationType !== undefined) updateData.animationType = data.animationType
        if (data.colors !== undefined) updateData.colors = data.colors
        if (data.textSize !== undefined) updateData.textSize = data.textSize
        if (data.position !== undefined) updateData.position = data.position
        if (data.startDate !== undefined) updateData.startDate = data.startDate
        if (data.endDate !== undefined) updateData.endDate = data.endDate

        // If making this banner active, deactivate others (in a transaction)
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

            return tx.announcementBanner.update({
                where: { id },
                data: updateData
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
            if (otherUsage === 0) {
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
            const otherUsage = await prisma.announcementBanner.count({
                where: { imageUrl: banner.imageUrl }
            })
            if (otherUsage === 0) {
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
                data: { isActive: newActiveState }
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
