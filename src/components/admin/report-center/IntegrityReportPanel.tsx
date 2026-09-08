'use client'

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { usePanelRequest, readPanelJson } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
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
    reviewRequired?: {
        total: number
        withBeinBalanceEvidence: number
        withUserDeductionEvidence: number
        refundAlreadyExists: number
    }
}

const statusOptions: IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE', 'IGNORED']

export default function IntegrityReportPanel() {
    const { t: tableText } = useTranslation()
    const { data: session, status } = useSession()
    const { t, dir } = useTranslation()
    const [issues, setIssues] = useState<IntegrityIssue[]>([])
    const [summary, setSummary] = useState<SummaryData | null>(null)
    const { run, loading, error, cancel } = usePanelRequest()
    const mutationPending = useRef(false)
    const [mutationError, setMutationError] = useState(false)
    const [scanning, setScanning] = useState(false)
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
        if (status === 'authenticated' && session?.user?.role !== 'ADMIN') redirect('/dashboard')
    }, [session, status])

    const fetchIssues = useCallback(async () => {
        setSummary(null)
        setIssues([])
        const params = new URLSearchParams({page: String(page), limit: '20', search, status: issueStatus, issueType})
        await run(signal => Promise.all([
            readPanelJson<SummaryData>('/api/admin/reports/integrity/summary?days=30', signal),
            readPanelJson<{issues: IntegrityIssue[]; totalPages: number}>(`/api/admin/reports/integrity?${params}`, signal),
        ]), ([summaryData, issueData]) => {
            const lastPage = Math.max(1, issueData.totalPages || 1)
            setTotalPages(lastPage)
            if (page > lastPage) { setPage(lastPage); return }
            setSummary(summaryData)
            setIssues(issueData.issues || [])
        })
    }, [page, search, issueStatus, issueType, run])

    useEffect(() => {
        if (status !== 'authenticated' || session?.user?.role !== 'ADMIN') return
        const timer = setTimeout(() => void fetchIssues(), 0)
        return () => { clearTimeout(timer); cancel() }
    }, [fetchIssues, cancel, session?.user?.role, status])

    const submitChange = async (url: string, method: 'POST' | 'PATCH', body: object, setBusy: (busy: boolean) => void) => {
        if (mutationPending.current || loading || error !== null) return
        mutationPending.current = true
        setBusy(true)
        setMutationError(false)
        try {
            const response = await fetch(url, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
            if (!response.ok) throw new Error('INTEGRITY_ACTION_REJECTED')
            await fetchIssues()
        } catch {
            setMutationError(true)
        } finally {
            mutationPending.current = false
            setBusy(false)
        }
    }

    const updateStatus = (id: string, nextStatus: IssueStatus) =>
        submitChange(`/api/admin/reports/integrity/${id}`, 'PATCH', {status: nextStatus}, busy => setUpdatingId(busy ? id : null))

    const runScan = () =>
        submitChange('/api/admin/reports/integrity/scan', 'POST', {days: 7, limit: 300}, setScanning)

    const runBackfillUserBalances = () =>
        submitChange('/api/admin/reports/integrity/backfill-balances', 'POST', {days: 60, limit: 2000}, setBackfilling)

    return (
        <div className="p-6 space-y-6" dir={dir}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{t.panelUi.reportCopy.integrityReports}</h1>
                        <p className="text-sm text-muted-foreground">{t.panelUi.reportCopy.integrityHint}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={runBackfillUserBalances}
                        disabled={backfilling || scanning || updatingId !== null || loading || error !== null}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-secondary disabled:opacity-60"
                    >
                        <RefreshCw className={`w-4 h-4 ${backfilling ? 'animate-spin' : ''}`} />
                        {t.panelUi.reportCopy.backfill}
                    </button>
                    <button
                        onClick={runScan}
                        disabled={backfilling || scanning || updatingId !== null || loading || error !== null}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-secondary"
                    >
                        <RefreshCw className="w-4 h-4" />
                        {t.panelUi.reportCopy.scanWeek}
                    </button>
                </div>
            </div>

            {error !== null && <PanelLoadError status={error} retry={() => void fetchIssues()} />}
            {mutationError && <p role="alert" className="text-destructive">{t.panelUi.actionFailed}</p>}
            {loading && <p role="status">{t.common.loading}</p>}
            {summary && <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{t.panelUi.reportCopy.issues30}</p>
                    <p className="text-2xl font-bold">{summary?.total ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{t.panelUi.reportCopy.openHigh}</p>
                    <p className="text-2xl font-bold text-red-500">{summary?.openHigh ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{t.panelUi.reportCopy.open}</p>
                    <p className="text-2xl font-bold">
                        {summary?.byStatus?.find(s => s.status === 'OPEN')?._count ?? 0}
                    </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{t.panelUi.reportCopy.resolved}</p>
                    <p className="text-2xl font-bold text-emerald-500">
                        {summary?.byStatus?.find(s => s.status === 'RESOLVED')?._count ?? 0}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{t.panelUi.reportCopy.requestedSpend}</p>
                    <p className="text-2xl font-bold">{summary?.totals?.requestedTotal?.toFixed(2) ?? '0.00'}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{t.panelUi.reportCopy.beinDeltaSpend}</p>
                    <p className="text-2xl font-bold">{summary?.totals?.beinDeltaTotal?.toFixed(2) ?? '0.00'}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{t.panelUi.reportCopy.userDeductedSpend}</p>
                    <p className="text-2xl font-bold">{summary?.totals?.deductedTotal?.toFixed(2) ?? '0.00'}</p>
                </div>
            </div>

            {summary?.reviewRequired && summary.reviewRequired.total > 0 && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-amber-200">
                                {t.panelUi.reportCopy.has} {summary.reviewRequired.total} {t.panelUi.reportCopy.suspectCount}
                            </p>
                            <p className="mt-1 text-xs text-amber-100/80">
                                {t.panelUi.reportCopy.reviewOnly}
                            </p>
                        </div>
                        <a
                            href="/dashboard/admin/financial-review"
                            className="inline-flex items-center justify-center rounded-lg border border-amber-300/40 bg-background px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-400/10"
                        >
                            {t.panelUi.reportCopy.openReview}
                        </a>
                    </div>
                </div>
            )}

            </>}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col md:flex-row gap-3">
                <input
                    value={search}
                    onChange={(e) => { setPage(1); setSearch(e.target.value) }}
                    placeholder={t.panelUi.reportCopy.integritySearch}
                    className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-border bg-background"
                />
                <select
                    value={issueStatus}
                    onChange={(e) => { setPage(1); setIssueStatus(e.target.value as IssueStatus | '') }}
                    className="px-3 py-2 rounded-lg border border-border bg-background"
                >
                    <option value="">{t.panelUi.reportCopy.allStatuses}</option>
                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                    value={issueType}
                    onChange={(e) => { setPage(1); setIssueType(e.target.value) }}
                    className="px-3 py-2 rounded-lg border border-border bg-background"
                >
                    <option value="">{t.panelUi.reportCopy.allIssueTypes}</option>
                    <option value="NO_BEIN_BALANCE_CHANGE">{t.panelUi.reportCopy.noBeinChange}</option>
                    <option value="BEIN_DEBIT_NO_USER_DEDUCT">{t.panelUi.reportCopy.noUserDeduct}</option>
                    <option value="BEIN_DEBIT_USER_UNDERDEDUCTED">{t.panelUi.reportCopy.underDeduct}</option>
                    <option value="TELEMETRY_MISSING">{t.panelUi.reportCopy.missingTelemetry}</option>
                </select>
            </div>

            {summary && <>
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
                <Table panel density="compact" className="w-full text-sm">
                    <TableHeader className="bg-secondary/60 border-b border-border">
                        <TableRow>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.issue}</TableHead>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.transactions.typeOperation}</TableHead>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.adminBeinAccounts.table.balance}</TableHead>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.beinUser}</TableHead>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.userDeduct}</TableHead>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.userBalance}</TableHead>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.severity}</TableHead>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.common.status}</TableHead>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.detected}</TableHead>
                            <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.admin.logs.table.action}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell className="px-3 py-6 text-muted-foreground" colSpan={10}>{t.common.loading}</TableCell></TableRow>
                        ) : issues.length === 0 ? (
                            <TableRow><TableCell className="px-3 py-6 text-muted-foreground" colSpan={10}>{t.panelUi.reportCopy.noIntegrity}</TableCell></TableRow>
                        ) : issues.map((issue) => (
                            <TableRow key={issue.id} className="border-b border-border/60">
                                <TableCell className="px-3 py-2">
                                    <div className="font-medium">{issue.issueType}</div>
                                    <div className="text-xs text-muted-foreground">{issue.user?.username || '-'}</div>
                                </TableCell>
                                <TableCell className="px-3 py-2">
                                    <div className="font-mono text-xs">{issue.operationId.slice(0, 10)}...</div>
                                    <div className="text-xs text-muted-foreground">{issue.operation?.cardNumber || '-'}</div>
                                </TableCell>
                                <TableCell className="px-3 py-2">
                                    <div>{formatAmount(issue.beinBalanceBefore)} {'->'} {formatAmount(issue.beinBalanceAfter)}</div>
                                    <div className="text-xs text-muted-foreground">{t.panelUi.reportCopy.delta} {formatAmount(issue.beinDelta)}</div>
                                </TableCell>
                                <TableCell className="px-3 py-2">{issue.beinUsernameSnapshot || issue.beinAccount?.username || '-'}</TableCell>
                                <TableCell className="px-3 py-2">
                                    <div>{formatAmount(issue.userDeductAmount)}</div>
                                    <div className="text-xs text-muted-foreground">{t.panelUi.reportCopy.amount} {formatAmount(issue.operationAmount)}</div>
                                </TableCell>
                                <TableCell className="px-3 py-2">
                                    <div>{formatAmount(issue.userBalanceBefore)} {'->'} {formatAmount(issue.userBalanceAfter)}</div>
                                </TableCell>
                                <TableCell className="px-3 py-2">{issue.severity}</TableCell>
                                <TableCell className="px-3 py-2">{issue.status}</TableCell>
                                <TableCell className="px-3 py-2">{new Date(issue.detectedAt).toLocaleString()}</TableCell>
                                <TableCell className="px-3 py-2">
                                    <select
                                        value={issue.status}
                                        disabled={updatingId !== null || scanning || backfilling}
                                        onChange={(e) => updateStatus(issue.id, e.target.value as IssueStatus)}
                                        className="px-2 py-1 rounded border border-border bg-background"
                                    >
                                        {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border font-semibold">{t.panelUi.reportCopy.spentAccount}</div>
                    <div className="overflow-x-auto">
                        <Table panel density="compact" className="w-full text-sm">
                            <TableHeader className="bg-secondary/60 border-b border-border">
                                <TableRow>
                                    <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.adminBeinAccounts.table.account}</TableHead>
                                    <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.requested}</TableHead>
                                    <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.beinDelta}</TableHead>
                                    <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.variance}</TableHead>
                                    <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.ops}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(summary?.spentByBeinAccount || []).slice(0, 15).map((row) => (
                                    <TableRow key={row.beinAccountId} className="border-b border-border/60">
                                        <TableCell className="px-3 py-2">
                                            <div className="font-medium">{row.username || row.label || row.beinAccountId.slice(0, 8)}</div>
                                            <div className="text-xs text-muted-foreground">{row.label || row.beinAccountId}</div>
                                        </TableCell>
                                        <TableCell className="px-3 py-2">{row.requestedTotal.toFixed(2)}</TableCell>
                                        <TableCell className="px-3 py-2">{row.beinDeltaTotal.toFixed(2)}</TableCell>
                                        <TableCell className="px-3 py-2">{row.variance.toFixed(2)}</TableCell>
                                        <TableCell className="px-3 py-2">{row.operationsCount}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border font-semibold">{t.panelUi.reportCopy.spentUser}</div>
                    <div className="overflow-x-auto">
                        <Table panel density="compact" className="w-full text-sm">
                            <TableHeader className="bg-secondary/60 border-b border-border">
                                <TableRow>
                                    <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.activity.table.user}</TableHead>
                                    <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.deducted}</TableHead>
                                    <TableHead className={`px-3 py-2 ${tableTextAlignClass}`}>{tableText.panelTable.ops}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(summary?.spentByUser || []).slice(0, 15).map((row) => (
                                    <TableRow key={row.userId} className="border-b border-border/60">
                                        <TableCell className="px-3 py-2">{row.username || row.userId}</TableCell>
                                        <TableCell className="px-3 py-2">{row.deductedTotal.toFixed(2)}</TableCell>
                                        <TableCell className="px-3 py-2">{row.operationsCount}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {t.admin?.logs?.pagination?.page || t.panelUi.reportCopy.page} {page} {t.admin?.logs?.pagination?.of || 'of'} {totalPages}
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1 rounded border border-border disabled:opacity-50"
                    >
                        {t.panelUi.reportCopy.previous}
                    </button>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="px-3 py-1 rounded border border-border disabled:opacity-50"
                    >
                        {t.panelUi.reportCopy.next}
                    </button>
                </div>
            </div>
            </>}
        </div>
    )
}
