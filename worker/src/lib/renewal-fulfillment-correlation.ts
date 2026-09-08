import type { Contract } from '../http/types'
import type { SoldReportSafeRow, SoldReportScanOutcome } from '../http/sold-packages-report'

export type FulfillmentCorrelationOutcome =
    | 'MATCHED'
    | 'VALID_NO_MATCH'
    | 'REPORT_ONLY'
    | 'CONTRACT_ONLY'
    | 'INCOMPLETE_SCAN'
    | 'CHECK_FAILED'
    | 'PROOF_CONFLICT'

interface CorrelationBaseline {
    outcome: SoldReportScanOutcome
    invoiceNos: readonly string[]
    dealerContextHash: string
    capturedAt: string
}

interface CorrelationReportCheck {
    outcome: SoldReportScanOutcome
    rows: readonly SoldReportSafeRow[]
    dealerContextHash: string
    observedAt: string
}

interface CorrelationContractCheck {
    outcome: SoldReportScanOutcome
    contracts: readonly Contract[]
    observedAt: string
}

interface CorrelationTarget {
    cardNumber: string
    itemType: string
    selectedPackageName: string
    providerAmount: string
    currency: string
    finalMutationStartedAt: string
}

export interface RenewalFulfillmentCorrelationInput {
    baseline: CorrelationBaseline
    postReport: CorrelationReportCheck
    contractCheck: CorrelationContractCheck
    target: CorrelationTarget
}

export interface RenewalFulfillmentCorrelationResult {
    outcome: FulfillmentCorrelationOutcome
    reasonCode: string
    discoveredInvoiceNo: string | null
    reportRow: SoldReportSafeRow | null
    matchedContract: Contract | null
}

interface PackageIdentity {
    baseName: string
    durationMonths: number | null
    promotionPercent: string | null
    valid: boolean
}

function canonicalDecimal(value: string): string | null {
    const match = value.trim().replace(/,/g, '').match(/^\+?(\d+)(?:\.(\d+))?$/)
    if (!match) return null
    const whole = match[1].replace(/^0+(?=\d)/, '')
    const fraction = (match[2] || '').replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}` : whole
}

function uniqueMatches(value: string, expression: RegExp): string[] {
    return [...value.matchAll(expression)].map((match) => canonicalDecimal(match[1]) || match[1])
        .filter((match, index, matches) => matches.indexOf(match) === index)
}

function packageIdentity(value: string): PackageIdentity {
    const normalized = value.toLowerCase()
    const durations = uniqueMatches(normalized, /(\d+(?:\.\d+)?)\s*months?\b/g)
    const promotions = uniqueMatches(normalized, /save\s*(\d+(?:\.\d+)?)\s*%/g)
    const baseName = normalized
        .replace(/\b(?:renewal|add)\b/g, ' ')
        .replace(/\bfull\s+payment\b/g, ' ')
        .replace(/\d+(?:\.\d+)?\s*months?\b/g, ' ')
        .replace(/save\s*\d+(?:\.\d+)?\s*%/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return {
        baseName,
        durationMonths: durations.length === 1 ? Number(durations[0]) : null,
        promotionPercent: promotions.length === 1 ? promotions[0] : null,
        valid: Boolean(baseName) && durations.length === 1 && promotions.length <= 1,
    }
}

function samePackage(left: string, right: string): boolean {
    const leftIdentity = packageIdentity(left)
    const rightIdentity = packageIdentity(right)
    return leftIdentity.valid && rightIdentity.valid &&
        leftIdentity.baseName === rightIdentity.baseName &&
        leftIdentity.durationMonths === rightIdentity.durationMonths &&
        leftIdentity.promotionPercent === rightIdentity.promotionPercent
}

function providerDateKey(value: string): number | null {
    const slash = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    const dash = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    const year = slash ? Number(slash[3]) : dash ? Number(dash[1]) : NaN
    const month = slash ? Number(slash[2]) : dash ? Number(dash[2]) : NaN
    const day = slash ? Number(slash[1]) : dash ? Number(dash[3]) : NaN
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return year * 10000 + month * 100 + day
}

function cairoDateKey(value: string): number | null {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)
    const year = Number(parts.find((part) => part.type === 'year')?.value)
    const month = Number(parts.find((part) => part.type === 'month')?.value)
    const day = Number(parts.find((part) => part.type === 'day')?.value)
    return year * 10000 + month * 100 + day
}

function exactText(left: string, right: string): boolean {
    const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()
    return normalize(left) === normalize(right)
}

function activeContract(status: string): boolean {
    return status.replace(/\s+/g, ' ').trim().toLowerCase() === 'active'
}

function rowMatchesTarget(row: SoldReportSafeRow, target: CorrelationTarget): boolean {
    const expectedDate = cairoDateKey(target.finalMutationStartedAt)
    const reportAmount = canonicalDecimal(row.providerAmount)
    const expectedAmount = canonicalDecimal(target.providerAmount)
    return row.cardNumber.trim() === target.cardNumber.trim() &&
        exactText(row.itemType, target.itemType) &&
        samePackage(row.packageName, target.selectedPackageName) &&
        reportAmount !== null && reportAmount === expectedAmount &&
        row.currency.toUpperCase() === target.currency.trim().toUpperCase() &&
        expectedDate !== null && providerDateKey(row.contractStartDate) === expectedDate
}

function contractMatchesTarget(contract: Contract, target: CorrelationTarget): boolean {
    const expectedDate = cairoDateKey(target.finalMutationStartedAt)
    return activeContract(contract.status) &&
        samePackage(contract.package, target.selectedPackageName) &&
        expectedDate !== null && providerDateKey(contract.startDate) === expectedDate
}

function correlationResult(
    outcome: FulfillmentCorrelationOutcome,
    reasonCode: string,
    reportRow: SoldReportSafeRow | null = null,
    matchedContract: Contract | null = null
): RenewalFulfillmentCorrelationResult {
    return {
        outcome,
        reasonCode,
        discoveredInvoiceNo: reportRow?.invoiceNo.trim() || null,
        reportRow,
        matchedContract,
    }
}

function unavailableOutcome(outcome: SoldReportScanOutcome): FulfillmentCorrelationOutcome | null {
    if (outcome === 'CHECK_FAILED') return 'CHECK_FAILED'
    if (outcome === 'INCOMPLETE_SCAN') return 'INCOMPLETE_SCAN'
    return null
}

function correlateReportCandidate(
    row: SoldReportSafeRow,
    contracts: readonly Contract[],
    target: CorrelationTarget
): RenewalFulfillmentCorrelationResult {
    const invoiceNo = row.invoiceNo.trim()
    const matches = contracts.filter((contract) =>
        contract.invoiceNo.trim() === invoiceNo && contractMatchesTarget(contract, target)
    )
    if (matches.length > 1) return correlationResult('PROOF_CONFLICT', 'MULTIPLE_MATCHING_CONTRACTS', row)
    if (matches.length === 0) return correlationResult('REPORT_ONLY', 'REPORT_WITHOUT_ACTIVE_CONTRACT', row)
    return correlationResult('MATCHED', 'REPORT_AND_CONTRACT_INVOICE_MATCHED', row, matches[0])
}

function correlateWithoutReportRow(
    baselineInvoices: ReadonlySet<string>,
    contracts: readonly Contract[],
    target: CorrelationTarget
): RenewalFulfillmentCorrelationResult {
    const candidates = contracts.filter((contract) => {
        const invoiceNo = contract.invoiceNo.trim()
        return Boolean(invoiceNo) && !baselineInvoices.has(invoiceNo) && contractMatchesTarget(contract, target)
    })
    if (candidates.length > 1) return correlationResult('PROOF_CONFLICT', 'MULTIPLE_CONTRACT_ONLY_CANDIDATES')
    if (candidates.length === 1) {
        const matched = candidates[0]
        return {
            ...correlationResult('CONTRACT_ONLY', 'CONTRACT_WITHOUT_REPORT_INVOICE', null, matched),
            discoveredInvoiceNo: matched.invoiceNo.trim(),
        }
    }
    return correlationResult('VALID_NO_MATCH', 'VALID_NO_MATCH')
}

export function correlateRenewalFulfillment(
    input: RenewalFulfillmentCorrelationInput
): RenewalFulfillmentCorrelationResult {
    const unavailable = unavailableOutcome(input.baseline.outcome) ||
        unavailableOutcome(input.postReport.outcome) ||
        unavailableOutcome(input.contractCheck.outcome)
    if (unavailable) return correlationResult(unavailable, unavailable)
    if (!input.baseline.dealerContextHash ||
        input.baseline.dealerContextHash !== input.postReport.dealerContextHash) {
        return correlationResult('PROOF_CONFLICT', 'DEALER_CONTEXT_CHANGED')
    }

    const baselineInvoices = new Set(
        input.baseline.invoiceNos.map((invoice) => invoice.trim()).filter(Boolean)
    )
    const newRows = input.postReport.rows.filter((row) => !baselineInvoices.has(row.invoiceNo.trim()))
    if (newRows.some((row) => !row.invoiceNo.trim())) {
        return correlationResult('PROOF_CONFLICT', 'BLANK_INVOICE')
    }
    if (newRows.length === 0) {
        return correlateWithoutReportRow(baselineInvoices, input.contractCheck.contracts, input.target)
    }

    const matchingRows = newRows.filter((row) => rowMatchesTarget(row, input.target))
    if (matchingRows.length > 1) return correlationResult('PROOF_CONFLICT', 'MULTIPLE_MATCHING_INVOICES')
    if (matchingRows.length === 0) return correlationResult('PROOF_CONFLICT', 'NEW_REPORT_ROW_MISMATCH')
    if (newRows.length > 1) return correlationResult('PROOF_CONFLICT', 'UNEXPECTED_ACCOUNT_ACTIVITY')
    return correlateReportCandidate(matchingRows[0], input.contractCheck.contracts, input.target)
}
