'use client'

import { useTranslation } from '@/hooks/useTranslation'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Coins, Filter, RefreshCw, Search, Undo2, Wallet } from 'lucide-react'
import type { PointAnalysisSummary, PointsAnalysisRow } from '@/lib/points/analysis'

type Pagination = {
    page: number
    limit: number
    total: number
    totalPages: number
}

type PointsAnalysisResponse = {
    summary: PointAnalysisSummary
    rows: PointsAnalysisRow[]
    pagination: Pagination
    settings: {
        pointsEnabled: boolean
        conversionEnabled: boolean
        conversionPoints: number
        conversionAmount: number
        currencyLabel: string
    }
}

type OwnerTimelineResponse = {
    owner: PointsAnalysisRow['owner'] & { balance: number }
    summary: PointAnalysisSummary
    rows: PointsAnalysisRow[]
    pagination: Pagination
}

const EMPTY_SUMMARY: PointAnalysisSummary = {
    earnedPoints: 0,
    availablePoints: 0,
    convertedPoints: 0,
    convertedBalanceAmount: 0,
    reversedPoints: 0,
    pendingPoints: 0,
    cancelledPoints: 0,
    legacyPoints: 0,
    ownersCount: 0,
    ledgerEntriesCount: 0,
}

function formatPoints(value: number): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)
}

function formatMoney(value: number, currency = 'USD'): string {
    return `${currency} ${value.toFixed(2)}`
}

function summaryCards(summary: PointAnalysisSummary, currency: string, t: ReturnType<typeof useTranslation>['t']) {
    return [
        { label: t.panelUi.reportCopy.earned, value: formatPoints(summary.earnedPoints), icon: Coins },
        { label: t.panelUi.operationalCopy.available, value: formatPoints(summary.availablePoints), icon: Wallet },
        { label: t.panelUi.reportCopy.converted, value: formatPoints(summary.convertedPoints), icon: Wallet },
        { label: t.panelUi.reportCopy.convertedAmount, value: formatMoney(summary.convertedBalanceAmount, currency), icon: Wallet },
        { label: t.panelUi.reportCopy.reversed, value: formatPoints(summary.reversedPoints), icon: Undo2 },
        { label: t.status.pending, value: formatPoints(summary.pendingPoints), icon: Coins },
        { label: t.status.cancelled, value: formatPoints(summary.cancelledPoints), icon: Undo2 },
        { label: t.panelUi.reportCopy.legacyManual, value: formatPoints(summary.legacyPoints), icon: Filter },
    ]
}

function buildQuery(params: Record<string, string>) {
    const query = new URLSearchParams()
    query.set('tab', 'points-analysis')
    for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, value)
    }
    return query
}

function StatusBadge({ status }: { status: string }) {
    const { t } = useTranslation()
    const tone = status === 'AVAILABLE'
        ? 'bg-emerald-500/15 text-emerald-300'
        : status === 'REDEEMED'
            ? 'bg-blue-500/15 text-blue-300'
            : status === 'CANCELLED'
                ? 'bg-red-500/15 text-red-300'
                : 'bg-amber-500/15 text-amber-300'

    return <span className={`rounded-full px-2 py-1 text-xs ${tone}`}>{({ AVAILABLE: t.panelUi.operationalCopy.available, REDEEMED: t.panelUi.reportCopy.redeemed, CANCELLED: t.status.cancelled, PENDING: t.status.pending } as Record<string, string>)[status] || status}</span>
}

function PointsRowsTable({ rows, onOwnerClick }: {
    rows: PointsAnalysisRow[]
    onOwnerClick: (ownerId: string) => void
}) {
    const { t } = useTranslation()
    const { t: tableText } = useTranslation()
    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                {t.panelUi.reportCopy.noPoints}
            </div>
        )
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-border">
            <Table panel density="compact" className="min-w-[1100px] w-full text-sm">
                <TableHeader className="bg-muted/30 text-muted-foreground">
                    <TableRow>
                        <TableHead className="px-4 py-3 text-start font-medium">{tableText.panelTable.owner}</TableHead>
                        <TableHead className="px-4 py-3 text-start font-medium">{tableText.panelTable.source}</TableHead>
                        <TableHead className="px-4 py-3 text-start font-medium">{tableText.common.status}</TableHead>
                        <TableHead className="px-4 py-3 text-start font-medium">{tableText.panelTable.points}</TableHead>
                        <TableHead className="px-4 py-3 text-start font-medium">{tableText.panelTable.money}</TableHead>
                        <TableHead className="px-4 py-3 text-start font-medium">{tableText.panelTable.reference}</TableHead>
                        <TableHead className="px-4 py-3 text-start font-medium">{tableText.common.date}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                    {rows.map((row) => (
                        <TableRow key={row.ledgerEntryId} className="hover:bg-muted/20">
                            <TableCell className="px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => onOwnerClick(row.owner.id)}
                                    className="text-start text-primary hover:text-primary/80"
                                >
                                    <span className="block font-semibold">{row.owner.username}</span>
                                    <span className="block text-xs text-muted-foreground">{row.owner.role}</span>
                                </button>
                            </TableCell>
                            <TableCell className="px-4 py-3">
                                <span className="block font-medium text-foreground">{row.sourceLabel}</span>
                                <span className="block text-xs text-muted-foreground">{row.sourceType}</span>
                            </TableCell>
                            <TableCell className="px-4 py-3"><StatusBadge status={row.status} /></TableCell>
                            <TableCell className="px-4 py-3 font-semibold">{formatPoints(row.points)}</TableCell>
                            <TableCell className="px-4 py-3">
                                {row.redemptionRef
                                    ? formatMoney(row.redemptionRef.balanceAmountUsd)
                                    : row.amountUsdSnapshot !== null
                                        ? formatMoney(row.amountUsdSnapshot)
                                        : '-'}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                                {row.operationRef?.cardNumber
                                    ? t.panelUi.reportCopy.cardReference.replace('{id}', row.operationRef.cardNumber)
                                    : row.redemptionRef
                                        ? t.panelUi.reportCopy.redemptionReference.replace('{id}', row.redemptionRef.id.slice(0, 8))
                                        : row.transactionRef
                                            ? t.panelUi.reportCopy.transactionReference.replace('{id}', row.transactionRef.id.slice(0, 8))
                                            : t.panelUi.reportCopy.referenceUnavailable}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs text-muted-foreground">{row.createdAtDisplay}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

export default function PointsAnalysisReportPanel() {
    const { t } = useTranslation()
    const { t: tableText } = useTranslation()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [data, setData] = useState<PointsAnalysisResponse | null>(null)
    const [ownerData, setOwnerData] = useState<OwnerTimelineResponse | null>(null)
    const [selectedOwnerId, setSelectedOwnerId] = useState('')
    const { load, loading, error } = usePanelRequest()
    const { load: loadOwnerRequest, loading: ownerLoading, error: ownerError, cancel: cancelOwner } = usePanelRequest()
    const [form, setForm] = useState({
        ownerSearch: searchParams.get('ownerSearch') ?? '',
        role: searchParams.get('role') ?? '',
        sourceType: searchParams.get('sourceType') ?? '',
        status: searchParams.get('status') ?? '',
        conversionState: searchParams.get('conversionState') ?? '',
        from: searchParams.get('from') ?? '',
        to: searchParams.get('to') ?? '',
    })

    const currency = data?.settings.currencyLabel ?? 'USD'
    const cards = useMemo(() => summaryCards(data?.summary ?? EMPTY_SUMMARY, currency, t), [data?.summary, currency, t])

    async function loadReport(params = searchParams) {
        const query = new URLSearchParams(params.toString())
        query.delete('tab')
        setData(null)
        cancelOwner()
        setSelectedOwnerId('')
        setOwnerData(null)
        await load<PointsAnalysisResponse>(`/api/admin/reports/points-analysis?${query.toString()}`, payload => {
            setData(payload)
        })
    }

    async function loadOwner(ownerId: string) {
        setSelectedOwnerId(ownerId)
        setOwnerData(null)
        await loadOwnerRequest<OwnerTimelineResponse>(`/api/admin/reports/points-analysis/owners/${encodeURIComponent(ownerId)}`, setOwnerData)
    }

    useEffect(() => {
        void loadReport()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    function applyFilters(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const query = buildQuery({ ...form, page: '1' })
        router.replace(`${pathname}?${query.toString()}`, { scroll: false })
    }

    function changePage(page: number) {
        const query = new URLSearchParams(searchParams.toString())
        query.set('tab', 'points-analysis')
        query.set('page', String(page))
        router.replace(`${pathname}?${query.toString()}`, { scroll: false })
    }

    return (
        <section className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">{t.panelUi.reportCopy.pointsAnalysis}</h2>
                        <p className="text-sm text-muted-foreground">
                            {t.panelUi.reportCopy.pointsHint}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadReport()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground hover:bg-muted"
                    >
                        <RefreshCw className="h-4 w-4" />
                        {t.common.refresh}
                    </button>
                </div>

                <form onSubmit={applyFilters} className="mt-5 grid gap-3 md:grid-cols-4">
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.owner}</span>
                        <input
                            value={form.ownerSearch}
                            onChange={(event) => setForm((current) => ({ ...current, ownerSearch: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                            placeholder={t.panelUi.reportCopy.usernameEmail}
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.role}</span>
                        <select
                            value={form.role}
                            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        >
                            <option value="">{t.panelUi.reportCopy.allRoles}</option>
                            <option value="ADMIN">{t.panelUi.reportCopy.admin}</option>
                            <option value="MANAGER">{t.panelUi.reportCopy.manager}</option>
                            <option value="AGENT">{t.common.ownerAgent}</option>
                            <option value="USER">{t.admin.users.roles.user}</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.source}</span>
                        <select
                            value={form.sourceType}
                            onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        >
                            <option value="">{t.panelUi.reportCopy.allSources}</option>
                            <option value="OPERATION_SPEND">{t.panelUi.reportCopy.operationSpend}</option>
                            <option value="EID_REWARD">{t.panelUi.reportCopy.eidReward}</option>
                            <option value="POINT_CASH_REDEMPTION">{t.panelUi.reportCopy.convertedBalance}</option>
                            <option value="POINT_REVERSAL">{t.panelUi.reportCopy.reversal}</option>
                            <option value="ADMIN_ADJUSTMENT">{t.panelUi.reportCopy.adminManual}</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.state}</span>
                        <select
                            value={form.conversionState}
                            onChange={(event) => setForm((current) => ({ ...current, conversionState: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        >
                            <option value="">{t.panelUi.reportCopy.allStates}</option>
                            <option value="available">{t.panelUi.operationalCopy.available}</option>
                            <option value="converted">{t.panelUi.reportCopy.converted}</option>
                            <option value="reversed">{t.panelUi.reportCopy.reversed}</option>
                            <option value="pending">{t.status.pending}</option>
                            <option value="cancelled">{t.status.cancelled}</option>
                            <option value="legacy">{t.panelUi.reportCopy.legacyManual}</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.status}</span>
                        <select
                            value={form.status}
                            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        >
                            <option value="">{t.panelUi.reportCopy.allStatusesLower}</option>
                            <option value="PENDING">{t.status.pending}</option>
                            <option value="AVAILABLE">{t.panelUi.operationalCopy.available}</option>
                            <option value="REDEEMED">{t.panelUi.reportCopy.redeemed}</option>
                            <option value="CANCELLED">{t.status.cancelled}</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.from}</span>
                        <input
                            type="date"
                            value={form.from}
                            onChange={(event) => setForm((current) => ({ ...current, from: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.to}</span>
                        <input
                            type="date"
                            value={form.to}
                            onChange={(event) => setForm((current) => ({ ...current, to: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        />
                    </label>
                    <div className="flex items-end">
                        <button
                            type="submit"
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            <Search className="h-4 w-4" />
                            {t.panelUi.reportCopy.applyFilters}
                        </button>
                    </div>
                </form>
            </div>

            {error !== null && <PanelLoadError status={error} retry={() => void loadReport()} />}
            {selectedOwnerId && ownerError !== null && <PanelLoadError status={ownerError} retry={() => void loadOwner(selectedOwnerId)} />}

            {loading && <p role="status" className="p-6 text-center text-muted-foreground">{tableText.common.loading}</p>}
            {data && !loading && error === null && <div data-panel-report-results className="contents">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card) => {
                    const Icon = card.icon
                    return (
                        <div key={card.label} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-muted-foreground">{card.label}</span>
                                <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="mt-3 text-2xl font-bold text-foreground">{card.value}</div>
                        </div>
                    )
                })}
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">{t.panelUi.reportCopy.pointLedger}</h3>
                        <p className="text-sm text-muted-foreground">
                            {data?.pagination.total ?? 0} {t.panelUi.reportCopy.rowsAcross} {data?.summary.ownersCount ?? 0} {t.panelUi.reportCopy.owners}
                        </p>
                    </div>
                    {loading && <span className="text-sm text-muted-foreground">{t.common.loading}</span>}
                </div>
                <PointsRowsTable rows={data?.rows ?? []} onOwnerClick={loadOwner} />
                {data && data.pagination.totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            disabled={data.pagination.page <= 1}
                            onClick={() => changePage(data.pagination.page - 1)}
                            className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                        >
                            {t.panelUi.reportCopy.previous}
                        </button>
                        <span className="text-sm text-muted-foreground">
                            {t.panelUi.reportCopy.page} {data.pagination.page} / {data.pagination.totalPages}
                        </span>
                        <button
                            type="button"
                            disabled={data.pagination.page >= data.pagination.totalPages}
                            onClick={() => changePage(data.pagination.page + 1)}
                            className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                        >
                            {t.panelUi.reportCopy.next}
                        </button>
                    </div>
                )}
            </div>

            {selectedOwnerId && (
                <div className="rounded-lg border border-border bg-card p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">{t.panelUi.reportCopy.ownerTimeline}</h3>
                            <p className="text-sm text-muted-foreground">
                                {ownerData
                                    ? `${ownerData.owner.username} - ${ownerData.owner.role}`
                                    : ownerLoading
                                        ? t.panelUi.reportCopy.loadingTimeline
                                        : t.panelUi.reportCopy.timelineUnavailable}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                cancelOwner()
                                setSelectedOwnerId('')
                                setOwnerData(null)
                            }}
                            className="rounded-md border border-border px-3 py-2 text-sm"
                        >
                            {t.common.close}
                        </button>
                    </div>
                    {ownerData && (
                        <>
                            <div className="mb-4 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-md bg-muted/20 p-3">
                                    <div className="text-xs text-muted-foreground">{t.panelUi.operationalCopy.available}</div>
                                    <div className="text-lg font-semibold">{formatPoints(ownerData.summary.availablePoints)}</div>
                                </div>
                                <div className="rounded-md bg-muted/20 p-3">
                                    <div className="text-xs text-muted-foreground">{t.panelUi.reportCopy.converted}</div>
                                    <div className="text-lg font-semibold">{formatPoints(ownerData.summary.convertedPoints)}</div>
                                </div>
                                <div className="rounded-md bg-muted/20 p-3">
                                    <div className="text-xs text-muted-foreground">{t.panelUi.reportCopy.balanceCredited}</div>
                                    <div className="text-lg font-semibold">{formatMoney(ownerData.summary.convertedBalanceAmount)}</div>
                                </div>
                            </div>
                            <PointsRowsTable rows={ownerData.rows} onOwnerClick={loadOwner} />
                        </>
                    )}
                </div>
            )}
            </div>}
        </section>
    )
}
