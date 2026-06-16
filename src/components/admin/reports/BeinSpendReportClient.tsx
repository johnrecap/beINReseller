'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, RefreshCw, WalletCards } from 'lucide-react'
import {
    addDaysToCairoDateInput,
    cairoLocalRangeToUtcIso,
    currentCairoDateInput,
    startOfCairoMonthDateInput,
} from '@/lib/egypt-time'

export type Preset = 'today' | 'week' | 'month' | 'custom'

interface SummaryResponse {
    totals: {
        confirmedSpend: number
        confirmedOperationCount: number
        unconfirmedReviewCount: number
        currency: string
    }
    accounts: Array<{
        beinAccountId: string
        beinUsernameSnapshot: string
        beinLabelSnapshot: string | null
        confirmedSpend: number
        confirmedOperationCount: number
        unconfirmedReviewCount: number
        lastChargedAt: string
    }>
}

interface OperationsResponse {
    items: Array<{
        ledgerId: string
        operationId: string
        chargedAt: string
        panelUserId: string
        panelUsername: string | null
        beinAccountId: string
        beinUsernameSnapshot: string
        beinLabelSnapshot: string | null
        operationType: string
        cardNumber: string
        selectedPackageName: string | null
        dealerBalanceBefore: number | null
        dealerBalanceAfter: number | null
        spendAmount: number
        evidenceSource: string
        operationStatusAtRecord: string
    }>
    page: number
    pageSize: number
    total: number
}

export interface BeinSpendReportFilterState {
    from: string
    to: string
    preset: Preset
    beinAccountId: string
    userId: string
    operationType: string
    cardNumber: string
    page: number
}

function rangeForPreset(preset: Preset): { from: string; to: string } {
    const toDate = currentCairoDateInput()
    let fromDate = toDate

    if (preset === 'week') {
        fromDate = addDaysToCairoDateInput(toDate, -6)
    }
    if (preset === 'month') {
        fromDate = startOfCairoMonthDateInput(toDate)
    }

    return { from: `${fromDate}T00:00`, to: `${toDate}T23:59` }
}

function formatMoney(value: number, currency = 'USD'): string {
    return `${value.toFixed(2)} ${currency}`
}

function formatOptionalMoney(value: number | null | undefined): string {
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '-'
}

function evidenceSourceLabel(value: string): string {
    if (value === 'BALANCE_DELTA') return 'Balance delta'
    if (value === 'CONTRACT_VERIFIED') return 'Contract verified'
    return value || '-'
}

function formatDate(value: string): string {
    return new Date(value).toLocaleString()
}

function accountDisplay(username: string | null, label: string | null): string {
    return label ? `${label} (${username || '-'})` : username || '-'
}

export function buildBeinSpendReportParams(filters: BeinSpendReportFilterState, includePagination: boolean): URLSearchParams {
    const range = cairoLocalRangeToUtcIso(filters.from, filters.to)
    const params = new URLSearchParams({
        from: range.from ?? '',
        to: range.to ?? '',
        groupBy: filters.preset === 'custom' ? 'day' : filters.preset === 'week' ? 'day' : filters.preset,
    })
    if (filters.beinAccountId.trim()) params.set('beinAccountId', filters.beinAccountId.trim())
    if (filters.userId.trim()) params.set('userId', filters.userId.trim())
    if (filters.operationType) params.set('operationType', filters.operationType)
    if (filters.cardNumber.trim()) params.set('cardNumber', filters.cardNumber.trim())
    if (includePagination) {
        params.set('page', String(filters.page))
        params.set('pageSize', '25')
    }
    return params
}

export default function BeinSpendReportClient() {
    const [preset, setPreset] = useState<Preset>('month')
    const initialRange = useMemo(() => rangeForPreset('month'), [])
    const [from, setFrom] = useState(initialRange.from)
    const [to, setTo] = useState(initialRange.to)
    const [beinAccountId, setBeinAccountId] = useState('')
    const [userId, setUserId] = useState('')
    const [operationType, setOperationType] = useState('')
    const [cardNumber, setCardNumber] = useState('')
    const [page, setPage] = useState(1)
    const [summary, setSummary] = useState<SummaryResponse | null>(null)
    const [operations, setOperations] = useState<OperationsResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const buildParams = useCallback((includePagination: boolean) => {
        return buildBeinSpendReportParams({
            from,
            to,
            preset,
            beinAccountId,
            userId,
            operationType,
            cardNumber,
            page,
        }, includePagination)
    }, [beinAccountId, cardNumber, from, operationType, page, preset, to, userId])

    const fetchReports = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [summaryRes, operationsRes] = await Promise.all([
                fetch(`/api/admin/reports/bein-spend?${buildParams(false)}`),
                fetch(`/api/admin/reports/bein-spend/operations?${buildParams(true)}`),
            ])
            if (!summaryRes.ok) throw new Error((await summaryRes.json()).error || 'Failed to load summary')
            if (!operationsRes.ok) throw new Error((await operationsRes.json()).error || 'Failed to load operations')
            setSummary(await summaryRes.json())
            setOperations(await operationsRes.json())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load report')
        } finally {
            setLoading(false)
        }
    }, [buildParams])

    useEffect(() => {
        fetchReports()
    }, [fetchReports])

    const applyPreset = (nextPreset: Preset) => {
        setPreset(nextPreset)
        if (nextPreset !== 'custom') {
            const range = rangeForPreset(nextPreset)
            setFrom(range.from)
            setTo(range.to)
        }
        setPage(1)
    }

    const totalPages = operations ? Math.max(1, Math.ceil(operations.total / operations.pageSize)) : 1
    const currency = summary?.totals.currency || 'USD'

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-lg bg-emerald-600 flex items-center justify-center">
                        <WalletCards className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">beIN Spend Report</h1>
                        <p className="text-sm text-muted-foreground">Confirmed dealer balance spend by account and period.</p>
                    </div>
                </div>
                <button
                    onClick={fetchReports}
                    disabled={loading}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm hover:bg-secondary disabled:opacity-60"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <div className="flex rounded-md border border-border p-1 xl:col-span-2">
                        {[
                            ['today', 'Today'],
                            ['week', 'This week'],
                            ['month', 'This month'],
                            ['custom', 'Custom'],
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                onClick={() => applyPreset(value as Preset)}
                                className={`h-9 flex-1 rounded px-2 text-sm ${preset === value ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">From (Cairo time)</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" type="datetime-local" step={60} value={from} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); setPage(1) }} />
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">To (Cairo time)</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" type="datetime-local" step={60} value={to} onChange={(e) => { setPreset('custom'); setTo(e.target.value); setPage(1) }} />
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Operation type</span>
                        <select className="h-10 w-full rounded-md border border-border bg-background px-3" value={operationType} onChange={(e) => { setOperationType(e.target.value); setPage(1) }}>
                            <option value="">All</option>
                            <option value="RENEW">RENEW</option>
                            <option value="CHECK_BALANCE">CHECK_BALANCE</option>
                            <option value="SIGNAL_REFRESH">SIGNAL_REFRESH</option>
                        </select>
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">beIN account id</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" value={beinAccountId} onChange={(e) => { setBeinAccountId(e.target.value); setPage(1) }} />
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Card number</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" inputMode="numeric" value={cardNumber} onChange={(e) => { setCardNumber(e.target.value); setPage(1) }} />
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Panel user id</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1) }} />
                    </label>
                </div>
            </div>

            {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Total confirmed spend</p>
                    <p className="mt-2 text-2xl font-bold">{formatMoney(summary?.totals.confirmedSpend || 0, currency)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Confirmed operations</p>
                    <p className="mt-2 text-2xl font-bold">{summary?.totals.confirmedOperationCount || 0}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Unconfirmed review</p>
                    <p className="mt-2 text-2xl font-bold text-amber-600">{summary?.totals.unconfirmedReviewCount || 0}</p>
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border p-4">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-semibold">Grouped accounts</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 text-left">beIN account</th>
                                <th className="px-4 py-3 text-left">Label</th>
                                <th className="px-4 py-3 text-right">Confirmed spend</th>
                                <th className="px-4 py-3 text-right">Operations</th>
                                <th className="px-4 py-3 text-right">Review count</th>
                                <th className="px-4 py-3 text-left">Last charged</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(summary?.accounts || []).map((account) => (
                                <tr key={account.beinAccountId} className="border-t border-border">
                                    <td className="px-4 py-3">{accountDisplay(account.beinUsernameSnapshot, account.beinLabelSnapshot)}</td>
                                    <td className="px-4 py-3">{account.beinLabelSnapshot || '-'}</td>
                                    <td className="px-4 py-3 text-right">{formatMoney(account.confirmedSpend, currency)}</td>
                                    <td className="px-4 py-3 text-right">{account.confirmedOperationCount}</td>
                                    <td className="px-4 py-3 text-right">{account.unconfirmedReviewCount}</td>
                                    <td className="px-4 py-3">{formatDate(account.lastChargedAt)}</td>
                                </tr>
                            ))}
                            {summary?.accounts.length === 0 && (
                                <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>No confirmed spend rows match the selected filters.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="font-semibold">Detail rows</h2>
                    <span className="text-sm text-muted-foreground">{operations?.total || 0} rows</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1200px] text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 text-left">Operation</th>
                                <th className="px-4 py-3 text-left">Panel user</th>
                                <th className="px-4 py-3 text-left">beIN account</th>
                                <th className="px-4 py-3 text-left">Card</th>
                                <th className="px-4 py-3 text-left">Package</th>
                                <th className="px-4 py-3 text-right">Before</th>
                                <th className="px-4 py-3 text-right">After</th>
                                <th className="px-4 py-3 text-right">Spend</th>
                                <th className="px-4 py-3 text-left">Evidence</th>
                                <th className="px-4 py-3 text-left">Charged at</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(operations?.items || []).map((item) => (
                                <tr key={item.ledgerId} className="border-t border-border">
                                    <td className="px-4 py-3 font-mono text-xs">{item.operationId}</td>
                                    <td className="px-4 py-3">{item.panelUsername || item.panelUserId}</td>
                                    <td className="px-4 py-3">{accountDisplay(item.beinUsernameSnapshot, item.beinLabelSnapshot)}</td>
                                    <td className="px-4 py-3">{item.cardNumber}</td>
                                    <td className="px-4 py-3">{item.selectedPackageName || item.operationType}</td>
                                    <td className="px-4 py-3 text-right">{formatOptionalMoney(item.dealerBalanceBefore)}</td>
                                    <td className="px-4 py-3 text-right">{formatOptionalMoney(item.dealerBalanceAfter)}</td>
                                    <td className="px-4 py-3 text-right font-medium">{formatMoney(item.spendAmount, currency)}</td>
                                    <td className="px-4 py-3">{evidenceSourceLabel(item.evidenceSource)}</td>
                                    <td className="px-4 py-3">{formatDate(item.chargedAt)}</td>
                                </tr>
                            ))}
                            {operations?.items.length === 0 && (
                                <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={10}>No operation rows match the selected filters.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between border-t border-border p-4">
                    <button className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                    <button className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
                </div>
            </div>
        </div>
    )
}
