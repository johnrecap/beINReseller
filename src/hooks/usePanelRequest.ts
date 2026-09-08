'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { withRequestDeadline } from '@/lib/request-deadline'
import { useTranslation } from '@/hooks/useTranslation'

export class PanelRequestError extends Error {
    constructor(public readonly status: number) { super(`PANEL_REQUEST_${status}`) }
}

export async function readPanelJson<T>(url: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(url, { signal, cache: 'no-store' })
    if (!response.ok) throw new PanelRequestError(response.status)
    return response.json()
}

/** Each list owns a request generation; stale responses never publish state. */
export function usePanelRequest() {
    const current = useRef<AbortController | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<number | null>(null)
    const cancel = useCallback(() => { current.current?.abort(); current.current = null }, [])
    useEffect(() => cancel, [cancel])
    const run = useCallback(async <T,>(read: (signal: AbortSignal) => Promise<T>, accept: (data: T) => void) => {
        current.current?.abort()
        const request = new AbortController()
        current.current = request
        setLoading(true)
        setError(null)
        try {
            const data = await withRequestDeadline(read, 15_000, request.signal)
            if (current.current === request) { accept(data); return true }
        } catch (failure) {
            if (current.current === request && !request.signal.aborted) {
                setError(failure instanceof PanelRequestError ? failure.status : 0)
            }
        } finally {
            if (current.current === request) setLoading(false)
            // Stop sibling reads if a grouped request failed before they completed.
            request.abort()
        }
        return false
    }, [])
    const load = useCallback(<T,>(url: string, accept: (data: T) => void) =>
        run(signal => readPanelJson<T>(url, signal), accept), [run])
    return { load, run, loading, error, cancel }
}

/** Uncertain commands are retained per action/entity for this mounted owner.
 * Changing inputs or closing a child form must not erase an unresolved command. */
export function usePanelCommand(identity?: string | null) {
    const { t } = useTranslation()
    const [uncertainKeys, setUncertainKeys] = useState<ReadonlySet<string>>(new Set())
    const blocked = useRef(new Set<string>())
    const current = useRef<AbortController | null>(null)
    const mounted = useRef(true)
    const defaultKey = identity ?? 'default'
    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false; current.current?.abort() }
    }, [])
    const isUnconfirmed = useCallback((key: string) => blocked.current.has(key), [])
    const request = useCallback(async (url: string, init: RequestInit, key = defaultKey): Promise<Response> => {
        if (blocked.current.has(key) || current.current) throw new Error(t.panelUi.commandUnconfirmed)
        const command = new AbortController()
        current.current = command
        const markUnconfirmed = () => {
            if (mounted.current && current.current === command) {
                blocked.current.add(key)
                setUncertainKeys(new Set(blocked.current))
            }
        }
        try {
            const response = await withRequestDeadline(async signal => {
                const result = await fetch(url, { ...init, signal })
                // All current callers expect JSON. Decode a clone so a truncated successful
                // response is uncertain, while preserving each caller's existing contract.
                await result.clone().json()
                return result
            }, 45_000, command.signal)
            if (response.status >= 500) markUnconfirmed()
            return response
        } catch {
            markUnconfirmed()
            throw new Error(t.panelUi.commandUnconfirmed)
        } finally {
            if (current.current === command) current.current = null
        }
    }, [defaultKey, t.panelUi.commandUnconfirmed])
    // Explicit nonfinancial review only. A successful GET is never financial
    // non-execution evidence; financial callers must not expose this action.
    const reconcile = useCallback(async (keys: readonly string[], readCurrent: () => Promise<boolean>) => {
        if (current.current) return false
        const reviewed = keys.filter(key => blocked.current.has(key))
        if (!reviewed.length || !await readCurrent() || !mounted.current || current.current) return false
        for (const key of reviewed) blocked.current.delete(key)
        setUncertainKeys(new Set(blocked.current))
        return true
    }, [])
    return { request, unconfirmed: uncertainKeys.has(defaultKey), isUnconfirmed,
        uncertainKeys, hasUnconfirmed: uncertainKeys.size > 0, reconcile }
}
