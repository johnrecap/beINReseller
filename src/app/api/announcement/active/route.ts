import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/announcement/active
 * Returns the currently active announcement banner (if any)
 * Public endpoint - no auth required
 */
export async function GET() {
    try {
        const now = new Date()
        
        // Find first active banner that's within date range (if dates specified)
        const banner = await prisma.announcementBanner.findFirst({
            where: {
                isActive: true,
                OR: [
                    // No date restrictions
                    {
                        startDate: null,
                        endDate: null
                    },
                    // Start date passed, no end date
                    {
                        startDate: { lte: now },
                        endDate: null
                    },
                    // No start date, end date not passed
                    {
                        startDate: null,
                        endDate: { gte: now }
                    },
                    // Both dates specified and we're within range
                    {
                        startDate: { lte: now },
                        endDate: { gte: now }
                    }
                ]
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        return NextResponse.json({
            success: true,
            banner
        })
    } catch (error) {
        console.error('Error fetching active banner:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to fetch announcement' },
            { status: 500 }
        )
    }
}
