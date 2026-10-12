// A package key identifies a row within one operation's quote, never a beIN product.
export type QuoteState = 'PENDING' | 'READY' | 'FAILED'
export type PromoAction = 'APPLY' | 'REMOVE'
export type QuotePackage = {
    index: number; name: string; price: number; currency?: string
    checkboxValue?: string; checkboxSelector?: string
    quoteRevision?: number; packageKey?: string; appliedPromoCode?: string | null
}
type QuoteOperation = { responseData?: unknown; availablePackages?: unknown; promoCode?: string | null; selectedPackage?: unknown }

export function sameQuotedPackage(left: Pick<QuotePackage, 'name' | 'price' | 'currency'>,
    right: Pick<QuotePackage, 'name' | 'price' | 'currency'>): boolean {
    const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()
    return Boolean(left.name?.trim()) && normalize(left.name) === normalize(right.name) &&
        Number.isFinite(left.price) && left.price > 0 && left.price === right.price &&
        (left.currency || 'USD') === (right.currency || 'USD')
}

export function quoteData(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
        try { return quoteData(JSON.parse(value)) } catch { return {} }
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function actionRevision(type: string, value?: unknown): number {
    const revision = value === undefined ? 0 : value
    if (!Number.isSafeInteger(revision) || (revision as number) < 0 || (revision as number) > 2147483647 || (type !== 'APPLY_PROMO' && revision !== 0)) {
        throw new Error('INVALID_ACTION_REVISION')
    }
    return revision as number
}

export function quoteRevisionOf(data: unknown): number {
    const revision = quoteData(data).quoteRevision
    if (revision === undefined) return 0
    return actionRevision('APPLY_PROMO', revision)
}

function packageRows(value: unknown): QuotePackage[] {
    if (!Array.isArray(value)) return []
    return value.filter((row): row is QuotePackage => row && Number.isSafeInteger(row.index) && row.index >= 0 &&
        typeof row.name === 'string' && row.name.trim().length > 0 && Number.isFinite(row.price) && row.price > 0)
}

export function readyPackageQuote(previous: unknown, packages: readonly QuotePackage[], revision: number, promoCode: string | null) {
    actionRevision('APPLY_PROMO', revision)
    return { ...quoteData(previous), quoteRevision: revision, quoteState: 'READY' as const, refreshing: false,
        appliedPromoCode: promoCode, promoCode, promoApplied: promoCode !== null, error: null, packages }
}

export function publicPackageQuote(operation: QuoteOperation) {
    const data = quoteData(operation.responseData)
    const quoteRevision = quoteRevisionOf(data)
    const quoteState: QuoteState = data.refreshing === true || data.quoteState === 'PENDING' ? 'PENDING'
        : data.quoteState === 'FAILED' || (data.promoApplied === false && Boolean(data.error)) ? 'FAILED' : 'READY'
    const appliedPromoCode = typeof data.appliedPromoCode === 'string' ? data.appliedPromoCode
        : data.appliedPromoCode === null ? null : data.promoApplied === true ? operation.promoCode || null : null
    return { quoteRevision, quoteState, refreshing: quoteState === 'PENDING', appliedPromoCode,
        packages: packageRows(operation.availablePackages).map(row => ({ index: row.index, name: row.name,
            price: row.price, currency: row.currency || 'USD', quoteRevision, packageKey: `${quoteRevision}.${row.index}` })) }
}

export function selectQuotedPackage(operation: QuoteOperation, input: {
    quoteRevision?: number; packageKey?: string; packageIndex?: number; promoCode?: string
}) {
    const quote = publicPackageQuote(operation)
    if (quote.quoteState !== 'READY') throw new Error('PACKAGE_QUOTE_NOT_READY')
    if (input.quoteRevision !== quote.quoteRevision) throw new Error('STALE_PACKAGE_QUOTE')
    if (input.promoCode !== undefined && (input.promoCode || null) !== quote.appliedPromoCode) throw new Error('PROMO_QUOTE_CONFLICT')
    const matches = packageRows(operation.availablePackages).filter(row => input.packageKey !== undefined
        ? `${quote.quoteRevision}.${row.index}` === input.packageKey : row.index === input.packageIndex)
    if (matches.length !== 1) throw new Error('PACKAGE_NOT_FOUND')
    const row = matches[0]
    return { promoCode: quote.appliedPromoCode, selectedPackage: { ...row, currency: row.currency || 'USD',
        quoteRevision: quote.quoteRevision, packageKey: `${quote.quoteRevision}.${row.index}`, appliedPromoCode: quote.appliedPromoCode } }
}

export function assertFinalQuote(operation: QuoteOperation, revision: number | undefined) {
    const selected = quoteData(operation.selectedPackage)
    const result = selectQuotedPackage(operation, { quoteRevision: revision, packageKey: selected.packageKey as string | undefined,
        packageIndex: selected.index as number | undefined })
    if (selected.quoteRevision !== revision || selected.name !== result.selectedPackage.name ||
        selected.price !== result.selectedPackage.price || selected.currency !== result.selectedPackage.currency ||
        selected.appliedPromoCode !== result.promoCode) {
        throw new Error('PACKAGE_QUOTE_CONFLICT')
    }
    return result.selectedPackage
}

const quoteErrors = new Set(['STALE_PACKAGE_QUOTE', 'PACKAGE_QUOTE_NOT_READY', 'PROMO_QUOTE_CONFLICT',
    'PACKAGE_QUOTE_CONFLICT', 'PACKAGE_NOT_FOUND', 'PROMO_REQUEST_CONFLICT', 'INVALID_ACTION_REVISION'])

export function quoteErrorPayload(error: unknown) {
    const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
    return quoteErrors.has(code) ? { code, error: code, messageKey: code === 'PACKAGE_QUOTE_NOT_READY'
        ? 'operations.packageQuoteNotReady' : 'operations.packageQuoteChanged' } : null
}

// Persisted jsonb may reorder object keys. Preserve values/array order, ignore object key order only.
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key =>
        `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
    return JSON.stringify(value)
}
