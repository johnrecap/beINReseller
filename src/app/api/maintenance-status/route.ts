import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { computeEffectiveMaintenanceStatus } from '@/lib/maintenance/effective-status'

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
        const [maintenanceMode, maintenanceMessage, maintenancePauseUntil, installmentDevMode] = await Promise.all([
            prisma.setting.findUnique({ where: { key: 'maintenance_mode' } }),
            prisma.setting.findUnique({ where: { key: 'maintenance_message' } }),
            prisma.setting.findUnique({ where: { key: 'maintenance_pause_until' } }),
            prisma.setting.findUnique({ where: { key: 'installment_dev_mode' } })
        ])

        const effectiveMaintenance = computeEffectiveMaintenanceStatus({
            maintenanceMode: maintenanceMode?.value,
            maintenanceMessage: maintenanceMessage?.value,
            maintenancePauseUntil: maintenancePauseUntil?.value,
        })

        return NextResponse.json({
            maintenance_mode: effectiveMaintenance.maintenanceMode,
            maintenance_message: effectiveMaintenance.message,
            maintenance_pause_until: effectiveMaintenance.pauseUntil,
            installment_dev_mode: installmentDevMode?.value === 'true'
        })

    } catch (error) {
        console.error('Maintenance status check error:', error)
        // On error, return not in maintenance to avoid blocking users
        return NextResponse.json({
            maintenance_mode: false,
            maintenance_message: '',
            maintenance_pause_until: null
        })
    }
}
