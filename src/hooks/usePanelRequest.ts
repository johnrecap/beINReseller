'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { withRequestDeadline } from '@/lib/request-deadline'

export class PanelRequestError extends Error {
    constructor(public readonly status: number) { super(`PANEL_REQUEST_${status}`) }
}

/** Each list owns a request generation; stale responses never publish state. */
export function usePanelRequest() {
    const current = useRef<AbortController | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<number | null>(null)
    const cancel = useCallback(() => { current.current?.abort(); current.current = null }, [])
    useEffect(() => cancel, [cancel])
    const load = useCallback(async <T,>(url: string, accept: (data: T) => void) => {
        current.current?.abort()
        const request = new AbortController()
        current.current = request
        setLoading(true)
        setError(null)
        try {
            const data: T = await withRequestDeadline(async (signal) => {
                const response = await fetch(url, { signal, cache: 'no-store' })
                if (!response.ok) throw new PanelRequestError(response.status)
                return response.json()
            }, 15_000, request.signal)
            if (current.current === request) accept(data)
        } catch (failure) {
            if (current.current === request && !request.signal.aborted) {
                setError(failure instanceof PanelRequestError ? failure.status : 0)
            }
        } finally {
            if (current.current === request) setLoading(false)
        }
    }, [])
    return { load, loading, error, cancel }
}
