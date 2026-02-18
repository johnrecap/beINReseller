'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

type IssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE' | 'IGNORED'

interface IntegrityIssue {
    id: string
    operationId: string
    issueType: string
    severity: string
    status: IssueStatus
    operationAmount: number | null
    userDeductAmount: number | null
    beinUsernameSnapshot: string | null
    userBalanceBefore: number | null
    userBalanceAfter: number | null
    beinBalanceBefore: number | null
    beinBalanceAfter: number | null
    beinDelta: number | null
    detectedAt: string
    user?: { username: string; email: string } | null
    beinAccount?: { username: string; label: string | null } | null
    operation?: { cardNumber: string; type: string; status: string } | null
}

interface SummaryData {
    total: number
    openHigh: number
    byStatus: Array<{ status: string; _count: number }>
    byType: Array<{ issueType: string; _count: number }>
    totals: {
        requestedTotal: number
        beinDeltaTotal: number
        deductedTotal: number
    }
    spentByBeinAccount: Array<{
        beinAccountId: string
        username: string | null
        label: string | null
        requestedTotal: number
        beinDeltaTotal: number
        variance: number
        operationsCount: number
    }>
    spentByUser: Array<{
        userId: string
        username: string | null
        deductedTotal: number
        operationsCount: number
    }>
}

const statusOptions: IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE', 'IGNORED']

export default function IntegrityReportsPage() {
    const { data: session, status } = useSession()
    const { t, dir } = useTranslation()
    const [issues, setIssues] = useState<IntegrityIssue[]>([])
    const [summary, setSummary] = useState<SummaryData | null>(null)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [issueStatus, setIssueStatus] = useState<IssueStatus | ''>('OPEN')
    const [issueType, setIssueType] = useState('')
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [backfilling, setBackfilling] = useState(false)
    const tableTextAlignClass = dir === 'rtl' ? 'text-right' : 'text-left'
    const formatAmount = (value: number | null) =>
        typeof value === 'number' ? value.toFixed(2) : '-'

    useEffect(() => {
        if (status === 'unauthenticated') redirect('/login')
        if (session?.user?.role !== 'ADMIN') redirect('/dashboard')
    }, [session, status])

    const fetchSummary = useCallback(async () => {
        const res = await fetch('/api/admin/reports/integrity/summary?days=30')
        if (!res.ok) return
        const data = await res.json()
        setSummary(data)
    }, [])

    const fetchIssues = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: '20',
                search,
                status: issueStatus,
                issueType
            })
            const res = await fetch(`/api/admin/reports/integrity?${params}`)
            if (!res.ok) return
            const data = await res.json()
            setIssues(data.issues || [])
            setTotalPages(data.totalPages || 1)
        } finally {
            setLoading(false)
        }
    }, [page, search, issueStatus, issueType])

    useEffect(() => {
        fetchSummary()
        fetchIssues()
    }, [fetchSummary, fetchIssues])

    const updateStatus = async (id: string, nextStatus: IssueStatus) => {
        setUpdatingId(id)
        try {
            await fetch(`/api/admin/reports/integrity/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus })
            })
            await fetchIssues()
            await fetchSummary()
        } finally {
            setUpdatingId(null)
        }
    }

    const runScan = async () => {
        setLoading(true)
        try {
            await fetch('/api/admin/reports/integrity/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: 7, limit: 300 })
            })
            await fetchIssues()
            await fetchSummary()
        } finally {
            setLoading(false)
        }
    }

    const runBackfillUserBalances = async () => {
        setBackfilling(true)
        try {
            await fetch('/api/admin/reports/integrity/backfill-balances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: 60, limit: 2000 })
            })
            await fetchIssues()
        } finally {
            setBackfilling(false)
        }
    }

    return (
        <div className="p-6 space-y-6" dir={dir}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Integrity Reports</h1>
                        <p className="text-sm text-muted-foreground">Financial mismatch detection between beIN debit and user deduction.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={runBackfillUserBalances}
                        disabled={backfilling}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-secondary disabled:opacity-60"
                    >
                        <RefreshCw className={`w-4 h-4 ${backfilling ? 'animate-spin' : ''}`} />
                        Backfill User Balances
                    </button>
                    <button
                        onClick={runScan}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-secondary"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Scan Last 7 Days
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Total Issues (30d)</p>
                    <p className="text-2xl font-bold">{summary?.total ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Open High Severity</p>
                    <p className="text-2xl font-bold text-red-500">{summary?.openHigh ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Open</p>
                    <p className="text-2xl font-bold">
                        {summary?.byStatus?.find(s => s.status === 'OPEN')?._count ?? 0}
                    </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Resolved</p>
                    <p className="text-2xl font-bold text-emerald-500">
                        {summary?.byStatus?.find(s => s.status === 'RESOLVED')?._count ?? 0}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Requested Spend</p>
                    <p className="text-2xl font-bold">{summary?.totals?.requestedTotal?.toFixed(2) ?? '0.00'}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">beIN Delta Spend</p>
                    <p className="text-2xl font-bold">{summary?.totals?.beinDeltaTotal?.toFixed(2) ?? '0.00'}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">User Deducted Spend</p>
                    <p className="text-2xl font-bold">{summary?.totals?.deductedTotal?.toFixed(2) ?? '0.00'}</p>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 flex flex-col md:flex-row gap-3">
                <input
                    value={search}
                    onChange={(e) => { setPage(1); setSearch(e.target.value) }}
                    placeholder="Search by operation, card, user, beIN account"
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background"
                />
                <select
                    value={issueStatus}
                    onChange={(e) => { setPage(1); setIssueStatus(e.target.value as IssueStatus | '') }}
                    className="px-3 py-2 rounded-lg border border-border bg-background"
                >
                    <option value="">All Statuses</option>
                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                    value={issueType}
                    onChange={(e) => { setPage(1); setIssueType(e.target.value) }}
                    className="px-3 py-2 rounded-lg border border-border bg-background"
                >
                    <option value="">All Issue Types</option>
                    <option value="NO_BEIN_BALANCE_CHANGE">NO_BEIN_BALANCE_CHANGE</option>
                    <option value="BEIN_DEBIT_NO_USER_DEDUCT">BEIN_DEBIT_NO_USER_DEDUCT</option>
                    <option value="BEIN_DEBIT_USER_UNDERDEDUCTED">BEIN_DEBIT_USER_UNDERDEDUCTED</option>
                    <option value="TELEMETRY_MISSING">TELEMETRY_MISSING</option>
                </select>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-secondary/60 border-b border-border">
                        <tr>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>Issue</th>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>Operation</th>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>beIN Balance</th>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>beIN User</th>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>User Deduct</th>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>User Balance</th>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>Severity</th>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>Status</th>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>Detected</th>
                            <th className={`px-3 py-2 ${tableTextAlignClass}`}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td className="px-3 py-6 text-muted-foreground" colSpan={10}>Loading...</td></tr>
                        ) : issues.length === 0 ? (
                            <tr><td className="px-3 py-6 text-muted-foreground" colSpan={10}>No integrity issues found.</td></tr>
                        ) : issues.map((issue) => (
                            <tr key={issue.id} className="border-b border-border/60">
                                <td className="px-3 py-2">
                                    <div className="font-medium">{issue.issueType}</div>
                                    <div className="text-xs text-muted-foreground">{issue.user?.username || '-'}</div>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="font-mono text-xs">{issue.operationId.slice(0, 10)}...</div>
                                    <div className="text-xs text-muted-foreground">{issue.operation?.cardNumber || '-'}</div>
                                </td>
                                <td className="px-3 py-2">
                                    <div>{formatAmount(issue.beinBalanceBefore)} {'->'} {formatAmount(issue.beinBalanceAfter)}</div>
                                    <div className="text-xs text-muted-foreground">Delta: {formatAmount(issue.beinDelta)}</div>
                                </td>
                                <td className="px-3 py-2">{issue.beinUsernameSnapshot || issue.beinAccount?.username || '-'}</td>
                                <td className="px-3 py-2">
                                    <div>{formatAmount(issue.userDeductAmount)}</div>
                                    <div className="text-xs text-muted-foreground">Amount: {formatAmount(issue.operationAmount)}</div>
                                </td>
                                <td className="px-3 py-2">
                                    <div>{formatAmount(issue.userBalanceBefore)} {'->'} {formatAmount(issue.userBalanceAfter)}</div>
                                </td>
                                <td className="px-3 py-2">{issue.severity}</td>
                                <td className="px-3 py-2">{issue.status}</td>
                                <td className="px-3 py-2">{new Date(issue.detectedAt).toLocaleString()}</td>
                                <td className="px-3 py-2">
                                    <select
                                        value={issue.status}
                                        disabled={updatingId === issue.id}
                                        onChange={(e) => updateStatus(issue.id, e.target.value as IssueStatus)}
                                        className="px-2 py-1 rounded border border-border bg-background"
                                    >
                                        {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border font-semibold">Spent by beIN Account</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-secondary/60 border-b border-border">
                                <tr>
                                    <th className={`px-3 py-2 ${tableTextAlignClass}`}>Account</th>
                                    <th className={`px-3 py-2 ${tableTextAlignClass}`}>Requested</th>
                                    <th className={`px-3 py-2 ${tableTextAlignClass}`}>beIN Delta</th>
                                    <th className={`px-3 py-2 ${tableTextAlignClass}`}>Variance</th>
                                    <th className={`px-3 py-2 ${tableTextAlignClass}`}>Ops</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(summary?.spentByBeinAccount || []).slice(0, 15).map((row) => (
                                    <tr key={row.beinAccountId} className="border-b border-border/60">
                                        <td className="px-3 py-2">
                                            <div className="font-medium">{row.username || row.label || row.beinAccountId.slice(0, 8)}</div>
                                            <div className="text-xs text-muted-foreground">{row.label || row.beinAccountId}</div>
                                        </td>
                                        <td className="px-3 py-2">{row.requestedTotal.toFixed(2)}</td>
                                        <td className="px-3 py-2">{row.beinDeltaTotal.toFixed(2)}</td>
                                        <td className="px-3 py-2">{row.variance.toFixed(2)}</td>
                                        <td className="px-3 py-2">{row.operationsCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border font-semibold">Spent by User</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-secondary/60 border-b border-border">
                                <tr>
                                    <th className={`px-3 py-2 ${tableTextAlignClass}`}>User</th>
                                    <th className={`px-3 py-2 ${tableTextAlignClass}`}>Deducted</th>
                                    <th className={`px-3 py-2 ${tableTextAlignClass}`}>Ops</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(summary?.spentByUser || []).slice(0, 15).map((row) => (
                                    <tr key={row.userId} className="border-b border-border/60">
                                        <td className="px-3 py-2">{row.username || row.userId}</td>
                                        <td className="px-3 py-2">{row.deductedTotal.toFixed(2)}</td>
                                        <td className="px-3 py-2">{row.operationsCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {t.admin?.logs?.pagination?.page || 'Page'} {page} {t.admin?.logs?.pagination?.of || 'of'} {totalPages}
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1 rounded border border-border disabled:opacity-50"
                    >
                        Prev
                    </button>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="px-3 py-1 rounded border border-border disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    )
}
