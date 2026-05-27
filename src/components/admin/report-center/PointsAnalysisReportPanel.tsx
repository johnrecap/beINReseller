'use client'

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

function summaryCards(summary: PointAnalysisSummary, currency: string) {
    return [
        { label: 'Earned', value: formatPoints(summary.earnedPoints), icon: Coins },
        { label: 'Available', value: formatPoints(summary.availablePoints), icon: Wallet },
        { label: 'Converted', value: formatPoints(summary.convertedPoints), icon: Wallet },
        { label: 'Converted balance', value: formatMoney(summary.convertedBalanceAmount, currency), icon: Wallet },
        { label: 'Reversed', value: formatPoints(summary.reversedPoints), icon: Undo2 },
        { label: 'Pending', value: formatPoints(summary.pendingPoints), icon: Coins },
        { label: 'Cancelled', value: formatPoints(summary.cancelledPoints), icon: Undo2 },
        { label: 'Legacy/manual', value: formatPoints(summary.legacyPoints), icon: Filter },
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
    const tone = status === 'AVAILABLE'
        ? 'bg-emerald-500/15 text-emerald-300'
        : status === 'REDEEMED'
            ? 'bg-blue-500/15 text-blue-300'
            : status === 'CANCELLED'
                ? 'bg-red-500/15 text-red-300'
                : 'bg-amber-500/15 text-amber-300'

    return <span className={`rounded-full px-2 py-1 text-xs ${tone}`}>{status}</span>
}

function PointsRowsTable({ rows, onOwnerClick }: {
    rows: PointsAnalysisRow[]
    onOwnerClick: (ownerId: string) => void
}) {
    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No point movements match the current filters.
            </div>
        )
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                        <th className="px-4 py-3 text-start font-medium">Owner</th>
                        <th className="px-4 py-3 text-start font-medium">Source</th>
                        <th className="px-4 py-3 text-start font-medium">Status</th>
                        <th className="px-4 py-3 text-start font-medium">Points</th>
                        <th className="px-4 py-3 text-start font-medium">Money</th>
                        <th className="px-4 py-3 text-start font-medium">Reference</th>
                        <th className="px-4 py-3 text-start font-medium">Date</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                        <tr key={row.ledgerEntryId} className="hover:bg-muted/20">
                            <td className="px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => onOwnerClick(row.owner.id)}
                                    className="text-start text-primary hover:text-primary/80"
                                >
                                    <span className="block font-semibold">{row.owner.username}</span>
                                    <span className="block text-xs text-muted-foreground">{row.owner.role}</span>
                                </button>
                            </td>
                            <td className="px-4 py-3">
                                <span className="block font-medium text-foreground">{row.sourceLabel}</span>
                                <span className="block text-xs text-muted-foreground">{row.sourceType}</span>
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                            <td className="px-4 py-3 font-semibold">{formatPoints(row.points)}</td>
                            <td className="px-4 py-3">
                                {row.redemptionRef
                                    ? formatMoney(row.redemptionRef.balanceAmountUsd)
                                    : row.amountUsdSnapshot !== null
                                        ? formatMoney(row.amountUsdSnapshot)
                                        : '-'}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                {row.operationRef?.cardNumber
                                    ? `Card ${row.operationRef.cardNumber}`
                                    : row.redemptionRef
                                        ? `Redemption ${row.redemptionRef.id.slice(0, 8)}`
                                        : row.transactionRef
                                            ? `Transaction ${row.transactionRef.id.slice(0, 8)}`
                                            : 'Reference unavailable'}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.createdAtDisplay}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default function PointsAnalysisReportPanel() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [data, setData] = useState<PointsAnalysisResponse | null>(null)
    const [ownerData, setOwnerData] = useState<OwnerTimelineResponse | null>(null)
    const [selectedOwnerId, setSelectedOwnerId] = useState('')
    const [loading, setLoading] = useState(true)
    const [ownerLoading, setOwnerLoading] = useState(false)
    const [error, setError] = useState('')
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
    const cards = useMemo(() => summaryCards(data?.summary ?? EMPTY_SUMMARY, currency), [data?.summary, currency])

    async function loadReport(params = searchParams) {
        setLoading(true)
        setError('')
        try {
            const query = new URLSearchParams(params.toString())
            query.delete('tab')
            const response = await fetch(`/api/admin/reports/points-analysis?${query.toString()}`)
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || 'Failed to load points analysis')
            setData(payload)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load points analysis')
        } finally {
            setLoading(false)
        }
    }

    async function loadOwner(ownerId: string) {
        setSelectedOwnerId(ownerId)
        setOwnerLoading(true)
        try {
            const response = await fetch(`/api/admin/reports/points-analysis/owners/${encodeURIComponent(ownerId)}`)
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || 'Failed to load owner timeline')
            setOwnerData(payload)
        } catch {
            setOwnerData(null)
        } finally {
            setOwnerLoading(false)
        }
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
                        <h2 className="text-xl font-bold text-foreground">Points Analysis</h2>
                        <p className="text-sm text-muted-foreground">
                            Read-only audit of where points came from, what is still available, and what converted to balance.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadReport()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground hover:bg-muted"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </button>
                </div>

                <form onSubmit={applyFilters} className="mt-5 grid gap-3 md:grid-cols-4">
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Owner</span>
                        <input
                            value={form.ownerSearch}
                            onChange={(event) => setForm((current) => ({ ...current, ownerSearch: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                            placeholder="Username or email"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Role</span>
                        <select
                            value={form.role}
                            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        >
                            <option value="">All roles</option>
                            <option value="ADMIN">Admin</option>
                            <option value="MANAGER">Manager</option>
                            <option value="AGENT">Agent</option>
                            <option value="USER">User</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Source</span>
                        <select
                            value={form.sourceType}
                            onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        >
                            <option value="">All sources</option>
                            <option value="OPERATION_SPEND">Operation spend</option>
                            <option value="EID_REWARD">Eid reward</option>
                            <option value="POINT_CASH_REDEMPTION">Converted to balance</option>
                            <option value="POINT_REVERSAL">Reversal</option>
                            <option value="ADMIN_ADJUSTMENT">Admin/manual</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">State</span>
                        <select
                            value={form.conversionState}
                            onChange={(event) => setForm((current) => ({ ...current, conversionState: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        >
                            <option value="">All states</option>
                            <option value="available">Available</option>
                            <option value="converted">Converted</option>
                            <option value="reversed">Reversed</option>
                            <option value="pending">Pending</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="legacy">Legacy/manual</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <select
                            value={form.status}
                            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        >
                            <option value="">All statuses</option>
                            <option value="PENDING">Pending</option>
                            <option value="AVAILABLE">Available</option>
                            <option value="REDEEMED">Redeemed</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">From</span>
                        <input
                            type="date"
                            value={form.from}
                            onChange={(event) => setForm((current) => ({ ...current, from: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">To</span>
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
                            Apply filters
                        </button>
                    </div>
                </form>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {error}
                </div>
            )}

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
                        <h3 className="text-lg font-semibold text-foreground">Point movement ledger</h3>
                        <p className="text-sm text-muted-foreground">
                            {data?.pagination.total ?? 0} rows across {data?.summary.ownersCount ?? 0} owners.
                        </p>
                    </div>
                    {loading && <span className="text-sm text-muted-foreground">Loading...</span>}
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
                            Previous
                        </button>
                        <span className="text-sm text-muted-foreground">
                            Page {data.pagination.page} / {data.pagination.totalPages}
                        </span>
                        <button
                            type="button"
                            disabled={data.pagination.page >= data.pagination.totalPages}
                            onClick={() => changePage(data.pagination.page + 1)}
                            className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {(selectedOwnerId || ownerLoading) && (
                <div className="rounded-lg border border-border bg-card p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">Owner timeline</h3>
                            <p className="text-sm text-muted-foreground">
                                {ownerData
                                    ? `${ownerData.owner.username} - ${ownerData.owner.role}`
                                    : ownerLoading
                                        ? 'Loading owner timeline...'
                                        : 'Owner timeline unavailable'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedOwnerId('')
                                setOwnerData(null)
                            }}
                            className="rounded-md border border-border px-3 py-2 text-sm"
                        >
                            Close
                        </button>
                    </div>
                    {ownerData && (
                        <>
                            <div className="mb-4 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-md bg-muted/20 p-3">
                                    <div className="text-xs text-muted-foreground">Available</div>
                                    <div className="text-lg font-semibold">{formatPoints(ownerData.summary.availablePoints)}</div>
                                </div>
                                <div className="rounded-md bg-muted/20 p-3">
                                    <div className="text-xs text-muted-foreground">Converted</div>
                                    <div className="text-lg font-semibold">{formatPoints(ownerData.summary.convertedPoints)}</div>
                                </div>
                                <div className="rounded-md bg-muted/20 p-3">
                                    <div className="text-xs text-muted-foreground">Balance credited</div>
                                    <div className="text-lg font-semibold">{formatMoney(ownerData.summary.convertedBalanceAmount)}</div>
                                </div>
                            </div>
                            <PointsRowsTable rows={ownerData.rows} onOwnerClick={loadOwner} />
                        </>
                    )}
                </div>
            )}
        </section>
    )
}
