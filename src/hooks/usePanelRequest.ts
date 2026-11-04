'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { withRequestDeadline } from '@/lib/request-deadline'
import { useTranslation } from '@/hooks/useTranslation'
import { usePanelCommandOwner } from '@/components/providers/PanelCommandProvider'
import type { PanelCommandInput } from '@/lib/panel-command-runner'
import type { CommandReceipt } from '@/lib/panel-command-state'

const noReceipts: readonly CommandReceipt[] = Object.freeze([])
const emptySnapshot = () => noReceipts
const emptySubscribe = () => () => {}

/** Explicit-resource adapter for migrated callers. Legacy callers are migrated per C01–C07. */
export function useOwnedPanelCommand() {
    const owner = usePanelCommandOwner()
    const { t } = useTranslation()
    const receipts = useSyncExternalStore(owner?.runner.state.subscribe ?? emptySubscribe,
        owner?.runner.state.snapshot ?? emptySnapshot, emptySnapshot)
    const request = useCallback(async (input: Omit<PanelCommandInput, 'attempt'>) => {
        if (!owner) throw new Error(t.panelUi.commandUnconfirmed)
        const attempt = crypto.randomUUID()
        if (input.displayLabel) owner.labels.set(attempt, input.displayLabel)
        try { return await owner.runner.request({ ...input, attempt }) }
        catch {
            if (!owner.runner.state.snapshot().some(r => r.attempt === attempt)) owner.labels.delete(attempt)
            throw new Error(t.panelUi.commandUnconfirmed)
        }
    }, [owner, t.panelUi.commandUnconfirmed])
    return { request, receipts, state: owner?.runner.state ?? null, drafts: owner?.drafts, actor: owner?.actor }
}

export function useResourcePanelCommand(resources: readonly string[], action: string,
    knownRejection?: PanelCommandInput['knownRejection'], displayLabel?: string) {
    const owned = useOwnedPanelCommand()
    const relevant = owned.receipts.filter(r => r.resources.some(key => resources.includes(key)))
    return { ...owned,
        loading: relevant.some(r => r.state === 'PENDING'),
        unconfirmed: relevant.some(r => r.state === 'UNCERTAIN'),
        request: (url: string, init: RequestInit) => owned.request({ action, resources, url, init, knownRejection, displayLabel }),
    }
}

/** Capture before dispatch; hidden, replaced and unmounted views cannot apply late callbacks. */
export function usePanelViewGuard(identity: string | null, open: boolean) {
    const current = useRef({ identity, open, version: 0, mounted: true })
    useLayoutEffect(() => {
        current.current = { identity, open, version: current.current.version + 1, mounted: true }
        return () => { current.current.mounted = false }
    }, [identity, open])
    return () => {
        const version = current.current.version
        return () => current.current.mounted && current.current.open && current.current.version === version
    }
}

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
