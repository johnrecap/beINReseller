'use client'

import { useTranslation } from '@/hooks/useTranslation'
import { en as exportText } from '@/i18n/translations/en'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
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

function MovementRows({ rows, exportMode = false }: { rows: MovementRow[]; exportMode?: boolean }) {
    const { t: localeText } = useTranslation()
    const t = exportMode ? exportText : localeText
    const { t: tableText } = useTranslation()
    // Keep the existing PDF document independent of interactive panel primitives/tokens.
    const RowsTable = exportMode ? 'table' : Table
    const RowsHeader = exportMode ? 'thead' : TableHeader
    const RowsBody = exportMode ? 'tbody' : TableBody
    const Row = exportMode ? 'tr' : TableRow
    const Head = exportMode ? 'th' : TableHead
    const Cell = exportMode ? 'td' : TableCell
    const headings = exportMode
        ? ['Date', 'Recipient', t.panelUi.reportCopy.currentOwner, t.panelUi.reportCopy.actor, 'Category', t.panelUi.reportCopy.source, 'Amount', t.panelUi.reportCopy.balanceAfter, t.transactions.notes]
        : [tableText.common.date, tableText.panelTable.recipient, tableText.panelTable.currentOwner, tableText.panelTable.actor, tableText.panelTable.category, tableText.panelTable.source, tableText.forms.amount, tableText.forms.balanceAfter, tableText.transactions.notes]
    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                {t.panelUi.reportCopy.noMovements}
            </div>
        )
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-border">
            <RowsTable {...(exportMode ? {} : {panel: true, density: 'compact' as const})} className="min-w-[1240px] w-full text-sm">
                <RowsHeader className="bg-muted/30 text-muted-foreground">
                    <Row>
                        {headings.map(heading => <Head key={heading} className="px-4 py-3 text-start font-medium">{heading}</Head>)}
                    </Row>
                </RowsHeader>
                <RowsBody className="divide-y divide-border">
                    {rows.map((row) => (
                        <Row key={row.id} className="hover:bg-muted/20">
                            <Cell className="px-4 py-3">
                                <span className="block font-medium text-foreground">{row.createdAtCairoDate}</span>
                                <span className="block text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                            </Cell>
                            <Cell className="px-4 py-3">
                                <span className="block font-semibold text-foreground">{row.recipient.username}</span>
                                <span className="block text-xs text-muted-foreground">{row.recipient.role}</span>
                                <span className="block text-xs text-muted-foreground">{row.recipient.email}</span>
                            </Cell>
                            <Cell className="px-4 py-3 text-muted-foreground">{ownerLabel(row.recipient.currentOwner)}</Cell>
                            <Cell className="px-4 py-3">
                                {row.actor ? (
                                    <>
                                        <span className="block font-medium text-foreground">{row.actor.username}</span>
                                        <span className="block text-xs text-muted-foreground">{row.actor.role}</span>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground">{t.panelUi.reportCopy.systemUnavailable}</span>
                                )}
                            </Cell>
                            <Cell className="px-4 py-3">
                                <span className={`rounded-full px-2 py-1 text-xs ${bucketTone(row.bucket.key)}`}>
                                    {row.bucket.label}
                                </span>
                            </Cell>
                            <Cell className="px-4 py-3">
                                <span className={`rounded-full px-2 py-1 text-xs ${sourceTone(row.source.key)}`}>
                                    {row.source.label}
                                </span>
                            </Cell>
                            <Cell className="px-4 py-3 font-semibold text-emerald-300">{formatUsd(row.amount)}</Cell>
                            <Cell className="px-4 py-3 text-foreground">{formatUsd(row.balanceAfter)}</Cell>
                            <Cell className="max-w-[260px] px-4 py-3 text-muted-foreground">
                                <span className="line-clamp-2">{row.notes || '-'}</span>
                            </Cell>
                        </Row>
                    ))}
                </RowsBody>
            </RowsTable>
        </div>
    )
}

function FilterSummary({ data }: { data: BalanceMovementsResponse }) {
    const t = exportText
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
                {t.panelUi.reportCopy.reportFilters}
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
    const { t: localeText } = useTranslation()
    const t = exportMode ? exportText : localeText
    const summary = data?.summary ?? EMPTY_SUMMARY
    const cards = [
        { label: t.panelUi.reportCopy.totalIncreases, value: formatUsd(summary.totalAmount), detail: t.panelUi.reportCopy.movements.replace('{count}', String(summary.movementCount)), icon: Wallet },
        { label: t.panelUi.reportCopy.adminManagers, value: formatUsd(summary.adminToManagersAmount), detail: t.panelUi.reportCopy.movements.replace('{count}', String(summary.adminToManagersCount)), icon: Users },
        { label: t.panelUi.reportCopy.adminUsers, value: formatUsd(summary.adminToUsersAmount), detail: t.panelUi.reportCopy.movements.replace('{count}', String(summary.adminToUsersCount)), icon: Users },
        { label: t.panelUi.reportCopy.managerUsers, value: formatUsd(summary.managerToUsersAmount), detail: t.panelUi.reportCopy.movements.replace('{count}', String(summary.managerToUsersCount)), icon: Users },
        { label: t.panelUi.reportCopy.systemIncreases, value: formatUsd(summary.systemAmount), detail: t.panelUi.reportCopy.movements.replace('{count}', String(summary.systemCount)), icon: RefreshCw },
        { label: t.panelUi.reportCopy.recipients, value: summary.recipientsCount, detail: t.panelUi.reportCopy.actorsCount.replace('{count}', String(summary.actorsCount)), icon: Users },
        { label: t.panelUi.reportCopy.averageIncrease, value: formatUsd(summary.averageAmount), icon: Wallet },
        { label: t.panelUi.reportCopy.lastMovement, value: formatDateTime(summary.lastMovementAt), icon: CalendarDays },
    ]

    return (
        <div className="space-y-5 rounded-xl bg-background p-4">
            {data && exportMode && <FilterSummary data={data} />}

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                        {t.panelUi.reportCopy.currentOwnershipHint}
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
                    {t.panelUi.reportCopy.loadingMovements}
                </div>
            ) : (
                <MovementRows rows={data?.rows ?? []} exportMode={exportMode} />
            )}
        </div>
    )
}

export default function BalanceMovementsReportPanel() {
    const { t } = useTranslation()
    const { t: tableText } = useTranslation()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const exportRef = useRef<HTMLDivElement>(null)
    const [data, setData] = useState<BalanceMovementsResponse | null>(null)
    const [exportData, setExportData] = useState<BalanceMovementsResponse | null>(null)
    const { load, loading, error } = usePanelRequest()
    const [downloading, setDownloading] = useState(false)
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
        const query = new URLSearchParams(params.toString())
        query.delete('tab')
        setData(null)
        await load<BalanceMovementsResponse>(`/api/admin/reports/balance-movements?${query.toString()}`, payload => {
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
        })
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
        if (!response.ok) throw new Error(payload.error || t.panelUi.reportCopy.pdfDataFailed)
        return payload as BalanceMovementsResponse
    }

    async function downloadPdf() {
        setDownloading(true)
        setDownloadError('')
        try {
            const fullReport = await loadExportData()
            setExportData(fullReport)
            await waitForPaint()

            if (!exportRef.current) throw new Error(t.panelUi.reportCopy.pdfSurfaceFailed)
            const dataUrl = await toPng(exportRef.current, {
                backgroundColor: '#020617',
                pixelRatio: 2,
                cacheBust: true,
                // Keep the real surface offscreen, but place its raster clone inside the image viewport.
                style: { position: 'static', left: 'auto', top: 'auto' },
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
            setDownloadError(pdfError instanceof Error ? pdfError.message : t.panelUi.reportCopy.pdfCreateFailed)
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
                        <h2 className="text-xl font-bold text-foreground">{t.panelUi.reportCopy.balanceMovements}</h2>
                        <p className="text-sm text-muted-foreground">
                            {t.panelUi.reportCopy.balanceMovementsHint}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={downloadPdf}
                        disabled={downloading || loading || !data}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {t.panelUi.reportCopy.downloadPdf}
                    </button>
                </div>

                <form onSubmit={applyFilters} className="mt-5 grid gap-3 md:grid-cols-6">
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.recipientType}</span>
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
                            <option value="ALL">{t.panelUi.reportCopy.allRecipients}</option>
                            <option value="MANAGER">{t.panelUi.reportCopy.managers}</option>
                            <option value="USER">{t.panelUi.reportCopy.users}</option>
                        </select>
                    </label>

                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.actor}</span>
                        <select
                            value={form.actorRole}
                            onChange={(event) => setForm((current) => ({
                                ...current,
                                actorRole: event.target.value as ActorRole,
                                actorId: '',
                            }))}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                        >
                            <option value="ALL">{t.panelUi.reportCopy.allActors}</option>
                            <option value="ADMIN">{t.panelUi.reportCopy.admin}</option>
                            <option value="MANAGER">{t.panelUi.reportCopy.manager}</option>
                            <option value="SYSTEM">{t.panelUi.reportCopy.systemSource}</option>
                        </select>
                    </label>

                    {form.actorRole !== 'ALL' && form.actorRole !== 'SYSTEM' && (
                        <label className="space-y-1 text-sm">
                            <span className="text-muted-foreground">{t.panelUi.reportCopy.actorAccount}</span>
                            <select
                                value={form.actorId}
                                onChange={(event) => setForm((current) => ({ ...current, actorId: event.target.value }))}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                            >
                                <option value="">{t.common.all}</option>
                                {actorOptions.map((actor) => (
                                    <option key={actor.id} value={actor.id}>{actor.username}</option>
                                ))}
                            </select>
                        </label>
                    )}

                    {form.recipientRole === 'MANAGER' && (
                        <label className="space-y-1 text-sm">
                            <span className="text-muted-foreground">{t.panelUi.reportCopy.managerRecipient}</span>
                            <select
                                value={form.recipientId}
                                onChange={(event) => setForm((current) => ({ ...current, recipientId: event.target.value }))}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                            >
                                <option value="">{t.panelUi.reportCopy.allManagers}</option>
                                {recipientOptions.map((manager) => (
                                    <option key={manager.id} value={manager.id}>{manager.username}</option>
                                ))}
                            </select>
                        </label>
                    )}

                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">{t.panelUi.reportCopy.range}</span>
                        <select
                            value={form.range}
                            onChange={(event) => setForm((current) => ({ ...current, range: event.target.value as BalanceReportRange }))}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                        >
                            <option value="today">{t.panelUi.reportCopy.today}</option>
                            <option value="week">{t.panelUi.reportCopy.thisWeek}</option>
                            <option value="month">{t.panelUi.reportCopy.thisMonth}</option>
                            <option value="custom">{t.panelUi.reportCopy.custom}</option>
                        </select>
                    </label>

                    {form.range === 'custom' && (
                        <>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">{t.panelUi.reportCopy.from}</span>
                                <input
                                    type="date"
                                    value={form.from}
                                    onChange={(event) => setForm((current) => ({ ...current, from: event.target.value }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">{t.panelUi.reportCopy.to}</span>
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
                                <span className="text-muted-foreground">{t.panelUi.reportCopy.currentUserOwner}</span>
                                <select
                                    value={form.ownerType}
                                    onChange={(event) => setForm((current) => ({
                                        ...current,
                                        ownerType: event.target.value as OwnerType,
                                        ownerId: '',
                                    }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                                >
                                    <option value="">{t.panelUi.reportCopy.allOwners}</option>
                                    <option value="ADMIN">{t.panelUi.reportCopy.admin}</option>
                                    <option value="MANAGER">{t.panelUi.reportCopy.manager}</option>
                                    <option value="AGENT">{t.common.ownerAgent}</option>
                                </select>
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">{t.panelUi.reportCopy.ownerAccount}</span>
                                <select
                                    value={form.ownerId}
                                    onChange={(event) => setForm((current) => ({ ...current, ownerId: event.target.value, recipientId: '' }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                                >
                                    <option value="">{t.common.all}</option>
                                    {ownerOptions.map((owner) => (
                                        <option key={owner.id} value={owner.id}>{owner.username}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">{t.panelUi.reportCopy.userSearch}</span>
                                <div className="relative">
                                    <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="search"
                                        value={form.userSearch}
                                        onChange={(event) => setForm((current) => ({ ...current, userSearch: event.target.value, recipientId: '' }))}
                                        placeholder={t.panelUi.reportCopy.usernameEmail}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 pe-9 text-foreground"
                                    />
                                </div>
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-muted-foreground">{t.panelUi.reportCopy.userRecipient}</span>
                                <select
                                    value={form.recipientRole === 'USER' ? form.recipientId : ''}
                                    disabled={form.recipientRole !== 'USER'}
                                    onChange={(event) => setForm((current) => ({ ...current, recipientId: event.target.value }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <option value="">{t.panelUi.reportCopy.allMatchingUsers}</option>
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
                        {t.panelUi.reportCopy.apply}
                    </button>
                </form>
            </div>

            {error !== null && <PanelLoadError status={error} retry={() => void loadReport()} />}
            {downloadError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {t.panelUi.reportCopy.pdfFailed} {downloadError}
                </div>
            )}

            {loading && <p role="status" className="p-6 text-center text-muted-foreground">{tableText.common.loading}</p>}
            {data && !loading && error === null && <div data-panel-report-results className="contents"><ReportContent data={data} loading={false} /></div>}

            {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
                    <span className="text-muted-foreground">
                        {t.panelUi.reportCopy.page} {data.pagination.page} {t.panelUi.reportCopy.of} {data.pagination.totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => changePage(Math.max(1, data.pagination.page - 1))}
                            disabled={data.pagination.page <= 1}
                            className="rounded-lg border border-border px-3 py-1.5 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {t.panelUi.reportCopy.previous}
                        </button>
                        <button
                            type="button"
                            onClick={() => changePage(Math.min(data.pagination.totalPages, data.pagination.page + 1))}
                            disabled={data.pagination.page >= data.pagination.totalPages}
                            className="rounded-lg border border-border px-3 py-1.5 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {t.panelUi.reportCopy.next}
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
