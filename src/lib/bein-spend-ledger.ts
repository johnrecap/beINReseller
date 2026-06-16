import { OperationType, Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

export type BeinSpendGroupBy = 'none' | 'day' | 'week' | 'month'

export interface BeinSpendReportFilters {
    from: Date
    to: Date
    groupBy: BeinSpendGroupBy
    beinAccountId?: string
    userId?: string
    operationType?: OperationType
    cardNumber?: string
    includeUnconfirmed: boolean
}

export interface BeinSpendLedgerDetailRow {
    ledgerId: string;
    operationId: string;
    chargedAt: Date;
    panelUserId: string;
    panelUsername: string | null;
    beinAccountId: string;
    beinUsernameSnapshot: string;
    beinLabelSnapshot: string | null;
    operationType: string;
    cardNumber: string;
    selectedPackageName: string | null;
    dealerBalanceBefore: number | null;
    dealerBalanceAfter: number | null;
    spendAmount: number;
    evidenceSource: string;
    operationStatusAtRecord: string;
}

export interface BeinSpendSummaryAccount {
    beinAccountId: string;
    beinUsernameSnapshot: string;
    beinLabelSnapshot: string | null;
    confirmedSpend: number;
    confirmedOperationCount: number;
    unconfirmedReviewCount: number;
    lastChargedAt: Date;
}

export interface BeinSpendSummary {
    range: {
        from: Date;
        to: Date;
        groupBy: BeinSpendGroupBy;
    };
    currency: string;
    totals: {
        confirmedSpend: number;
        confirmedOperationCount: number;
        unconfirmedReviewCount: number;
    };
    accounts: BeinSpendSummaryAccount[];
    buckets: Array<{
        bucketStart: Date;
        bucketEnd: Date;
        confirmedSpend: number;
        confirmedOperationCount: number;
    }>;
}

export interface BeinSpendOperationsResult {
    items: BeinSpendLedgerDetailRow[]
    page: number
    pageSize: number
    total: number
}

export function normalizeCardSearch(value: string | null | undefined): string | undefined {
    const normalized = value?.replace(/\D/g, '')
    return normalized || undefined
}

export function parseBeinSpendReportFilters(searchParams: URLSearchParams): BeinSpendReportFilters {
    const fromRaw = searchParams.get('from')
    const toRaw = searchParams.get('to')
    if (!fromRaw || !toRaw) {
        throw new Error('Missing required date range')
    }

    const from = new Date(fromRaw)
    const to = new Date(toRaw)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new Error('Invalid date range')
    }
    if (from > to) {
        throw new Error('Invalid date range: from must be before to')
    }

    const maxRangeMs = 366 * 24 * 60 * 60 * 1000
    if (to.getTime() - from.getTime() > maxRangeMs) {
        throw new Error('Invalid date range: maximum range is 366 days')
    }

    const groupByRaw = searchParams.get('groupBy') || 'none'
    const groupBy: BeinSpendGroupBy =
        groupByRaw === 'day' || groupByRaw === 'week' || groupByRaw === 'month' || groupByRaw === 'none'
            ? groupByRaw
            : 'none'

    const operationTypeRaw = searchParams.get('operationType') || undefined
    const operationType =
        operationTypeRaw && Object.values(OperationType).includes(operationTypeRaw as OperationType)
            ? operationTypeRaw as OperationType
            : undefined

    return {
        from,
        to,
        groupBy,
        beinAccountId: searchParams.get('beinAccountId') || undefined,
        userId: searchParams.get('userId') || undefined,
        operationType,
        cardNumber: normalizeCardSearch(searchParams.get('cardNumber')),
        includeUnconfirmed: searchParams.get('includeUnconfirmed') !== 'false',
    }
}

export function parsePagination(searchParams: URLSearchParams): { page: number; pageSize: number } {
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.max(1, Number.parseInt(searchParams.get('pageSize') || '50', 10))
    if (pageSize > 200) {
        throw new Error('pageSize exceeds maximum of 200')
    }
    return { page, pageSize }
}

export function buildBeinSpendLedgerWhere(filters: BeinSpendReportFilters): Prisma.BeinAccountSpendLedgerWhereInput {
    return {
        chargedAt: {
            gte: filters.from,
            lte: filters.to,
        },
        ...(filters.beinAccountId ? { beinAccountId: filters.beinAccountId } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.operationType ? { operationType: filters.operationType } : {}),
        ...(filters.cardNumber ? { cardNumberSnapshot: { contains: filters.cardNumber } } : {}),
        evidenceConfidence: { in: ['CONFIRMED', 'CONFIRMED_FINAL_PAY', 'CONTRACT_VERIFIED'] },
    }
}

export function buildBeinSpendReviewWhere(filters: BeinSpendReportFilters): Prisma.OperationWhereInput {
    return {
        status: 'REVIEW_REQUIRED',
        updatedAt: {
            gte: filters.from,
            lte: filters.to,
        },
        ...(filters.beinAccountId ? { beinAccountId: filters.beinAccountId } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.operationType ? { type: filters.operationType } : {}),
        ...(filters.cardNumber ? { cardNumber: { contains: filters.cardNumber } } : {}),
    }
}

function bucketStartFor(date: Date, groupBy: BeinSpendGroupBy): Date {
    const bucket = new Date(date)
    bucket.setUTCHours(0, 0, 0, 0)
    if (groupBy === 'week') {
        const day = bucket.getUTCDay()
        const offset = day === 0 ? 6 : day - 1
        bucket.setUTCDate(bucket.getUTCDate() - offset)
    }
    if (groupBy === 'month') {
        bucket.setUTCDate(1)
    }
    return bucket
}

function bucketEndFor(start: Date, groupBy: BeinSpendGroupBy, maxTo: Date): Date {
    const end = new Date(start)
    if (groupBy === 'day') end.setUTCDate(end.getUTCDate() + 1)
    if (groupBy === 'week') end.setUTCDate(end.getUTCDate() + 7)
    if (groupBy === 'month') end.setUTCMonth(end.getUTCMonth() + 1)
    end.setTime(end.getTime() - 1)
    return end > maxTo ? maxTo : end
}

function toDetailRow(row: Prisma.BeinAccountSpendLedgerGetPayload<{
    include: { user: { select: { username: true } } }
}>): BeinSpendLedgerDetailRow {
    return {
        ledgerId: row.id,
        operationId: row.operationId,
        chargedAt: row.chargedAt,
        panelUserId: row.userId,
        panelUsername: row.user?.username || null,
        beinAccountId: row.beinAccountId,
        beinUsernameSnapshot: row.beinUsernameSnapshot,
        beinLabelSnapshot: row.beinLabelSnapshot,
        operationType: row.operationType,
        operationStatusAtRecord: row.operationStatusAtRecord,
        cardNumber: row.cardNumberSnapshot,
        selectedPackageName: row.selectedPackageName,
        dealerBalanceBefore: row.dealerBalanceBefore,
        dealerBalanceAfter: row.dealerBalanceAfter,
        spendAmount: row.spendAmount,
        evidenceSource: row.evidenceSource,
    }
}

export async function getBeinSpendSummary(filters: BeinSpendReportFilters): Promise<BeinSpendSummary> {
    const where = buildBeinSpendLedgerWhere(filters)
    const [rows, reviewCount, reviewByAccount] = await Promise.all([
        prisma.beinAccountSpendLedger.findMany({
            where,
            orderBy: { chargedAt: 'asc' },
            select: {
                beinAccountId: true,
                beinUsernameSnapshot: true,
                beinLabelSnapshot: true,
                spendAmount: true,
                chargedAt: true,
            },
        }),
        filters.includeUnconfirmed ? prisma.operation.count({ where: buildBeinSpendReviewWhere(filters) }) : Promise.resolve(0),
        filters.includeUnconfirmed
            ? prisma.operation.groupBy({
                by: ['beinAccountId'],
                where: buildBeinSpendReviewWhere(filters),
                _count: true,
            })
            : Promise.resolve([]),
    ])

    const reviewCountByAccount = new Map<string, number>()
    for (const item of reviewByAccount) {
        if (item.beinAccountId) reviewCountByAccount.set(item.beinAccountId, item._count)
    }

    const accountsMap = new Map<string, BeinSpendSummaryAccount>()
    const bucketsMap = new Map<string, { bucketStart: Date; bucketEnd: Date; confirmedSpend: number; confirmedOperationCount: number }>()

    for (const row of rows) {
        const existing = accountsMap.get(row.beinAccountId)
        if (existing) {
            existing.confirmedSpend += row.spendAmount
            existing.confirmedOperationCount += 1
            if (row.chargedAt > existing.lastChargedAt) existing.lastChargedAt = row.chargedAt
        } else {
            accountsMap.set(row.beinAccountId, {
                beinAccountId: row.beinAccountId,
                beinUsernameSnapshot: row.beinUsernameSnapshot,
                beinLabelSnapshot: row.beinLabelSnapshot,
                confirmedSpend: row.spendAmount,
                confirmedOperationCount: 1,
                unconfirmedReviewCount: reviewCountByAccount.get(row.beinAccountId) || 0,
                lastChargedAt: row.chargedAt,
            })
        }

        if (filters.groupBy !== 'none') {
            const start = bucketStartFor(row.chargedAt, filters.groupBy)
            const key = start.toISOString()
            const existingBucket = bucketsMap.get(key)
            if (existingBucket) {
                existingBucket.confirmedSpend += row.spendAmount
                existingBucket.confirmedOperationCount += 1
            } else {
                bucketsMap.set(key, {
                    bucketStart: start,
                    bucketEnd: bucketEndFor(start, filters.groupBy, filters.to),
                    confirmedSpend: row.spendAmount,
                    confirmedOperationCount: 1,
                })
            }
        }
    }

    return {
        range: {
            from: filters.from,
            to: filters.to,
            groupBy: filters.groupBy,
        },
        currency: 'USD',
        totals: {
            confirmedSpend: rows.reduce((sum, row) => sum + row.spendAmount, 0),
            confirmedOperationCount: rows.length,
            unconfirmedReviewCount: reviewCount,
        },
        accounts: Array.from(accountsMap.values()).sort((a, b) => b.confirmedSpend - a.confirmedSpend),
        buckets: Array.from(bucketsMap.values()).sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime()),
    }
}

export async function getBeinSpendOperations(
    filters: BeinSpendReportFilters,
    pagination: { page: number; pageSize: number }
): Promise<BeinSpendOperationsResult> {
    const where = buildBeinSpendLedgerWhere(filters)
    const [items, total] = await Promise.all([
        prisma.beinAccountSpendLedger.findMany({
            where,
            include: {
                user: {
                    select: { username: true },
                },
            },
            orderBy: { chargedAt: 'desc' },
            skip: (pagination.page - 1) * pagination.pageSize,
            take: pagination.pageSize,
        }),
        prisma.beinAccountSpendLedger.count({ where }),
    ])

    return {
        items: items.map(toDetailRow),
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
    }
}
