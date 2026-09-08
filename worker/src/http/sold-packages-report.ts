import { createHash } from 'node:crypto'
import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'
import { collectSuccessfulControls, type SuccessfulControl } from './webforms-form'

export type SoldReportScanOutcome = 'COMPLETE' | 'INCOMPLETE_SCAN' | 'CHECK_FAILED'

export interface SoldReportSafeRow {
    invoiceNo: string
    cardNumber: string
    itemType: string
    packageName: string
    contractStartDate: string
    contractExpiryDate: string
    providerAmount: string
    currency: 'USD'
    rowFingerprint: string
}

export interface SoldReportPagerTarget {
    eventTarget: string
    eventArgument: string
    pageNumber: number
}

export interface SoldReportPage {
    outcome: Exclude<SoldReportScanOutcome, 'CHECK_FAILED'>
    reasonCode?: string
    dealerContextHash: string | null
    rows: SoldReportSafeRow[]
    currentPage: number
    pagerTargets: SoldReportPagerTarget[]
    pagerComplete: boolean
    expectedTotalRows: number | null
    pageFingerprint: string
    firstPageWatermark: string
}

export interface SoldReportScanResult {
    outcome: SoldReportScanOutcome
    reasonCode?: string
    dealerContextHash: string | null
    rows: SoldReportSafeRow[]
    pageCount: number
    pageCap: number
    scanAttemptCount: number
    firstPageWatermark: string | null
}

export interface SoldReportTransport {
    freshGet(): Promise<string>
    post(controls: readonly SuccessfulControl[]): Promise<string>
}

export interface SoldReportScanOptions {
    pageCap?: number
    scanAttempts?: number
}

interface ScanValidationInput {
    visitedPages: readonly SoldReportPage[]
    firstPageRecheck: SoldReportPage
    pageCap?: number
}

type SafeHeader =
    | 'invoiceNo'
    | 'cardNumber'
    | 'itemType'
    | 'packageName'
    | 'contractStartDate'
    | 'contractExpiryDate'
    | 'providerAmount'

const DEFAULT_PAGE_CAP = 100
const DEFAULT_SCAN_ATTEMPTS = 2
const APPLY_CONTROL = 'ctl00$ContentPlaceHolder1$btnApply'

const headerAliases: Record<SafeHeader, readonly string[]> = {
    invoiceNo: ['invoice no', 'invoice number', 'invoice'],
    cardNumber: ['smart card cam serial', 'smart card serial', 'cam serial'],
    itemType: ['item type'],
    packageName: ['package'],
    contractStartDate: ['contract start', 'contract start date'],
    contractExpiryDate: ['contract expiry', 'contract expiry date'],
    providerAmount: ['amount usd', 'amount'],
}

function sha256(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizedText(value: string): string {
    return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizedHeader(value: string): string {
    return normalizedText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function canonicalDecimal(value: string): string | null {
    const match = normalizedText(value).replace(/,/g, '').match(/^\+?(\d+)(?:\.(\d+))?$/)
    if (!match) return null
    const whole = match[1].replace(/^0+(?=\d)/, '')
    const fraction = (match[2] || '').replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}` : whole
}

interface DealerContext {
    hash: string
    normalizedLabel: string
}

interface DealerContextSelection {
    context: DealerContext | null
    reasonCode?:
        | 'DEALER_CONTEXT_MISSING'
        | 'DEALER_CONTEXT_AMBIGUOUS'
        | 'REPORT_CRITERIA_MISSING'
        | 'REPORT_CRITERIA_AMBIGUOUS'
}

function selectedOptionContext(
    $: cheerio.CheerioAPI,
    selector: string
): { value: string; label: string } | null | 'AMBIGUOUS' {
    const controls = $(selector)
    if (controls.length === 0) return null
    if (controls.length !== 1) return 'AMBIGUOUS'
    const explicitlySelected = controls.first().find('option[selected]')
    if (explicitlySelected.length > 1) return 'AMBIGUOUS'
    const selected = explicitlySelected.length === 1
        ? explicitlySelected.first()
        : controls.first().find('option').first()
    if (!selected.length) return null
    return {
        value: (selected.attr('value') ?? selected.text()).normalize('NFC'),
        label: normalizedText(selected.text()).toLowerCase(),
    }
}

function exactInputValue(
    $: cheerio.CheerioAPI,
    selector: string
): string | null | 'AMBIGUOUS' {
    const controls = $(selector)
    if (controls.length === 0) return null
    if (controls.length !== 1) return 'AMBIGUOUS'
    return normalizedText(controls.first().attr('value') ?? '')
}

function dealerContext($: cheerio.CheerioAPI): DealerContextSelection {
    const dealers = $('select[name$="$ddlDealer"], select[id$="_ddlDealer"]')
    if (dealers.length === 0) return { context: null, reasonCode: 'DEALER_CONTEXT_MISSING' }
    if (dealers.length !== 1) return { context: null, reasonCode: 'DEALER_CONTEXT_AMBIGUOUS' }
    const dealer = dealers.first()
    const explicitlySelected = dealer.find('option[selected]')
    if (explicitlySelected.length > 1) {
        return { context: null, reasonCode: 'DEALER_CONTEXT_AMBIGUOUS' }
    }
    const selected = explicitlySelected.length === 1
        ? explicitlySelected.first()
        : dealer.find('option').first()
    if (!selected.length) return { context: null, reasonCode: 'DEALER_CONTEXT_MISSING' }
    const normalizedLabel = normalizedText(selected.text()).toLowerCase()
    const exactValue = (selected.attr('value') ?? selected.text()).normalize('NFC')
    if (!normalizedLabel && !exactValue) {
        return { context: null, reasonCode: 'DEALER_CONTEXT_MISSING' }
    }
    const itemType = selectedOptionContext(
        $,
        'select[name$="$ddlItemType"], select[id$="_ddlItemType"]'
    )
    const fromDate = exactInputValue(
        $,
        'input[name$="$txtFromDate"], input[id$="_txtFromDate"]'
    )
    const toDate = exactInputValue(
        $,
        'input[name$="$txtToDate"], input[id$="_txtToDate"]'
    )
    if (itemType === 'AMBIGUOUS' || fromDate === 'AMBIGUOUS' || toDate === 'AMBIGUOUS') {
        return { context: null, reasonCode: 'REPORT_CRITERIA_AMBIGUOUS' }
    }
    if (!itemType || fromDate === null || toDate === null) {
        return { context: null, reasonCode: 'REPORT_CRITERIA_MISSING' }
    }
    return {
        context: {
            hash: sha256([
                'sold-report-criteria-v1',
                exactValue,
                normalizedLabel,
                itemType.value,
                itemType.label,
                fromDate,
                toDate,
            ]),
            normalizedLabel,
        },
    }
}

function incompletePage(reasonCode: string, dealerContextHash: string | null): SoldReportPage {
    return {
        outcome: 'INCOMPLETE_SCAN',
        reasonCode,
        dealerContextHash,
        rows: [],
        currentPage: 1,
        pagerTargets: [],
        pagerComplete: false,
        expectedTotalRows: null,
        pageFingerprint: sha256(['incomplete', reasonCode]),
        firstPageWatermark: sha256([]),
    }
}

type DealerGroupValidation = 'VALID' | 'UNEXPECTED' | 'UNPARSEABLE'

interface DealerGroupSummary {
    validation: DealerGroupValidation
    markerCount: number
    expectedTotalRows: number | null
}

function validateDealerGroups(
    $: cheerio.CheerioAPI,
    table: cheerio.Cheerio<Element>,
    selectedDealerLabel: string
): DealerGroupSummary {
    let result: DealerGroupValidation = 'VALID'
    let markerCount = 0
    let expectedTotalRows: number | null = null
    table.find('tr').each((_, row) => {
        const current = $(row)
        if (/pager/i.test(current.attr('class') || '')) return
        const text = normalizedText(current.text())
        const marker = /total\s+sold\s+packages/i.exec(text)
        if (!marker) return
        markerCount += 1
        const prefix = text
            .slice(0, marker.index)
            .replace(/[\s\-–—:]+$/u, '')
        const groupLabel = normalizedText(prefix).toLowerCase()
        if (!groupLabel) {
            result = 'UNPARSEABLE'
            return
        }
        if (groupLabel !== selectedDealerLabel) {
            if (result !== 'UNPARSEABLE') result = 'UNEXPECTED'
            return
        }
        const totalMatch = /total\s+sold\s+packages\s*:\s*([\d,]+)/i.exec(text)
        if (!totalMatch) {
            result = 'UNPARSEABLE'
            return
        }
        const parsedTotal = Number(totalMatch[1].replace(/,/g, ''))
        if (!Number.isSafeInteger(parsedTotal) || parsedTotal < 0) {
            result = 'UNPARSEABLE'
            return
        }
        if (expectedTotalRows !== null && expectedTotalRows !== parsedTotal) {
            result = 'UNPARSEABLE'
            return
        }
        expectedTotalRows = parsedTotal
    })
    return { validation: result, markerCount, expectedTotalRows }
}

function headerIndexes(
    $: cheerio.CheerioAPI,
    headerRow: cheerio.Cheerio<Element>
): Record<SafeHeader, number> | null {
    const headers = headerRow.find('th').map((_, cell) => normalizedHeader($(cell).text())).get()
    const entries = Object.entries(headerAliases).map(([field, aliases]) => [
        field,
        headers.findIndex((header) => aliases.includes(header)),
    ] as const)
    if (entries.some(([, index]) => index < 0)) return null
    return Object.fromEntries(entries) as Record<SafeHeader, number>
}

function safeRowFingerprint(row: Omit<SoldReportSafeRow, 'rowFingerprint'>): string {
    return sha256([
        row.invoiceNo,
        row.cardNumber,
        row.itemType,
        row.packageName,
        row.contractStartDate,
        row.contractExpiryDate,
        row.providerAmount,
        row.currency,
    ])
}

function reportRow(
    $: cheerio.CheerioAPI,
    cells: cheerio.Cheerio<Element>,
    indexes: Record<SafeHeader, number>
): SoldReportSafeRow | null {
    const providerAmount = canonicalDecimal($(cells[indexes.providerAmount]).text())
    if (providerAmount === null) return null
    const safeFields = {
        invoiceNo: normalizedText($(cells[indexes.invoiceNo]).text()),
        cardNumber: normalizedText($(cells[indexes.cardNumber]).text()),
        itemType: normalizedText($(cells[indexes.itemType]).text()),
        packageName: normalizedText($(cells[indexes.packageName]).text()),
        contractStartDate: normalizedText($(cells[indexes.contractStartDate]).text()),
        contractExpiryDate: normalizedText($(cells[indexes.contractExpiryDate]).text()),
        providerAmount,
        currency: 'USD' as const,
    }
    return { ...safeFields, rowFingerprint: safeRowFingerprint(safeFields) }
}

function parsedRows(
    $: cheerio.CheerioAPI,
    table: cheerio.Cheerio<Element>,
    indexes: Record<SafeHeader, number>
): { rows: SoldReportSafeRow[]; invalid: boolean } {
    const rows: SoldReportSafeRow[] = []
    let invalid = false
    const lastRequiredIndex = Math.max(...Object.values(indexes))
    table.find('tr').each((_, row) => {
        const current = $(row)
        const rowClass = (current.attr('class') || '').toLowerCase()
        if (current.find('th').length || rowClass.includes('pager')) return
        const cells = current.find('td') as cheerio.Cheerio<Element>
        const rowText = normalizedText(current.text()).toLowerCase()
        if (cells.length <= lastRequiredIndex) {
            if (rowText.includes('total sold packages') || rowText.includes('no records found')) return
            if (cells.length > 0) invalid = true
            return
        }
        const parsed = reportRow($, cells, indexes)
        if (parsed) rows.push(parsed)
        else invalid = true
    })
    return { rows, invalid }
}

function currentPageNumber($: cheerio.CheerioAPI, table: cheerio.Cheerio<Element>): number {
    const pager = table.find('tr').filter((_, row) => /pager/i.test($(row).attr('class') || '')).first()
    const numbers = pager.find('span').map((_, span) => Number(normalizedText($(span).text()))).get()
    return numbers.find((number) => Number.isInteger(number) && number > 0) || 1
}

function pageNumberFromArgument(argument: string, currentPage: number): number | null {
    const numeric = argument.match(/^Page\$(\d+)$/i)
    if (numeric) return Number(numeric[1])
    if (/^Page\$Next$/i.test(argument)) return currentPage + 1
    if (/^Page\$Prev$/i.test(argument)) return Math.max(1, currentPage - 1)
    if (/^Page\$First$/i.test(argument)) return 1
    return null
}

function isKnownPagerArgument(argument: string): boolean {
    return /^Page\$(?:\d+|Next|Prev|First|Last)$/i.test(argument)
}

function postbackPair(href: string): { eventTarget: string; eventArgument: string } | null {
    const direct = href.match(/__doPostBack\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/i)
    if (direct) return { eventTarget: direct[1], eventArgument: direct[2] }
    const options = href.match(/WebForm_PostBackOptions\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]/i)
    return options ? { eventTarget: options[1], eventArgument: options[2] } : null
}

function pagerTargets(
    $: cheerio.CheerioAPI,
    table: cheerio.Cheerio<Element>,
    currentPage: number
): { targets: SoldReportPagerTarget[]; complete: boolean } {
    const targets = new Map<string, SoldReportPagerTarget>()
    let complete = true
    table.find('tr').filter((_, row) => /pager/i.test($(row).attr('class') || '')).find('a[href]').each((_, link) => {
        const pair = postbackPair($(link).attr('href') || '')
        if (!pair || !isKnownPagerArgument(pair.eventArgument)) {
            complete = false
            return
        }
        const pageNumber = pageNumberFromArgument(pair.eventArgument, currentPage)
        // Page$Last is understood but deliberately not followed: a complete scan must
        // visit every intermediate page in order and prove the total row coverage.
        if (pageNumber === null) return
        const target = { ...pair, pageNumber }
        targets.set(`${target.eventTarget}\u0000${target.eventArgument}`, target)
    })
    return { targets: [...targets.values()], complete }
}

export function parseSoldPackagesReportPage(html: string): SoldReportPage {
    const $ = cheerio.load(html)
    const title = normalizedText($('title').text()).toLowerCase()
    if (title.includes('login') || $('input[type="password"], input[name$="$btnLogin"]').length) {
        return incompletePage('LOGIN_REQUIRED', null)
    }
    const selection = dealerContext($)
    if (!selection.context) {
        return incompletePage(selection.reasonCode || 'DEALER_CONTEXT_MISSING', null)
    }
    const context = selection.context

    const table = $('#ContentPlaceHolder1_GridView1').first().length
        ? $('#ContentPlaceHolder1_GridView1').first()
        : $('table[id$="_GridView1"]').first()
    if (!table.length) return incompletePage('MISSING_GRID', context.hash)
    const dealerGroups = validateDealerGroups(
        $,
        table as cheerio.Cheerio<Element>,
        context.normalizedLabel
    )
    if (dealerGroups.validation === 'UNPARSEABLE') {
        return incompletePage('UNPARSEABLE_DEALER_GROUP', context.hash)
    }
    if (dealerGroups.validation === 'UNEXPECTED') {
        return incompletePage('UNEXPECTED_DEALER_GROUP', context.hash)
    }
    const headerRow = table.find('tr').filter((_, row) => $(row).find('th').length > 0).first() as cheerio.Cheerio<Element>
    const indexes = headerIndexes($, headerRow)
    if (!indexes) return incompletePage('MISSING_REQUIRED_HEADERS', context.hash)
    const parsed = parsedRows($, table as cheerio.Cheerio<Element>, indexes)
    if (parsed.invalid) return incompletePage('INVALID_REPORT_ROW', context.hash)
    const explicitEmptyState = table.find('tr').toArray().some((row) =>
        normalizedText($(row).text()).toLowerCase().includes('no records found')
    )
    if (parsed.rows.length > 0 && dealerGroups.markerCount === 0) {
        return incompletePage('MISSING_DEALER_GROUP', context.hash)
    }
    if (dealerGroups.markerCount > 1) {
        return incompletePage('AMBIGUOUS_DEALER_GROUP', context.hash)
    }
    if (
        parsed.rows.length === 0 &&
        !explicitEmptyState &&
        dealerGroups.expectedTotalRows !== 0
    ) {
        return incompletePage('MISSING_EMPTY_REPORT_MARKER', context.hash)
    }

    const currentPage = currentPageNumber($, table as cheerio.Cheerio<Element>)
    const rowFingerprints = parsed.rows.map((row) => row.rowFingerprint)
    const pager = pagerTargets($, table as cheerio.Cheerio<Element>, currentPage)
    const expectedTotalRows = explicitEmptyState
        ? 0
        : dealerGroups.expectedTotalRows
    return {
        outcome: 'COMPLETE',
        dealerContextHash: context.hash,
        rows: parsed.rows,
        currentPage,
        pagerTargets: pager.targets,
        pagerComplete: pager.complete,
        expectedTotalRows,
        pageFingerprint: sha256(rowFingerprints),
        firstPageWatermark: sha256([expectedTotalRows, rowFingerprints]),
    }
}

function incompleteScan(
    reasonCode: string,
    pageCount: number,
    pageCap: number,
    dealerContextHash: string | null = null
): SoldReportScanResult {
    return {
        outcome: 'INCOMPLETE_SCAN',
        reasonCode,
        dealerContextHash,
        rows: [],
        pageCount,
        pageCap,
        scanAttemptCount: 1,
        firstPageWatermark: null,
    }
}

export function validateSoldReportScan(input: ScanValidationInput): SoldReportScanResult {
    const pageCap = input.pageCap ?? DEFAULT_PAGE_CAP
    if (input.visitedPages.length > pageCap) {
        return incompleteScan('PAGE_CAP_EXCEEDED', input.visitedPages.length, pageCap)
    }
    const incomplete = [...input.visitedPages, input.firstPageRecheck]
        .find((page) => page.outcome !== 'COMPLETE')
    if (incomplete) {
        return incompleteScan(
            incomplete.reasonCode || 'INCOMPLETE_PAGE',
            input.visitedPages.length,
            pageCap,
            incomplete.dealerContextHash
        )
    }
    if ([...input.visitedPages, input.firstPageRecheck].some((page) => !page.pagerComplete)) {
        return incompleteScan(
            'UNKNOWN_PAGER_TARGET',
            input.visitedPages.length,
            pageCap,
            input.visitedPages[0]?.dealerContextHash ?? null
        )
    }
    const dealerContextHashes = [...input.visitedPages, input.firstPageRecheck]
        .map((page) => page.dealerContextHash)
    const expectedDealerContextHash = dealerContextHashes[0]
    if (!expectedDealerContextHash || dealerContextHashes.some((hash) => hash !== expectedDealerContextHash)) {
        return incompleteScan(
            'DEALER_CONTEXT_CHANGED',
            input.visitedPages.length,
            pageCap,
            expectedDealerContextHash || null
        )
    }
    const pageNumbers = input.visitedPages.map((page) => page.currentPage)
    if (new Set(pageNumbers).size !== pageNumbers.length) {
        return incompleteScan('PAGINATION_CYCLE', input.visitedPages.length, pageCap, expectedDealerContextHash)
    }
    if (pageNumbers.some((pageNumber, index) => pageNumber !== index + 1)) {
        return incompleteScan(
            'PAGINATION_GAP',
            input.visitedPages.length,
            pageCap,
            expectedDealerContextHash
        )
    }
    const fingerprints = input.visitedPages.map((page) => page.pageFingerprint)
    if (new Set(fingerprints).size !== fingerprints.length) {
        return incompleteScan('DUPLICATE_PAGE', input.visitedPages.length, pageCap, expectedDealerContextHash)
    }
    const firstPage = input.visitedPages[0]
    if (!firstPage || firstPage.firstPageWatermark !== input.firstPageRecheck.firstPageWatermark) {
        return incompleteScan('FIRST_PAGE_WATERMARK_CHANGED', input.visitedPages.length, pageCap, expectedDealerContextHash)
    }
    const expectedTotals = [...input.visitedPages, input.firstPageRecheck]
        .map((page) => page.expectedTotalRows)
    const expectedTotalRows = expectedTotals[0]
    if (
        expectedTotalRows === null ||
        expectedTotals.some((total) => total !== expectedTotalRows)
    ) {
        return incompleteScan(
            'REPORT_TOTAL_CHANGED',
            input.visitedPages.length,
            pageCap,
            expectedDealerContextHash
        )
    }
    const rows = input.visitedPages.flatMap((page) => page.rows)
    if (rows.length !== expectedTotalRows) {
        return incompleteScan(
            'REPORT_ROW_COUNT_MISMATCH',
            input.visitedPages.length,
            pageCap,
            expectedDealerContextHash
        )
    }
    if (new Set(rows.map((row) => row.rowFingerprint)).size !== rows.length) {
        return incompleteScan(
            'DUPLICATE_REPORT_ROW',
            input.visitedPages.length,
            pageCap,
            expectedDealerContextHash
        )
    }
    return {
        outcome: 'COMPLETE',
        dealerContextHash: expectedDealerContextHash,
        rows,
        pageCount: input.visitedPages.length,
        pageCap,
        scanAttemptCount: 1,
        firstPageWatermark: firstPage.firstPageWatermark,
    }
}

function applyControls(html: string): SuccessfulControl[] {
    return collectSuccessfulControls(html, {
        activatedSubmitName: APPLY_CONTROL,
    })
}

function pagerControls(html: string, target: SoldReportPagerTarget): SuccessfulControl[] {
    return collectSuccessfulControls(html, {
        overrides: {
            __EVENTTARGET: target.eventTarget,
            __EVENTARGUMENT: target.eventArgument,
            [APPLY_CONTROL]: null,
        },
    })
}

async function applyFreshReportPage(
    transport: SoldReportTransport
): Promise<{ html: string; page: SoldReportPage }> {
    const freshHtml = await transport.freshGet()
    const freshSelection = dealerContext(cheerio.load(freshHtml))
    if (!freshSelection.context) {
        return {
            html: freshHtml,
            page: incompletePage(
                freshSelection.reasonCode || 'DEALER_CONTEXT_MISSING',
                null
            ),
        }
    }
    const html = await transport.post(applyControls(freshHtml))
    const page = parseSoldPackagesReportPage(html)
    if (page.dealerContextHash && page.dealerContextHash !== freshSelection.context.hash) {
        return {
            html,
            page: incompletePage('DEALER_CONTEXT_CHANGED', freshSelection.context.hash),
        }
    }
    return { html, page }
}

async function firstPageRecheck(
    transport: SoldReportTransport,
    currentHtml: string,
    currentPage: SoldReportPage
): Promise<SoldReportPage> {
    const firstTarget = currentPage.pagerTargets.find((target) => target.pageNumber === 1)
    if (currentPage.currentPage !== 1 && firstTarget) {
        return parseSoldPackagesReportPage(await transport.post(pagerControls(currentHtml, firstTarget)))
    }
    return (await applyFreshReportPage(transport)).page
}

async function scanOnce(
    transport: SoldReportTransport,
    pageCap: number
): Promise<SoldReportScanResult> {
    const initial = await applyFreshReportPage(transport)
    let currentHtml = initial.html
    let currentPage = initial.page
    const visitedPages: SoldReportPage[] = [currentPage]
    const visitedNumbers = new Set([currentPage.currentPage])

    while (currentPage.outcome === 'COMPLETE') {
        const nextTarget = currentPage.pagerTargets.find(
            (target) => target.pageNumber === currentPage.currentPage + 1
        )
        if (!nextTarget) break
        if (visitedPages.length >= pageCap) {
            return incompleteScan(
                'PAGE_CAP_EXCEEDED',
                visitedPages.length,
                pageCap,
                currentPage.dealerContextHash
            )
        }
        currentHtml = await transport.post(pagerControls(currentHtml, nextTarget))
        currentPage = parseSoldPackagesReportPage(currentHtml)
        visitedPages.push(currentPage)
        if (visitedNumbers.has(currentPage.currentPage)) break
        visitedNumbers.add(currentPage.currentPage)
    }

    const recheck = await firstPageRecheck(transport, currentHtml, currentPage)
    return validateSoldReportScan({ visitedPages, firstPageRecheck: recheck, pageCap })
}

export async function scanSoldPackagesReport(
    transport: SoldReportTransport,
    options: SoldReportScanOptions = {}
): Promise<SoldReportScanResult> {
    const pageCap = Math.max(1, Math.floor(options.pageCap ?? DEFAULT_PAGE_CAP))
    const scanAttempts = Math.max(1, Math.floor(options.scanAttempts ?? DEFAULT_SCAN_ATTEMPTS))
    let latestIncomplete: SoldReportScanResult | null = null
    for (let attempt = 1; attempt <= scanAttempts; attempt += 1) {
        try {
            const scan = await scanOnce(transport, pageCap)
            if (scan.outcome === 'COMPLETE') return { ...scan, scanAttemptCount: attempt }
            latestIncomplete = { ...scan, scanAttemptCount: attempt }
        } catch {
            latestIncomplete = {
                ...incompleteScan('REPORT_SCAN_FAILED', 0, pageCap),
                outcome: 'CHECK_FAILED',
                scanAttemptCount: attempt,
            }
        }
    }
    return latestIncomplete as SoldReportScanResult
}
