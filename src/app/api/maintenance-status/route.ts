import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * GET /api/maintenance-status
 * 
 * Public endpoint - no authentication required
 * Returns only maintenance_mode and maintenance_message
 * Used by frontend to check if system is under maintenance
 */
export async function GET() {
    try {
        // Fetch maintenance settings
        const [maintenanceMode, maintenanceMessage] = await Promise.all([
            prisma.setting.findUnique({ where: { key: 'maintenance_mode' } }),
            prisma.setting.findUnique({ where: { key: 'maintenance_message' } })
        ])

        return NextResponse.json({
            maintenance_mode: maintenanceMode?.value === 'true',
            maintenance_message: maintenanceMessage?.value || 'النظام تحت الصيانة يرجى المحاولة لاحقاً'
        })

    } catch (error) {
        console.error('Maintenance status check error:', error)
        // On error, return not in maintenance to avoid blocking users
        return NextResponse.json({
            maintenance_mode: false,
            maintenance_message: ''
        })
    }
}
