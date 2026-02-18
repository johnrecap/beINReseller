import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import path from 'path'

function normalizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

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

        const {
            message,
            isActive,
            animationType,
            colors,
            textSize,
            position,
            isDismissable,
            startDate,
            endDate,
            imageUrl,
            imageAlt
        } = body

        // Validate message if provided
        if (message !== undefined && (typeof message !== 'string' || message.trim().length > 500)) {
            return NextResponse.json(
                { success: false, error: 'Message must be under 500 characters' },
                { status: 400 }
            )
        }
        const normalizedImageUrl = imageUrl !== undefined ? normalizeOptionalText(imageUrl) : undefined
        const normalizedImageAlt = imageAlt !== undefined ? normalizeOptionalText(imageAlt) : undefined
        if (normalizedImageUrl !== undefined && normalizedImageUrl && !normalizedImageUrl.startsWith('/uploads/')) {
            return NextResponse.json(
                { success: false, error: 'Invalid image URL' },
                { status: 400 }
            )
        }
        if (normalizedImageAlt !== undefined && normalizedImageAlt && normalizedImageAlt.length > 120) {
            return NextResponse.json(
                { success: false, error: 'Image alt text must be under 120 characters' },
                { status: 400 }
            )
        }

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

        const nextMessage = message !== undefined ? message.trim() : existingBanner.message
        const nextImageUrl = normalizedImageUrl !== undefined ? normalizedImageUrl : existingBanner.imageUrl
        if (!nextMessage && !nextImageUrl) {
            return NextResponse.json(
                { success: false, error: 'Provide announcement text or image' },
                { status: 400 }
            )
        }

        // If making this banner active, deactivate others
        if (isActive === true) {
            await prisma.announcementBanner.updateMany({
                where: { 
                    isActive: true,
                    id: { not: id }
                },
                data: { isActive: false }
            })
        }

        const banner = await prisma.announcementBanner.update({
            where: { id },
            data: {
                ...(message !== undefined && { message: nextMessage }),
                ...(isActive !== undefined && { isActive }),
                ...(animationType !== undefined && { animationType }),
                ...(colors !== undefined && { colors }),
                ...(textSize !== undefined && { textSize }),
                ...(position !== undefined && { position }),
                ...(isDismissable !== undefined && { isDismissable }),
                ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
                ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
                ...(imageUrl !== undefined && { imageUrl: normalizedImageUrl }),
                ...(imageAlt !== undefined && { imageAlt: normalizedImageAlt })
            }
        })

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

        if (banner.imageUrl && banner.imageUrl.startsWith('/uploads/')) {
            try {
                const filePath = path.join(process.cwd(), 'public', banner.imageUrl)
                const { unlink } = await import('fs/promises')
                await unlink(filePath)
            } catch (error) {
                console.warn('Failed to remove announcement image:', error)
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

        // If activating, deactivate others
        if (newActiveState) {
            await prisma.announcementBanner.updateMany({
                where: { 
                    isActive: true,
                    id: { not: id }
                },
                data: { isActive: false }
            })
        }

        const banner = await prisma.announcementBanner.update({
            where: { id },
            data: { isActive: newActiveState }
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
