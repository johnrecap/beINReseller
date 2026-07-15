'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toPng } from 'html-to-image'
import {
    AlertTriangle,
    CalendarDays,
    Download,
    FileText,
    Loader2,
    RefreshCw,
    Search,
    Users,
    Wallet,
} from 'lucide-react'

type BalanceReportRange = 'today' | 'week' | 'month' | 'custom'
type OwnerType = '' | 'ADMIN' | 'MANAGER' | 'AGENT'
type RecipientRole = 'ALL' | 'MANAGER' | 'USER'
type ActorRole = 'ALL' | 'ADMIN' | 'MANAGER' | 'SYSTEM'

type LookupAccount = {
    id: string
    username: string
    email: string
    role: string
}

type LookupUser = {
    id: string
    username: string
    email: string
    currentOwner: {
        type: string
        id: string | null
        label: string | null
        isLegacyFallback: boolean
        hasConflict: boolean
    }
}

type MovementRow = {
    id: string
    amount: number
    balanceAfter: number
    type: string
    notes: string | null
    createdAt: string
    createdAtCairoDate: string
    source: {
        key: string
        label: string
    }
    bucket: {
        key: string
        label: string
    }
    recipient: {
        id: string
        username: string
        email: string
        role: string
        currentOwner: LookupUser['currentOwner']
    }
    actor: LookupAccount | null
}

type BalanceMovementsResponse = {
    filters: {
        page: number
        limit: number
        range: BalanceReportRange
        fromInput: string
        toInput: string
        recipientRole: RecipientRole
        recipientId: string
        actorRole: ActorRole
        actorId: string
        ownerType: OwnerType
        ownerId: string
        userSearch: string
        exportAll: boolean
    }
    summary: {
        totalAmount: number
        movementCount: number
        recipientsCount: number
        actorsCount: number
        averageAmount: number
        lastMovementAt: string | null
        adminToManagersAmount: number
        adminToManagersCount: number
        adminToUsersAmount: number
        adminToUsersCount: number
        managerToUsersAmount: number
        managerToUsersCount: number
        systemAmount: number
        systemCount: number
    }
    rows: MovementRow[]
    lookups: {
        managers: LookupAccount[]
        adminOwners: LookupAccount[]
        agents: LookupAccount[]
        users: LookupUser[]
    }
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
    exportLimit: number
}

type FormState = {
    range: BalanceReportRange
    from: string
    to: string
    recipientRole: RecipientRole
    recipientId: string
    actorRole: ActorRole
    actorId: string
    ownerType: OwnerType
    ownerId: string
    userSearch: string
}

const EMPTY_SUMMARY: BalanceMovementsResponse['summary'] = {
    totalAmount: 0,
    movementCount: 0,
    recipientsCount: 0,
    actorsCount: 0,
    averageAmount: 0,
    lastMovementAt: null,
    adminToManagersAmount: 0,
    adminToManagersCount: 0,
    adminToUsersAmount: 0,
    adminToUsersCount: 0,
    managerToUsersAmount: 0,
    managerToUsersCount: 0,
    systemAmount: 0,
    systemCount: 0,
}

function readRecipientRole(searchParams: URLSearchParams): RecipientRole {
    const value = searchParams.get('recipientRole')
    if (value === 'MANAGER' || value === 'USER' || value === 'ALL') return value
    if (searchParams.get('report') === 'manager') return 'MANAGER'
    if (searchParams.get('report') === 'user') return 'USER'
    return 'ALL'
}

function readActorRole(searchParams: URLSearchParams): ActorRole {
    const value = searchParams.get('actorRole')
    if (value === 'ADMIN' || value === 'MANAGER' || value === 'SYSTEM' || value === 'ALL') return value
    return 'ALL'
}

function initialForm(searchParams: URLSearchParams): FormState {
    const recipientRole = readRecipientRole(searchParams)
    return {
        range: (searchParams.get('range') as BalanceReportRange) || 'month',
        from: searchParams.get('from') || '',
        to: searchParams.get('to') || '',
        recipientRole,
        recipientId: searchParams.get('recipientId')
            || (recipientRole === 'MANAGER' ? searchParams.get('managerId') || '' : searchParams.get('userId') || ''),
        actorRole: readActorRole(searchParams),
        actorId: searchParams.get('actorId') || '',
        ownerType: (searchParams.get('ownerType') as OwnerType) || '',
        ownerId: searchParams.get('ownerId') || '',
        userSearch: searchParams.get('userSearch') || '',
    }
}

function formatUsd(value: number): string {
    return `USD ${value.toFixed(2)}`
}

function formatDateTime(value: string | null): string {
    if (!value) return '-'
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

function buildQuery(form: FormState, page = '1') {
    const query = new URLSearchParams()
    query.set('tab', 'balance-movements')
    query.set('recipientRole', form.recipientRole)
    query.set('actorRole', form.actorRole)
    query.set('range', form.range)
    if (form.range === 'custom') {
        if (form.from) query.set('from', form.from)
        if (form.to) query.set('to', form.to)
    }
    if (form.recipientId) query.set('recipientId', form.recipientId)
    if (form.actorRole !== 'SYSTEM' && form.actorId) query.set('actorId', form.actorId)
    if (form.recipientRole !== 'MANAGER') {
        if (form.ownerType) query.set('ownerType', form.ownerType)
        if (form.ownerId) query.set('ownerId', form.ownerId)
        if (form.userSearch) query.set('userSearch', form.userSearch)
    }
    query.set('page', page)
    return query
}

function SummaryCard({
    label,
    value,
    detail,
    icon: Icon,
}: {
    label: string
    value: string | number
    detail?: string
    icon: typeof Wallet
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-3 text-2xl font-bold text-foreground">{value}</div>
            {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
        </div>
    )
}

function sourceTone(sourceKey: string): string {
    if (sourceKey === 'ADMIN_TOP_UP') return 'bg-emerald-500/15 text-emerald-300'
    if (sourceKey === 'MANAGER_TRANSFER') return 'bg-cyan-500/15 text-cyan-300'
    if (sourceKey === 'CREDIT_REQUEST_APPROVAL') return 'bg-blue-500/15 text-blue-300'
    if (sourceKey === 'POINT_CONVERSION') return 'bg-purple-500/15 text-purple-300'
    if (sourceKey === 'INITIAL_BALANCE_CORRECTION') return 'bg-amber-500/15 text-amber-300'
    return 'bg-slate-500/15 text-slate-300'
}

function bucketTone(bucketKey: string): string {
    if (bucketKey === 'ADMIN_TO_MANAGERS') return 'bg-emerald-500/15 text-emerald-300'
    if (bucketKey === 'ADMIN_TO_USERS') return 'bg-teal-500/15 text-teal-300'
    if (bucketKey === 'MANAGER_TO_USERS') return 'bg-cyan-500/15 text-cyan-300'
    if (bucketKey === 'SYSTEM_INCREASES') return 'bg-blue-500/15 text-blue-300'
    return 'bg-slate-500/15 text-slate-300'
}

function ownerLabel(owner: LookupUser['currentOwner']): string {
    if (owner.label) return `${owner.type}: ${owner.label}`
    return owner.type || '-'
}

function waitForPaint() {
    return new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
}

function MovementRows({ rows }: { rows: MovementRow[] }) {
    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No balance increases match the current filters.
            </div>
        )
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-[1240px] w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                        <th className="px-4 py-3 text-start font-medium">Date</th>
                        <th className="px-4 py-3 text-start font-medium">Recipient</th>
                        <th className="px-4 py-3 text-start font-medium">Current owner</th>
                        <th className="px-4 py-3 text-start font-medium">Actor</th>
                        <th className="px-4 py-3 text-start font-medium">Category</th>
                        <th className="px-4 py-3 text-start font-medium">Source</th>
                        <th className="px-4 py-3 text-start font-medium">Amount</th>
                        <th className="px-4 py-3 text-start font-medium">Balance after</th>
                        <th className="px-4 py-3 text-start font-medium">Notes</th>
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
                                <span className="block font-semibold text-foreground">{row.recipient.username}</span>
                                <span className="block text-xs text-muted-foreground">{row.recipient.role}</span>
                                <span className="block text-xs text-muted-foreground">{row.recipient.email}</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{ownerLabel(row.recipient.currentOwner)}</td>
                            <td className="px-4 py-3">
                                {row.actor ? (
                                    <>
                                        <span className="block font-medium text-foreground">{row.actor.username}</span>
                                        <span className="block text-xs text-muted-foreground">{row.actor.role}</span>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground">System / unavailable</span>
                                )}
                            </td>
                            <td className="px-4 py-3">
                                <span className={`rounded-full px-2 py-1 text-xs ${bucketTone(row.bucket.key)}`}>
                                    {row.bucket.label}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <span className={`rounded-full px-2 py-1 text-xs ${sourceTone(row.source.key)}`}>
                                    {row.source.label}
                                </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-emerald-300">{formatUsd(row.amount)}</td>
                            <td className="px-4 py-3 text-foreground">{formatUsd(row.balanceAfter)}</td>
                            <td className="max-w-[260px] px-4 py-3 text-muted-foreground">
                                <span className="line-clamp-2">{row.notes || '-'}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function FilterSummary({ data }: { data: BalanceMovementsResponse }) {
    const filters = data.filters
    const values = [
        `Recipient: ${filters.recipientRole}`,
        `Actor: ${filters.actorRole}`,
        `Range: ${filters.fromInput} to ${filters.toInput}`,
        filters.recipientId ? `Recipient ID: ${filters.recipientId}` : '',
        filters.actorId ? `Actor ID: ${filters.actorId}` : '',
        filters.ownerType ? `Current owner: ${filters.ownerType}${filters.ownerId ? ` / ${filters.ownerId}` : ''}` : '',
        filters.userSearch ? `Search: ${filters.userSearch}` : '',
    ].filter(Boolean)

    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="h-4 w-4 text-primary" />
                Report filters
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {values.map((value) => (
                    <span key={value} className="rounded-full border border-border px-2 py-1">{value}</span>
                ))}
            </div>
        </div>
    )
}

function ReportContent({
    data,
    loading,
    exportMode = false,
}: {
    data: BalanceMovementsResponse | null
    loading: boolean
    exportMode?: boolean
}) {
    const summary = data?.summary ?? EMPTY_SUMMARY
    const cards = [
        { label: 'Total increases', value: formatUsd(summary.totalAmount), detail: `${summary.movementCount} movements`, icon: Wallet },
        { label: 'Admin to managers', value: formatUsd(summary.adminToManagersAmount), detail: `${summary.adminToManagersCount} movements`, icon: Users },
        { label: 'Admin to users', value: formatUsd(summary.adminToUsersAmount), detail: `${summary.adminToUsersCount} movements`, icon: Users },
        { label: 'Managers to users', value: formatUsd(summary.managerToUsersAmount), detail: `${summary.managerToUsersCount} movements`, icon: Users },
        { label: 'System / legacy increases', value: formatUsd(summary.systemAmount), detail: `${summary.systemCount} movements`, icon: RefreshCw },
        { label: 'Recipients', value: summary.recipientsCount, detail: `${summary.actorsCount} recorded actors`, icon: Users },
        { label: 'Average increase', value: formatUsd(summary.averageAmount), icon: Wallet },
        { label: 'Last movement', value: formatDateTime(summary.lastMovementAt), icon: CalendarDays },
    ]

    return (
        <div className="space-y-5 rounded-xl bg-background p-4">
            {data && exportMode && <FilterSummary data={data} />}

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                        Current owner labels are based on current ownership. Older movements may not prove historical ownership unless the original record stored it.
                    </p>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                    <SummaryCard key={card.label} {...card} />
                ))}
            </div>

            {loading ? (
                <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                    Loading balance movements...
                </div>
            ) : (
                <MovementRows rows={data?.rows ?? []} />
            )}
        </div>
    )
}

export default function BalanceMovementsReportPanel() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const exportRef = useRef<HTMLDivElement>(null)
    const [data, setData] = useState<BalanceMovementsResponse | null>(null)
    const [exportData, setExportData] = useState<BalanceMovementsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState('')
    const [downloadError, setDownloadError] = useState('')
    const [form, setForm] = useState<FormState>(() => initialForm(searchParams))

    const ownerOptions = form.ownerType === 'ADMIN'
        ? data?.lookups.adminOwners ?? []
        : form.ownerType === 'MANAGER'
            ? data?.lookups.managers ?? []
            : form.ownerType === 'AGENT'
                ? data?.lookups.agents ?? []
                : []
    const actorOptions = form.actorRole === 'ADMIN'
        ? data?.lookups.adminOwners ?? []
        : form.actorRole === 'MANAGER'
            ? data?.lookups.managers ?? []
            : []
    const recipientOptions = form.recipientRole === 'MANAGER'
        ? data?.lookups.managers ?? []
        : []

    async function loadReport(params = searchParams) {
        setLoading(true)
        setError('')
        try {
            const query = new URLSearchParams(params.toString())
            query.delete('tab')
            const response = await fetch(`/api/admin/reports/balance-movements?${query.toString()}`, { cache: 'no-store' })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || 'Failed to load balance movements')
            setData(payload)
            setForm({
                range: payload.filters.range,
                from: payload.filters.fromInput,
                to: payload.filters.toInput,
                recipientRole: payload.filters.recipientRole,
                recipientId: payload.filters.recipientId,
                actorRole: payload.filters.actorRole,
                actorId: payload.filters.actorId,
                ownerType: payload.filters.ownerType,
                ownerId: payload.filters.ownerId,
                userSearch: payload.filters.userSearch,
            })
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load balance movements')
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
        router.replace(`${pathname}?${buildQuery(form).toString()}`, { scroll: false })
    }

    function changePage(page: number) {
        router.replace(`${pathname}?${buildQuery(form, String(page)).toString()}`, { scroll: false })
    }

    async function loadExportData() {
        const query = buildQuery(form)
        query.delete('tab')
        query.set('export', 'all')
        const response = await fetch(`/api/admin/reports/balance-movements?${query.toString()}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to load PDF export data')
        return payload as BalanceMovementsResponse
    }

    async function downloadPdf() {
        setDownloading(true)
        setDownloadError('')
        try {
            const fullReport = await loadExportData()
            setExportData(fullReport)
            await waitForPaint()

            if (!exportRef.current) throw new Error('PDF export surface was not ready')
            const dataUrl = await toPng(exportRef.current, {
                backgroundColor: '#020617',
                pixelRatio: 2,
                cacheBust: true,
            })
            const { jsPDF } = await import('jspdf')
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
            const pageWidth = pdf.internal.pageSize.getWidth()
            const pageHeight = pdf.internal.pageSize.getHeight()
            const margin = 24
            const imageProps = pdf.getImageProperties(dataUrl)
            const contentWidth = pageWidth - margin * 2
            const contentHeight = imageProps.height * (contentWidth / imageProps.width)
            const pageContentHeight = pageHeight - margin * 2

            let remainingHeight = contentHeight
            let yPosition = margin
            pdf.addImage(dataUrl, 'PNG', margin, yPosition, contentWidth, contentHeight)
            remainingHeight -= pageContentHeight

            while (remainingHeight > 0) {
                pdf.addPage()
                yPosition -= pageContentHeight
                pdf.addImage(dataUrl, 'PNG', margin, yPosition, contentWidth, contentHeight)
                remainingHeight -= pageContentHeight
            }

            pdf.save(`balance-movements-${fullReport.filters.fromInput}-${fullReport.filters.toInput}.pdf`)
        } catch (pdfError) {
            setDownloadError(pdfError instanceof Error ? pdfError.message : 'Failed to create PDF')
        } finally {
            setExportData(null)
            setDownloading(false)
        }
    }

    return (
        <section className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Balance Movements</h2>
                        <p className="text-sm text-muted-foreground">
                            Admin and manager balance increases with source, recipient, and current ownership analysis.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={downloadPdf}
                        disabled={downloading || loading || !data}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download PDF
                    </button>
                </div>

                <form onSubmit={applyFilters} className="mt-5 grid gap-3 md:grid-cols-6">
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Recipient type</span>
                        <select
                            value={form.recipientRole}
                            onChange={(event) => setForm((current) => ({
                                ...current,
                                recipientRole: event.target.value as RecipientRole,
                                recipientId: '',
                                ownerType: '',
                                ownerId: '',
                            }))}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                        >
                            <option value="ALL">All recipients</option>
                            <option value="MANAGER">Managers</option>
                            <option value="USER">Users</option>
                        </select>
                    </label>

                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Actor</span>
                        <select
                            value={form.actorRole}
                            onChange={(event) => setForm((current) => ({
                                ...current,
                                actorRole: event.target.value as ActorRole,
                                actorId: '',
                            }))}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                        >
                            <option value="ALL">All actors</option>
                            <option value="ADMIN">Admin</option>
                            <option value="MANAGER">Manager</option>
                            <option value="SYSTEM">System source</option>
                        </select>
                    </label>

                    {form.actorRole !== 'ALL' && form.actorRole !== 'SYSTEM' && (
                        <label className="space-y-1 text-sm">
                            <span className="text-muted-foreground">Actor account</span>
                            <select
                                value={form.actorId}
                                onChange={(event) => setForm((current) => ({ ...current, actorId: event.target.value }))}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                            >
                                <option value="">All</option>
                                {actorOptions.map((actor) => (
                                    <option key={actor.id} value={actor.id}>{actor.username}</option>
                                ))}
                            </select>
                        </label>
                    )}

                    {form.recipientRole === 'MANAGER' && (
                        <label className="space-y-1 text-sm">
                            <span className="text-muted-foreground">Manager recipient</span>
                            <select
                                value={form.recipientId}
                                onChange={(event) => setForm((current) => ({ ...current, recipientId: event.target.value }))}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                            >
                                <option value="">All managers</option>
                                {recipientOptions.map((manager) => (
                                    <option key={manager.id} value={manager.id}>{manager.username}</option>
                                ))}
                            </select>
                        </label>
                    )}

                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Range</span>
                        <select
                            value={form.range}
                            onChange={(event) => setForm((current) => ({ ...current, range: event.target.value as BalanceReportRange }))}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                        >
                            <option value="today">Today</option>
                            <option value="week">This week</option>
                            <option value="month">This month</option>
                            <option value="custom">Custom</option>
                        </select>
                    </label>

                    {form.range === 'custom' && (
                        <>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">From</span>
                                <input
                                    type="date"
                                    value={form.from}
                                    onChange={(event) => setForm((current) => ({ ...current, from: event.target.value }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">To</span>
                                <input
                                    type="date"
                                    value={form.to}
                                    onChange={(event) => setForm((current) => ({ ...current, to: event.target.value }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                                />
                            </label>
                        </>
                    )}

                    {form.recipientRole !== 'MANAGER' && (
                        <>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">Current user owner</span>
                                <select
                                    value={form.ownerType}
                                    onChange={(event) => setForm((current) => ({
                                        ...current,
                                        ownerType: event.target.value as OwnerType,
                                        ownerId: '',
                                    }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                                >
                                    <option value="">All owners</option>
                                    <option value="ADMIN">Admin</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="AGENT">Agent</option>
                                </select>
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">Owner account</span>
                                <select
                                    value={form.ownerId}
                                    onChange={(event) => setForm((current) => ({ ...current, ownerId: event.target.value, recipientId: '' }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                                >
                                    <option value="">All</option>
                                    {ownerOptions.map((owner) => (
                                        <option key={owner.id} value={owner.id}>{owner.username}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">User search</span>
                                <div className="relative">
                                    <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="search"
                                        value={form.userSearch}
                                        onChange={(event) => setForm((current) => ({ ...current, userSearch: event.target.value, recipientId: '' }))}
                                        placeholder="Username or email"
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 pe-9 text-foreground"
                                    />
                                </div>
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">User recipient</span>
                                <select
                                    value={form.recipientRole === 'USER' ? form.recipientId : ''}
                                    disabled={form.recipientRole !== 'USER'}
                                    onChange={(event) => setForm((current) => ({ ...current, recipientId: event.target.value }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <option value="">All matching users</option>
                                    {(data?.lookups.users ?? []).map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.username} - {ownerLabel(user.currentOwner)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </>
                    )}

                    <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary md:self-end"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Apply
                    </button>
                </form>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {error}
                </div>
            )}
            {downloadError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    PDF export failed: {downloadError}
                </div>
            )}

            <ReportContent data={data} loading={loading} />

            {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
                    <span className="text-muted-foreground">
                        Page {data.pagination.page} of {data.pagination.totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => changePage(Math.max(1, data.pagination.page - 1))}
                            disabled={data.pagination.page <= 1}
                            className="rounded-lg border border-border px-3 py-1.5 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            onClick={() => changePage(Math.min(data.pagination.totalPages, data.pagination.page + 1))}
                            disabled={data.pagination.page >= data.pagination.totalPages}
                            className="rounded-lg border border-border px-3 py-1.5 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {exportData && (
                <div
                    ref={exportRef}
                    aria-hidden="true"
                    style={{
                        position: 'fixed',
                        left: '-10000px',
                        top: 0,
                        width: 1400,
                        pointerEvents: 'none',
                    }}
                >
                    <ReportContent data={exportData} loading={false} exportMode />
                </div>
            )}
        </section>
    )
}
