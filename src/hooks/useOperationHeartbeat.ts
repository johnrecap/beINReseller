'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * useOperationHeartbeat - Sends heartbeat to server every 5 seconds
 * 
 * This hook keeps the operation alive while the user is on the page.
 * If heartbeats stop (browser close, tab close, network disconnect),
 * the server will auto-cancel the operation after 15 seconds.
 * 
 * Features:
 * - Sends heartbeat every 5 seconds
 * - Pauses when tab is hidden (reduces server load)
 * - Uses navigator.sendBeacon on page unload for reliable delivery
 * - Cleans up on unmount
 * 
 * Usage:
 * ```tsx
 * const { isActive, lastHeartbeat, error } = useOperationHeartbeat({
 *   operationId: 'clu123...',
 *   enabled: status === 'AWAITING_PACKAGE', // Only when in waiting state
 *   onExpired: () => router.push('/dashboard'), // Handle expiry
 * })
 * ```
 */

interface UseOperationHeartbeatOptions {
    /** Operation ID to send heartbeats for */
    operationId: string | null
    /** Whether heartbeat is enabled (should be true only in AWAITING_* states) */
    enabled: boolean
    /** Callback when operation expires (optional) */
    onExpired?: () => void
    /** Callback when heartbeat fails repeatedly (optional) */
    onError?: (error: string) => void
    /** Heartbeat interval in ms (default: 5000) */
    intervalMs?: number
}

interface HeartbeatState {
    isActive: boolean
    lastHeartbeat: Date | null
    error: string | null
    failureCount: number
}

const DEFAULT_INTERVAL_MS = 5000  // 5 seconds
const MAX_FAILURES = 3  // After 3 consecutive failures, stop trying

export function useOperationHeartbeat({
    operationId,
    enabled,
    onExpired,
    onError,
    intervalMs = DEFAULT_INTERVAL_MS
}: UseOperationHeartbeatOptions): HeartbeatState {
    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const isActiveRef = useRef(false)
    const lastHeartbeatRef = useRef<Date | null>(null)
    const errorRef = useRef<string | null>(null)
    const failureCountRef = useRef(0)

    // Send heartbeat to server
    const sendHeartbeat = useCallback(async () => {
        if (!operationId || !enabled) return

        try {
            const response = await fetch(`/api/operations/${operationId}/heartbeat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Important: keepalive allows request to complete even during page unload
                keepalive: true
            })

            if (response.ok) {
                lastHeartbeatRef.current = new Date()
                errorRef.current = null
                failureCountRef.current = 0
                isActiveRef.current = true
            } else if (response.status === 404) {
                // Operation not found or not in waiting state anymore
                // This could mean it expired or completed
                isActiveRef.current = false
                onExpired?.()
            } else {
                throw new Error(`Heartbeat failed: ${response.status}`)
            }
        } catch (error) {
            failureCountRef.current++
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            errorRef.current = errorMsg

            if (failureCountRef.current >= MAX_FAILURES) {
                isActiveRef.current = false
                onError?.(`Heartbeat failed ${MAX_FAILURES} times: ${errorMsg}`)
            }
        }
    }, [operationId, enabled, onExpired, onError])

    // Handle visibility change (pause heartbeat when tab is hidden)
    useEffect(() => {
        if (!enabled || !operationId) return

        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Tab hidden - pause heartbeat but don't stop it completely
                // The server has 15 second timeout, so we have some buffer
                console.log('[Heartbeat] Tab hidden, pausing heartbeat')
            } else {
                // Tab visible again - send immediate heartbeat
                console.log('[Heartbeat] Tab visible, resuming heartbeat')
                sendHeartbeat()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [enabled, operationId, sendHeartbeat])

    // Handle page unload - use sendBeacon for reliable delivery
    useEffect(() => {
        if (!enabled || !operationId) return

        const handleBeforeUnload = () => {
            // Use sendBeacon for reliable delivery during page unload
            // This is more reliable than fetch during unload
            try {
                const url = `/api/operations/${operationId}/heartbeat`
                const data = JSON.stringify({ unloading: true })
                
                // Note: sendBeacon is fire-and-forget, we can't check the response
                // But it's the most reliable way to send data during page unload
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }))
                    console.log('[Heartbeat] Sent beacon on unload')
                }
            } catch (error) {
                console.error('[Heartbeat] Failed to send beacon:', error)
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [enabled, operationId])

    // Main heartbeat interval
    useEffect(() => {
        if (!enabled || !operationId) {
            // Cleanup if disabled
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
            isActiveRef.current = false
            return
        }

        // Send initial heartbeat immediately
        sendHeartbeat()

        // Set up interval
        intervalRef.current = setInterval(() => {
            // Only send if tab is visible
            if (!document.hidden) {
                sendHeartbeat()
            }
        }, intervalMs)

        console.log(`[Heartbeat] Started for operation ${operationId} (interval: ${intervalMs}ms)`)

        // Cleanup on unmount or when disabled
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
            console.log(`[Heartbeat] Stopped for operation ${operationId}`)
        }
    }, [enabled, operationId, intervalMs, sendHeartbeat])

    return {
        isActive: isActiveRef.current,
        lastHeartbeat: lastHeartbeatRef.current,
        error: errorRef.current,
        failureCount: failureCountRef.current
    }
}

/**
 * Simple hook for components that just need to keep an operation alive
 * without caring about the state
 */
export function useKeepOperationAlive(
    operationId: string | null,
    enabled: boolean
): void {
    useOperationHeartbeat({
        operationId,
        enabled,
        onExpired: () => console.log('[Heartbeat] Operation expired'),
        onError: (error) => console.error('[Heartbeat] Error:', error)
    })
}

export default useOperationHeartbeat
