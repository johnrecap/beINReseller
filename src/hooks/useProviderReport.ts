'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { withRequestDeadline } from '@/lib/request-deadline'
import { PROVIDER_REPORT_WAIT_MS, type ProviderReportCriteria, type ProviderReportPage } from '../../shared/reports/bein-provider'

class ReportApiError extends Error {}
async function readJson<T>(url: string, signal: AbortSignal, body?: unknown): Promise<T> {
    return withRequestDeadline(async requestSignal => {
        const response = await fetch(url, { signal: requestSignal, cache: 'no-store',
            ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
        const data = await response.json()
        if (!response.ok) throw new ReportApiError(response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : data.code || 'REPORT_FAILED')
        return data as T
    }, 15_000, signal)
}
export function useProviderReport() {
    const [result, setResult] = useState<ProviderReportPage | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const current = useRef<AbortController | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const cancel = useCallback(() => { current.current?.abort(); current.current = null; if (timer.current) clearTimeout(timer.current) }, [])
    useEffect(() => cancel, [cancel])
    const loadPage = useCallback(async (id: string, page: number, search: string, controller: AbortController, deadline: number) => {
        const poll = async (): Promise<void> => {
            try {
                if (Date.now() >= deadline) throw new ReportApiError('REPORT_TIMEOUT')
                const data = await readJson<ProviderReportPage>(`/api/admin/reports/bein-provider/${encodeURIComponent(id)}?page=${page}&search=${encodeURIComponent(search)}`, controller.signal)
                if (current.current !== controller || controller.signal.aborted) return
                setResult(data)
                if (data.state === 'FAILED') { setError(data.errorCode || 'REPORT_FAILED'); setLoading(false); return }
                if (data.state === 'COMPLETED') { setLoading(false); return }
                timer.current = setTimeout(() => { void poll() }, 2000)
            } catch (failure) {
                if (current.current !== controller || controller.signal.aborted) return
                setResult(null); setError(failure instanceof ReportApiError ? failure.message : 'REPORT_FAILED'); setLoading(false)
            }
        }
        await poll()
    }, [])
    const start = useCallback(async (criteria: ProviderReportCriteria) => {
        cancel(); const controller = new AbortController(); current.current = controller
        setResult(null); setError(null); setLoading(true)
        try {
            const response = await readJson<{ data: { requestId: string } }>('/api/admin/reports/bein-provider', controller.signal, criteria)
            if (current.current !== controller || controller.signal.aborted) return
            await loadPage(response.data.requestId, 1, '', controller, Date.now() + PROVIDER_REPORT_WAIT_MS)
        } catch (failure) {
            if (current.current !== controller || controller.signal.aborted) return
            setError(failure instanceof ReportApiError ? failure.message : 'REPORT_FAILED'); setLoading(false)
        }
    }, [cancel, loadPage])
    const browse = useCallback(async (page: number, search: string) => {
        if (!result || result.state !== 'COMPLETED') return
        cancel(); const controller = new AbortController(); current.current = controller
        setError(null); setLoading(true)
        await loadPage(result.id, page, search, controller, Date.now() + PROVIDER_REPORT_WAIT_MS)
    }, [cancel, loadPage, result])
    const clear = useCallback(() => { cancel(); setResult(null); setError(null); setLoading(false) }, [cancel])
    return { result, loading, error, start, browse, clear }
}
