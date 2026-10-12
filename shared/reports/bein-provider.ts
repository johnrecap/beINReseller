/** Display-only provider reports. These DTOs are never financial fulfillment proof. */
export const PROVIDER_REPORT_WAIT_MS = 5 * 60_000
export const PROVIDER_REPORT_READ_MS = 60_000
export const PROVIDER_REPORT_TTL_SECONDS = 300
export const PROVIDER_REPORT_REFRESH_SECONDS = 30
export type ProviderReportCriteria = { accountId: string; from: string; to: string }
export type ProviderReportRow = {
    invoiceNo: string; cardNumber: string; itemType: string; packageName: string
    contractStartDate: string; contractExpiryDate: string; providerAmount: string; currency: 'USD'
}
export type ProviderReportError = 'ACCOUNT_BUSY' | 'ACCOUNT_UNAVAILABLE' | 'LOGIN_FAILED' |
    'CAPTCHA_REQUIRED' | 'REPORT_INCOMPLETE' | 'REPORT_TIMEOUT' | 'REPORT_FAILED' | 'RATE_LIMITED'
export type ProviderReportRequest = ProviderReportCriteria & {
    id: string; createdAt: number; deadline: number
    state: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
    runToken?: string; fetchedAt?: string; rows?: ProviderReportRow[]; errorCode?: ProviderReportError
}
export type ProviderReportAccount = { id: string; username: string; label: string | null; eligible: boolean }
export type ProviderReportPage = Omit<ProviderReportRequest, 'rows' | 'runToken'> & {
    rows: ProviderReportRow[]; total: number; page: number; pageSize: number
}

function dateValue(value: unknown): number {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
    const time = Date.parse(`${value}T00:00:00Z`)
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN
}
export function validReportCriteria(value: unknown): value is ProviderReportCriteria {
    if (!value || typeof value !== 'object') return false
    const v = value as ProviderReportCriteria
    const days = (dateValue(v.to) - dateValue(v.from)) / 86_400_000
    return typeof v.accountId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v.accountId) &&
        Number.isFinite(days) && days >= 0 && days < 31
}
export function defaultReportDates(now = new Date()): { from: string; to: string } {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now)
    const p = Object.fromEntries(parts.map(part => [part.type, part.value]))
    const to = `${p.year}-${p.month}-${p.day}`
    return { to, from: new Date(dateValue(to) - 6 * 86_400_000).toISOString().slice(0, 10) }
}
export function providerDate(iso: string): string { return iso.split('-').reverse().join('/') }
export function reportPage(request: ProviderReportRequest, page = 1, search = '', now = Date.now()): ProviderReportPage {
    const { runToken: _token, rows: _rows, ...safe } = request
    void _token; void _rows
    if ((safe.state === 'QUEUED' || safe.state === 'RUNNING') && now >= safe.deadline) {
        safe.state = 'FAILED'; safe.errorCode = 'REPORT_TIMEOUT'
    }
    const rows = safe.state === 'COMPLETED' ? (request.rows ?? []).filter(row =>
        row.invoiceNo.includes(search) || row.cardNumber.includes(search)
    ).sort((a, b) => b.invoiceNo.localeCompare(a.invoiceNo, 'en', { numeric: true }) ||
        a.cardNumber.localeCompare(b.cardNumber)) : []
    const current = Math.min(Math.max(1, Math.floor(page)), Math.max(1, Math.ceil(rows.length / 50)))
    return { ...safe, rows: rows.slice((current - 1) * 50, current * 50), total: rows.length, page: current, pageSize: 50 }
}
