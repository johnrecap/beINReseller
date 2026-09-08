'use client'

import { useTranslation } from '@/hooks/useTranslation'
import { usePanelRequest, readPanelJson } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
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
        panelUserId: string | null
        panelUsername: string | null
        customerId?: string | null
        customerName?: string | null
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

function evidenceSourceLabel(value: string, t: ReturnType<typeof useTranslation>['t']): string {
    if (value === 'BALANCE_DELTA') return t.panelUi.reportCopy.balanceDelta
    if (value === 'CONTRACT_VERIFIED') return t.panelUi.reportCopy.contractVerified
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
    const { t } = useTranslation()
    const { t: tableText } = useTranslation()
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
    const { run, loading, error, cancel } = usePanelRequest()

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
        setSummary(null)
        setOperations(null)
        await run(signal => Promise.all([
            readPanelJson<SummaryResponse>(`/api/admin/reports/bein-spend?${buildParams(false)}`, signal),
            readPanelJson<OperationsResponse>(`/api/admin/reports/bein-spend/operations?${buildParams(true)}`, signal),
        ]), ([nextSummary, nextOperations]) => {
            setSummary(nextSummary)
            setOperations(nextOperations)
        })
    }, [buildParams, run])

    useEffect(() => {
        // A superseded filter render must not start another pair of requests.
        const timer = window.setTimeout(() => { void fetchReports() }, 0)
        return () => { window.clearTimeout(timer); cancel() }
    }, [fetchReports, cancel])

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
                        <h1 className="text-2xl font-bold text-foreground">{t.panelUi.reportCopy.spendReport}</h1>
                        <p className="text-sm text-muted-foreground">{t.panelUi.reportCopy.spendHint}</p>
                    </div>
                </div>
                <button
                    onClick={fetchReports}
                    disabled={loading}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm hover:bg-secondary disabled:opacity-60"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    {t.common.refresh}
                </button>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <div className="flex rounded-md border border-border p-1 xl:col-span-2">
                        {[
                            ['today', t.panelUi.reportCopy.today],
                            ['week', t.panelUi.reportCopy.thisWeek],
                            ['month', t.panelUi.reportCopy.thisMonth],
                            ['custom', t.panelUi.reportCopy.custom],
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
                        <span className="mb-1 block text-muted-foreground">{t.panelUi.reportCopy.fromCairo}</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" type="datetime-local" step={60} value={from} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); setPage(1) }} />
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">{t.panelUi.reportCopy.toCairo}</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" type="datetime-local" step={60} value={to} onChange={(e) => { setPreset('custom'); setTo(e.target.value); setPage(1) }} />
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">{t.panelUi.reportCopy.operationType}</span>
                        <select className="h-10 w-full rounded-md border border-border bg-background px-3" value={operationType} onChange={(e) => { setOperationType(e.target.value); setPage(1) }}>
                            <option value="">{t.common.all}</option>
                            <option value="RENEW">{t.panelUi.reportCopy.renew}</option>
                            <option value="CHECK_BALANCE">{t.panelUi.reportCopy.checkBalance}</option>
                            <option value="SIGNAL_REFRESH">{t.panelUi.reportCopy.refreshSignal}</option>
                        </select>
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">{t.panelUi.reportCopy.beinId}</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" value={beinAccountId} onChange={(e) => { setBeinAccountId(e.target.value); setPage(1) }} />
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">{t.panelUi.reportCopy.cardNumber}</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" inputMode="numeric" value={cardNumber} onChange={(e) => { setCardNumber(e.target.value); setPage(1) }} />
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">{t.panelUi.reportCopy.panelUserId}</span>
                        <input className="h-10 w-full rounded-md border border-border bg-background px-3" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1) }} />
                    </label>
                </div>
            </div>

            {error !== null && <PanelLoadError status={error} retry={() => void fetchReports()} />}

            {loading && <p role="status" className="p-6 text-center text-muted-foreground">{tableText.common.loading}</p>}
            {summary && operations && !loading && error === null && <div data-panel-report-results className="contents">
            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{t.panelUi.reportCopy.totalConfirmed}</p>
                    <p className="mt-2 text-2xl font-bold">{formatMoney(summary?.totals.confirmedSpend || 0, currency)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{t.panelUi.reportCopy.confirmedOps}</p>
                    <p className="mt-2 text-2xl font-bold">{summary?.totals.confirmedOperationCount || 0}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{t.panelUi.reportCopy.unconfirmedReview}</p>
                    <p className="mt-2 text-2xl font-bold text-amber-600">{summary?.totals.unconfirmedReviewCount || 0}</p>
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border p-4">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-semibold">{t.panelUi.reportCopy.groupedAccounts}</h2>
                </div>
                <div className="overflow-x-auto">
                    <Table panel density="compact" className="w-full min-w-[820px] text-sm">
                        <TableHeader className="bg-muted/50 text-muted-foreground">
                            <TableRow>
                                <TableHead className="px-4 py-3 text-left">{tableText.panelTable.beinAccount}</TableHead>
                                <TableHead className="px-4 py-3 text-left">{tableText.adminProxies.table.label}</TableHead>
                                <TableHead className="px-4 py-3 text-right">{tableText.panelTable.confirmedSpend}</TableHead>
                                <TableHead className="px-4 py-3 text-right">{tableText.common.operations}</TableHead>
                                <TableHead className="px-4 py-3 text-right">{tableText.panelTable.reviewCount}</TableHead>
                                <TableHead className="px-4 py-3 text-left">{tableText.panelTable.lastCharged}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(summary?.accounts || []).map((account) => (
                                <TableRow key={account.beinAccountId} className="border-t border-border">
                                    <TableCell className="px-4 py-3">{accountDisplay(account.beinUsernameSnapshot, account.beinLabelSnapshot)}</TableCell>
                                    <TableCell className="px-4 py-3">{account.beinLabelSnapshot || '-'}</TableCell>
                                    <TableCell className="px-4 py-3 text-right">{formatMoney(account.confirmedSpend, currency)}</TableCell>
                                    <TableCell className="px-4 py-3 text-right">{account.confirmedOperationCount}</TableCell>
                                    <TableCell className="px-4 py-3 text-right">{account.unconfirmedReviewCount}</TableCell>
                                    <TableCell className="px-4 py-3">{formatDate(account.lastChargedAt)}</TableCell>
                                </TableRow>
                            ))}
                            {summary?.accounts.length === 0 && (
                                <TableRow><TableCell className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>{t.panelUi.reportCopy.noSpend}</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="font-semibold">{t.panelUi.reportCopy.detailRows}</h2>
                    <span className="text-sm text-muted-foreground">{operations?.total || 0} {t.panelUi.reportCopy.rows}</span>
                </div>
                <div className="overflow-x-auto">
                    <Table panel density="compact" className="w-full min-w-[1200px] text-sm">
                        <TableHeader className="bg-muted/50 text-muted-foreground">
                            <TableRow>
                                <TableHead className="px-4 py-3 text-left">{tableText.transactions.typeOperation}</TableHead>
                                <TableHead className="px-4 py-3 text-left">{tableText.panelTable.panelUser}</TableHead>
                                <TableHead className="px-4 py-3 text-left">{tableText.panelTable.beinAccount}</TableHead>
                                <TableHead className="px-4 py-3 text-left">{tableText.userStats.table.card}</TableHead>
                                <TableHead className="px-4 py-3 text-left">{tableText.operations.package}</TableHead>
                                <TableHead className="px-4 py-3 text-right">{tableText.panelTable.before}</TableHead>
                                <TableHead className="px-4 py-3 text-right">{tableText.panelTable.after}</TableHead>
                                <TableHead className="px-4 py-3 text-right">{tableText.panelTable.spend}</TableHead>
                                <TableHead className="px-4 py-3 text-left">{tableText.panelTable.evidence}</TableHead>
                                <TableHead className="px-4 py-3 text-left">{tableText.panelTable.chargedAt}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(operations?.items || []).map((item) => (
                                <TableRow key={item.ledgerId} className="border-t border-border">
                                    <TableCell className="px-4 py-3 font-mono text-xs">{item.operationId}</TableCell>
                                    <TableCell className="px-4 py-3">{item.panelUsername || item.panelUserId || item.customerName || item.customerId}</TableCell>
                                    <TableCell className="px-4 py-3">{accountDisplay(item.beinUsernameSnapshot, item.beinLabelSnapshot)}</TableCell>
                                    <TableCell className="px-4 py-3">{item.cardNumber}</TableCell>
                                    <TableCell className="px-4 py-3">{item.selectedPackageName || item.operationType}</TableCell>
                                    <TableCell className="px-4 py-3 text-right">{formatOptionalMoney(item.dealerBalanceBefore)}</TableCell>
                                    <TableCell className="px-4 py-3 text-right">{formatOptionalMoney(item.dealerBalanceAfter)}</TableCell>
                                    <TableCell className="px-4 py-3 text-right font-medium">{formatMoney(item.spendAmount, currency)}</TableCell>
                                    <TableCell className="px-4 py-3">{evidenceSourceLabel(item.evidenceSource, t)}</TableCell>
                                    <TableCell className="px-4 py-3">{formatDate(item.chargedAt)}</TableCell>
                                </TableRow>
                            ))}
                            {operations?.items.length === 0 && (
                                <TableRow><TableCell className="px-4 py-8 text-center text-muted-foreground" colSpan={10}>{t.panelUi.reportCopy.noOperationRows}</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex items-center justify-between border-t border-border p-4">
                    <button className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t.panelUi.reportCopy.previous}</button>
                    <span className="text-sm text-muted-foreground">{t.panelUi.reportCopy.page} {page} {t.panelUi.reportCopy.of} {totalPages}</span>
                    <button className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>{t.panelUi.reportCopy.next}</button>
                </div>
            </div>
            </div>}
        </div>
    )
}
