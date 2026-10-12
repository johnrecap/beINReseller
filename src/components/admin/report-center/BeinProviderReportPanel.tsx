'use client'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { useProviderReport } from '@/hooks/useProviderReport'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { defaultReportDates, validReportCriteria, type ProviderReportAccount } from '../../../../shared/reports/bein-provider'

const control = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring'
const button = 'rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 disabled:cursor-not-allowed'
export default function BeinProviderReportPanel() {
    const { t, language, dir } = useTranslation()
    const text = t.providerReport
    const options = usePanelRequest()
    const { load } = options
    const report = useProviderReport()
    const [accounts, setAccounts] = useState<ProviderReportAccount[]>([])
    const [accountId, setAccountId] = useState('')
    const [accountSearch, setAccountSearch] = useState('')
    const [dates, setDates] = useState(defaultReportDates)
    const [search, setSearch] = useState('')
    const [validation, setValidation] = useState(false)
    const reloadAccounts = () => load<{ accounts: ProviderReportAccount[] }>('/api/admin/bein-accounts?view=report-options', data => setAccounts(data.accounts))
    useEffect(() => { void load<{ accounts: ProviderReportAccount[] }>('/api/admin/bein-accounts?view=report-options', data => setAccounts(data.accounts)) }, [load])
    const selected = accounts.find(a => a.id === accountId)
    const visibleAccounts = useMemo(() => accounts.filter(a => a.id === accountId ||
        `${a.username} ${a.label || ''}`.toLowerCase().includes(accountSearch.toLowerCase())), [accounts, accountId, accountSearch])
    const start = (id = accountId) => {
        const criteria = { accountId: id, ...dates }
        setSearch(''); setValidation(!validReportCriteria(criteria))
        if (validReportCriteria(criteria)) void report.start(criteria)
        else report.clear()
    }
    const error = validation ? 'VALIDATION_ERROR' : report.error
    const errorText = error ? text.errors[error as keyof typeof text.errors] || text.errors.REPORT_FAILED : null
    const result = report.result
    return <section dir={dir} className="min-w-0 space-y-4" aria-labelledby="provider-report-title">
        <div><h2 id="provider-report-title" className="text-xl font-semibold">{text.title}</h2><p className="mt-1 text-sm text-muted-foreground">{text.description}</p></div>
        {options.error !== null ? <PanelLoadError status={options.error} retry={() => { void reloadAccounts() }} /> :
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-sm">{text.findAccount}<input className={control} value={accountSearch} onChange={e => setAccountSearch(e.target.value)} /></label>
            <label className="space-y-1 text-sm">{text.account}<select aria-label={text.account} className={control} value={accountId} disabled={options.loading} onChange={e => {
                const id = e.target.value; setAccountId(id); report.clear(); if (id) start(id)
            }}><option value="">{options.loading ? t.common.loading : text.chooseAccount}</option>
                {visibleAccounts.map(a => <option key={a.id} value={a.id} disabled={!a.eligible}>{a.username}{a.label ? ` — ${a.label}` : ''} · {a.eligible ? text.available : text.unavailable}</option>)}
            </select></label>
            <label className="space-y-1 text-sm">{text.from}<input type="date" className={control} value={dates.from} onChange={e => setDates(d => ({ ...d, from: e.target.value }))} /></label>
            <label className="space-y-1 text-sm">{text.to}<input type="date" className={control} value={dates.to} onChange={e => setDates(d => ({ ...d, to: e.target.value }))} /></label>
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">{text.rangeHint}</p>
            <button className={button} disabled={!selected?.eligible || report.loading} onClick={() => start()}>{t.common.refresh}</button>
        </div>}
        {errorText && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{errorText}</div>}
        <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {report.loading ? (result?.state === 'COMPLETED' ? t.common.loading : result?.state === 'RUNNING' ? text.running : text.queued) : !accountId ? text.chooseAccount : null}
        </div>
        {result?.state === 'COMPLETED' && !error && <>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1 text-sm"><p><bdi>{selected?.username}</bdi> · <bdi>{result.from} → {result.to}</bdi></p>
                    <p className="text-muted-foreground">{text.fetchedAt}: {result.fetchedAt ? new Date(result.fetchedAt).toLocaleString(language === 'bn' ? 'bn-BD' : language, { timeZone: 'Africa/Cairo' }) : '—'}</p>
                </div>
                <form className="flex w-full gap-2 sm:w-auto" onSubmit={e => { e.preventDefault(); void report.browse(1, search.trim()) }}>
                    <label className="min-w-0 flex-1 text-sm">{text.search}<input className={control} value={search} onChange={e => setSearch(e.target.value)} maxLength={100} /></label>
                    <button className={`${button} self-end`} disabled={report.loading}>{t.common.search}</button>
                </form>
            </div>
            <p className="text-xs text-muted-foreground">{text.dateNotice}</p>
            {result.rows.length ? <Table panel className="min-w-[850px]" aria-label={text.title}>
                <TableHeader><TableRow>{[text.invoice, text.card, text.itemType, text.package, text.start, text.expiry, text.amount].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{result.rows.map((row, index) => <TableRow key={`${row.invoiceNo}-${row.cardNumber}-${index}`}>
                    <TableCell><bdi>{row.invoiceNo}</bdi></TableCell><TableCell><bdi>{row.cardNumber}</bdi></TableCell>
                    <TableCell><bdi>{row.itemType}</bdi></TableCell><TableCell className="max-w-sm whitespace-normal"><bdi>{row.packageName}</bdi></TableCell>
                    <TableCell><bdi>{row.contractStartDate}</bdi></TableCell><TableCell><bdi>{row.contractExpiryDate}</bdi></TableCell>
                    <TableCell><bdi>{row.providerAmount} {row.currency}</bdi></TableCell>
                </TableRow>)}</TableBody>
            </Table> : <p className="rounded-lg border border-border p-5 text-sm">{text.empty}</p>}
            <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={text.pagination}>
                <button className={button} disabled={report.loading || result.page <= 1} onClick={() => { void report.browse(result.page - 1, search.trim()) }}>{text.previous}</button>
                <span className="text-sm">{text.page.replace('{page}', String(result.page)).replace('{pages}', String(Math.max(1, Math.ceil(result.total / 50)))).replace('{total}', String(result.total))}</span>
                <button className={button} disabled={report.loading || result.page * 50 >= result.total} onClick={() => { void report.browse(result.page + 1, search.trim()) }}>{text.next}</button>
            </nav>
        </>}
    </section>
}
