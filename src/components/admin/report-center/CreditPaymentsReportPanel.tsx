'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, CreditCard, RefreshCw, Search, Users } from 'lucide-react'

type CreditPaymentRange = 'today' | 'week' | 'month' | 'custom'

type CreditPaymentSummary = {
    totalPaidUsd: number
    paymentCount: number
    usersCount: number
    recordersCount: number
}

type CreditPaymentDaily = {
    date: string
    totalPaidUsd: number
    paymentCount: number
}

type CreditPaymentRow = {
    id: string
    amountUsd: number
    debtAfterUsd: number
    ownerTypeSnapshot: string | null
    ownerIdSnapshot: string | null
    ownerLabelSnapshot: string | null
    note: string | null
    createdAt: string
    createdAtCairoDate: string
    user: {
        id: string
        username: string
        email: string
    }
    recordedBy: {
        id: string
        username: string
        email: string
        role: string
    } | null
}

type CreditPaymentsResponse = {
    filters: {
        page: number
        limit: number
        range: CreditPaymentRange
        from: string | null
        to: string | null
        fromInput: string
        toInput: string
        userSearch: string
        recordedBySearch: string
    }
    summary: CreditPaymentSummary
    daily: CreditPaymentDaily[]
    rows: CreditPaymentRow[]
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
}

const EMPTY_SUMMARY: CreditPaymentSummary = {
    totalPaidUsd: 0,
    paymentCount: 0,
    usersCount: 0,
    recordersCount: 0,
}

function formatUsd(value: number): string {
    return `USD ${value.toFixed(2)}`
}

function formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

function buildQuery(params: {
    range: string
    from: string
    to: string
    userSearch: string
    recordedBySearch: string
    page?: string
}) {
    const query = new URLSearchParams()
    query.set('tab', 'credit-payments')
    query.set('range', params.range || 'today')
    if (params.range === 'custom') {
        if (params.from) query.set('from', params.from)
        if (params.to) query.set('to', params.to)
    }
    if (params.userSearch) query.set('userSearch', params.userSearch)
    if (params.recordedBySearch) query.set('recordedBySearch', params.recordedBySearch)
    if (params.page) query.set('page', params.page)
    return query
}

function SummaryCard({
    label,
    value,
    icon: Icon,
}: {
    label: string
    value: string | number
    icon: typeof CreditCard
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-3 text-2xl font-bold text-foreground">{value}</div>
        </div>
    )
}

function DetailRows({ rows }: { rows: CreditPaymentRow[] }) {
    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No recorded debt payments match the current filters.
            </div>
        )
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                        <th className="px-4 py-3 text-start font-medium">Date</th>
                        <th className="px-4 py-3 text-start font-medium">User</th>
                        <th className="px-4 py-3 text-start font-medium">Amount</th>
                        <th className="px-4 py-3 text-start font-medium">Debt After</th>
                        <th className="px-4 py-3 text-start font-medium">Recorded By</th>
                        <th className="px-4 py-3 text-start font-medium">Owner</th>
                        <th className="px-4 py-3 text-start font-medium">Note</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/20">
                            <td className="px-4 py-3">
                                <span className="block font-medium text-foreground">{row.createdAtCairoDate}</span>
                                <span className="block text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                            </td>
                            <td className="px-4 py-3">
                                <span className="block font-semibold text-foreground">{row.user.username}</span>
                                <span className="block text-xs text-muted-foreground">{row.user.email}</span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-emerald-300">{formatUsd(row.amountUsd)}</td>
                            <td className="px-4 py-3 text-foreground">{formatUsd(row.debtAfterUsd)}</td>
                            <td className="px-4 py-3">
                                {row.recordedBy ? (
                                    <>
                                        <span className="block font-medium text-foreground">{row.recordedBy.username}</span>
                                        <span className="block text-xs text-muted-foreground">{row.recordedBy.role}</span>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Unavailable</span>
                                )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                                {row.ownerLabelSnapshot || row.ownerTypeSnapshot || row.ownerIdSnapshot || '-'}
                            </td>
                            <td className="max-w-[260px] px-4 py-3 text-muted-foreground">
                                <span className="line-clamp-2">{row.note || '-'}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default function CreditPaymentsReportPanel() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [data, setData] = useState<CreditPaymentsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [form, setForm] = useState({
        range: searchParams.get('range') || 'today',
        from: searchParams.get('from') || '',
        to: searchParams.get('to') || '',
        userSearch: searchParams.get('userSearch') || '',
        recordedBySearch: searchParams.get('recordedBySearch') || '',
    })

    const cards = useMemo(() => {
        const summary = data?.summary ?? EMPTY_SUMMARY
        return [
            { label: 'Total Paid', value: formatUsd(summary.totalPaidUsd), icon: CreditCard },
            { label: 'Payments', value: summary.paymentCount, icon: CalendarDays },
            { label: 'Users', value: summary.usersCount, icon: Users },
            { label: 'Recorders', value: summary.recordersCount, icon: Users },
        ]
    }, [data?.summary])

    async function loadReport(params = searchParams) {
        setLoading(true)
        setError('')
        try {
            const query = new URLSearchParams(params.toString())
            query.delete('tab')
            const response = await fetch(`/api/admin/reports/credit-payments?${query.toString()}`, { cache: 'no-store' })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || 'Failed to load credit payments')
            setData(payload)
            setForm({
                range: payload.filters.range,
                from: payload.filters.fromInput,
                to: payload.filters.toInput,
                userSearch: payload.filters.userSearch,
                recordedBySearch: payload.filters.recordedBySearch,
            })
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load credit payments')
        } finally {
            setLoading(false)
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
        query.set('tab', 'credit-payments')
        query.set('page', String(page))
        router.replace(`${pathname}?${query.toString()}`, { scroll: false })
    }

    return (
        <section className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Credit Payments</h2>
                        <p className="text-sm text-muted-foreground">
                            Recorded payments that reduce user credit debt.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadReport()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground hover:bg-muted"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                <form onSubmit={applyFilters} className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Range</span>
                        <select
                            value={form.range}
                            onChange={(event) => setForm((current) => ({ ...current, range: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                        >
                            <option value="today">Today</option>
                            <option value="week">This week</option>
                            <option value="month">This month</option>
                            <option value="custom">Custom</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">From</span>
                        <input
                            type="date"
                            value={form.from}
                            disabled={form.range !== 'custom'}
                            onChange={(event) => setForm((current) => ({ ...current, from: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground disabled:opacity-60"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">To</span>
                        <input
                            type="date"
                            value={form.to}
                            disabled={form.range !== 'custom'}
                            onChange={(event) => setForm((current) => ({ ...current, to: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground disabled:opacity-60"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">User</span>
                        <input
                            value={form.userSearch}
                            onChange={(event) => setForm((current) => ({ ...current, userSearch: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                            placeholder="Username or email"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Recorded By</span>
                        <input
                            value={form.recordedBySearch}
                            onChange={(event) => setForm((current) => ({ ...current, recordedBySearch: event.target.value }))}
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground"
                            placeholder="Admin or agent"
                        />
                    </label>
                    <div className="flex items-end">
                        <button
                            type="submit"
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            <Search className="h-4 w-4" />
                            Apply
                        </button>
                    </div>
                </form>
            </div>

            {error && (
                <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card) => (
                    <SummaryCard key={card.label} {...card} />
                ))}
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">Daily totals</h3>
                        <p className="text-sm text-muted-foreground">
                            {data?.filters.fromInput ?? '-'} to {data?.filters.toInput ?? '-'}
                        </p>
                    </div>
                    {loading && <span className="text-sm text-muted-foreground">Loading...</span>}
                </div>
                {data?.daily.length ? (
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[520px] text-sm">
                            <thead className="bg-muted/30 text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 text-start font-medium">Day</th>
                                    <th className="px-4 py-3 text-start font-medium">Total Paid</th>
                                    <th className="px-4 py-3 text-start font-medium">Payments</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {data.daily.map((day) => (
                                    <tr key={day.date}>
                                        <td className="px-4 py-3 font-semibold text-foreground">{day.date}</td>
                                        <td className="px-4 py-3 font-bold text-emerald-300">{formatUsd(day.totalPaidUsd)}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{day.paymentCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                        No daily totals for the current filters.
                    </div>
                )}
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">Payment ledger</h3>
                        <p className="text-sm text-muted-foreground">
                            {data?.pagination.total ?? 0} recorded payments.
                        </p>
                    </div>
                </div>
                <DetailRows rows={data?.rows ?? []} />
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
        </section>
    )
}
