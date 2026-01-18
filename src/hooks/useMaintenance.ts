'use client'

import { useState, useEffect, useCallback } from 'react'

interface MaintenanceStatus {
    isMaintenanceMode: boolean
    maintenanceMessage: string
    isLoading: boolean
    refetch: () => Promise<void>
}

/**
 * Hook to check maintenance mode status
 * Polls every 30 seconds to catch updates from admin
 */
export function useMaintenance(): MaintenanceStatus {
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false)
    const [maintenanceMessage, setMaintenanceMessage] = useState('')
    const [isLoading, setIsLoading] = useState(true)

    const checkMaintenance = useCallback(async () => {
        try {
            const res = await fetch('/api/maintenance-status')
            if (!res.ok) throw new Error('Failed to fetch maintenance status')

            const data = await res.json()
            setIsMaintenanceMode(data.maintenance_mode === true || data.maintenance_mode === 'true')
            setMaintenanceMessage(data.maintenance_message || 'النظام تحت الصيانة يرجى المحاولة لاحقاً')
        } catch (error) {
            console.error('Failed to check maintenance status:', error)
            // On error, assume not in maintenance to avoid blocking users
            setIsMaintenanceMode(false)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        // Initial check
        checkMaintenance()

        // Poll every 30 seconds to catch admin updates
        const interval = setInterval(checkMaintenance, 30000)

        return () => clearInterval(interval)
    }, [checkMaintenance])

    return {
        isMaintenanceMode,
        maintenanceMessage,
        isLoading,
        refetch: checkMaintenance
    }
}
