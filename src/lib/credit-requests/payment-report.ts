import type { Prisma } from '@prisma/client'
import {
    addDaysToCairoDateInput,
    cairoDateInputToUtcIso,
    currentCairoDateInput,
    startOfCairoMonthDateInput,
    utcIsoToCairoDateInput,
} from '@/lib/egypt-time'

export type CreditDebtPaymentReportRange = 'today' | 'week' | 'month' | 'custom'

export type CreditDebtPaymentReportFilters = {
    page: number
    limit: number
    range: CreditDebtPaymentReportRange
    from: Date | null
    to: Date | null
    fromInput: string
    toInput: string
    userSearch: string
    recordedBySearch: string
}

export type CreditDebtPaymentSummaryInput = {
    userId: string
    recordedByUserId: string | null
    amountUsd: number
}

export type CreditDebtPaymentDailyInput = {
    createdAt: Date | string
    amountUsd: number
}

export type CreditDebtPaymentReportSummary = {
    totalPaidUsd: number
    paymentCount: number
    usersCount: number
    recordersCount: number
}

export type CreditDebtPaymentDailySummary = {
    date: string
    totalPaidUsd: number
    paymentCount: number
}

const VALID_RANGES = new Set<CreditDebtPaymentReportRange>(['today', 'week', 'month', 'custom'])
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 25

function normalizeMoney(value: number): number {
    return Math.round(value * 100) / 100
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback
    return Math.min(parsed, max)
}

function normalizeSearch(value: string | null): string {
    return (value || '').trim()
}

function dateInputToUtcDate(value: string, boundary: 'start' | 'end'): Date {
    const iso = cairoDateInputToUtcIso(value, boundary)
    if (!iso) throw new Error('Invalid payment report date range')

    return new Date(iso)
}

function getUtcDayFromDateInput(value: string): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return 0

    return new Date(Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12,
        0,
        0,
        0
    )).getUTCDay()
}

function resolveRangeInputs(
    range: CreditDebtPaymentReportRange,
    searchParams: URLSearchParams,
    now: Date
): { fromInput: string; toInput: string } {
    const today = currentCairoDateInput(now)

    if (range === 'custom') {
        const fromInput = normalizeSearch(searchParams.get('from'))
        const toInput = normalizeSearch(searchParams.get('to'))
        if (!fromInput || !toInput) {
            throw new Error('Missing required payment report date range')
        }

        return { fromInput, toInput }
    }

    if (range === 'week') {
        const startInput = addDaysToCairoDateInput(today, -getUtcDayFromDateInput(today))
        return { fromInput: startInput, toInput: today }
    }

    if (range === 'month') {
        return { fromInput: startOfCairoMonthDateInput(today), toInput: today }
    }

    return { fromInput: today, toInput: today }
}

export function parseCreditDebtPaymentReportFilters(
    searchParams: URLSearchParams,
    now = new Date()
): CreditDebtPaymentReportFilters {
    const rawRange = searchParams.get('range')
    const range = VALID_RANGES.has(rawRange as CreditDebtPaymentReportRange)
        ? rawRange as CreditDebtPaymentReportRange
        : 'today'
    const { fromInput, toInput } = resolveRangeInputs(range, searchParams, now)
    const from = dateInputToUtcDate(fromInput, 'start')
    const to = dateInputToUtcDate(toInput, 'end')

    if (from.getTime() > to.getTime()) {
        throw new Error('Invalid payment report date range')
    }

    return {
        page: parsePositiveInt(searchParams.get('page'), 1, 100000),
        limit: parsePositiveInt(searchParams.get('limit'), DEFAULT_LIMIT, MAX_LIMIT),
        range,
        from,
        to,
        fromInput,
        toInput,
        userSearch: normalizeSearch(searchParams.get('userSearch')),
        recordedBySearch: normalizeSearch(searchParams.get('recordedBySearch')),
    }
}

function userSearchClause(search: string): Prisma.CreditDebtLedgerEntryWhereInput {
    return {
        OR: [
            { user: { username: { contains: search, mode: 'insensitive' } } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
        ],
    }
}

function recordedBySearchClause(search: string): Prisma.CreditDebtLedgerEntryWhereInput {
    return {
        OR: [
            { recordedBy: { is: { username: { contains: search, mode: 'insensitive' } } } },
            { recordedBy: { is: { email: { contains: search, mode: 'insensitive' } } } },
        ],
    }
}

export function buildCreditDebtPaymentReportWhere(
    filters: CreditDebtPaymentReportFilters
): Prisma.CreditDebtLedgerEntryWhereInput {
    const where: Prisma.CreditDebtLedgerEntryWhereInput = {
        entryType: 'PAYMENT_RECORDED',
    }
    const createdAt: Prisma.DateTimeFilter = {}

    if (filters.from) createdAt.gte = filters.from
    if (filters.to) createdAt.lte = filters.to
    if (createdAt.gte || createdAt.lte) where.createdAt = createdAt

    const and: Prisma.CreditDebtLedgerEntryWhereInput[] = []
    if (filters.userSearch) and.push(userSearchClause(filters.userSearch))
    if (filters.recordedBySearch) and.push(recordedBySearchClause(filters.recordedBySearch))
    if (and.length > 0) where.AND = and

    return where
}

export function buildCreditDebtPaymentReportSummary(
    rows: CreditDebtPaymentSummaryInput[]
): CreditDebtPaymentReportSummary {
    const userIds = new Set<string>()
    const recorderIds = new Set<string>()
    let totalPaidUsd = 0

    for (const row of rows) {
        totalPaidUsd += row.amountUsd
        userIds.add(row.userId)
        if (row.recordedByUserId) recorderIds.add(row.recordedByUserId)
    }

    return {
        totalPaidUsd: normalizeMoney(totalPaidUsd),
        paymentCount: rows.length,
        usersCount: userIds.size,
        recordersCount: recorderIds.size,
    }
}

export function buildCreditDebtPaymentDailySummary(
    rows: CreditDebtPaymentDailyInput[]
): CreditDebtPaymentDailySummary[] {
    const byDate = new Map<string, CreditDebtPaymentDailySummary>()

    for (const row of rows) {
        const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
        const date = utcIsoToCairoDateInput(createdAt.toISOString())
        const current = byDate.get(date) || { date, totalPaidUsd: 0, paymentCount: 0 }
        current.totalPaidUsd = normalizeMoney(current.totalPaidUsd + row.amountUsd)
        current.paymentCount += 1
        byDate.set(date, current)
    }

    return Array.from(byDate.values()).sort((left, right) => right.date.localeCompare(left.date))
}

