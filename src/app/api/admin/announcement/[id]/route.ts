import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * GET /api/admin/announcement/[id]
 * Get a single announcement banner
 */
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const session = await auth()
        
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
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
export async function PUT(request: Request, { params }: RouteParams) {
    try {
        const session = await auth()
        
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
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
            endDate
        } = body

        // Validate message if provided
        if (message !== undefined && (typeof message !== 'string' || message.length > 500)) {
            return NextResponse.json(
                { success: false, error: 'Message must be under 500 characters' },
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
                ...(message !== undefined && { message }),
                ...(isActive !== undefined && { isActive }),
                ...(animationType !== undefined && { animationType }),
                ...(colors !== undefined && { colors }),
                ...(textSize !== undefined && { textSize }),
                ...(position !== undefined && { position }),
                ...(isDismissable !== undefined && { isDismissable }),
                ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
                ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null })
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
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const session = await auth()
        
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params

        await prisma.announcementBanner.delete({
            where: { id }
        })

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
export async function PATCH(request: Request, { params }: RouteParams) {
    try {
        const session = await auth()
        
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
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
