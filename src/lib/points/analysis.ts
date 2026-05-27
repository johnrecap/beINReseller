import type { Prisma, Role } from '@prisma/client'
import { cairoDateInputToUtcIso, EGYPT_TIME_ZONE } from '@/lib/egypt-time'

export type PointAnalysisDirection = 'earn' | 'convert' | 'reverse' | 'legacy' | 'neutral'
export type PointAnalysisConversionState = 'available' | 'converted' | 'reversed' | 'pending' | 'cancelled' | 'legacy'

export type PointAnalysisSourceMeta = {
    label: string
    direction: PointAnalysisDirection
    conversionState: PointAnalysisConversionState
}

export type PointAnalysisSummary = {
    earnedPoints: number
    availablePoints: number
    convertedPoints: number
    convertedBalanceAmount: number
    reversedPoints: number
    pendingPoints: number
    cancelledPoints: number
    legacyPoints: number
    ownersCount: number
    ledgerEntriesCount: number
}

export type PointAnalysisOwner = {
    id: string
    username: string
    email: string | null
    role: Role | string
    isActive: boolean
    deleted: boolean
    balance?: number
}

export type PointAnalysisReference = {
    id: string
    label?: string | null
}

export type PointAnalysisOperationReference = PointAnalysisReference & {
    cardNumber?: string | null
    status?: string | null
}

export type PointAnalysisRedemptionReference = PointAnalysisReference & {
    pointsConverted: number
    balanceAmountUsd: number
    conversionPointsSnapshot: number
    conversionAmountUsdSnapshot: number
}

export type PointAnalysisTransactionReference = PointAnalysisReference & {
    amount: number
    balanceAfter: number
}

export type PointsAnalysisRow = {
    ledgerEntryId: string
    createdAt: string
    createdAtDisplay: string
    owner: PointAnalysisOwner
    sourceType: string
    sourceLabel: string
    status: string
    points: number
    direction: PointAnalysisDirection
    conversionState: PointAnalysisConversionState
    amountUsdSnapshot: number | null
    ratePerThousandSnapshot: number | null
    moneyValue: number | null
    operationRef: PointAnalysisOperationReference | null
    redemptionRef: PointAnalysisRedemptionReference | null
    transactionRef: PointAnalysisTransactionReference | null
    notes: string | null
}

export type PointAnalysisFilters = {
    page: number
    limit: number
    from: Date | null
    to: Date | null
    role: Role | null
    ownerSearch: string
    sourceType: string | null
    status: string | null
    conversionState: PointAnalysisConversionState | null
}

type SearchParamSource = URLSearchParams | Record<string, string | string[] | null | undefined>

type PointSummaryEntry = {
    ownerUserId: string
    sourceType: string
    status: string
    points: number
    pointCashRedemption?: { balanceAmountUsd: number } | null
}

export type PointAnalysisRowInput = {
    id: string
    ownerUserId: string
    ownerRoleAtTime: Role | string
    sourceType: string
    sourceId: string
    points: number
    status: string
    amountUsdSnapshot: number | null
    ratePerThousandSnapshot: number | null
    createdAt: Date
    notes: string | null
    owner: {
        id: string
        username: string
        email: string | null
        role: Role | string
        isActive: boolean
        deletedAt: Date | null
        balance?: number
    }
    operation?: {
        id: string
        cardNumber: string | null
        status: string | null
    } | null
    pointCashRedemption?: {
        id: string
        pointsConverted: number
        balanceAmountUsd: number
        conversionPointsSnapshot: number
        conversionAmountUsdSnapshot: number
        transaction?: {
            id: string
            amount: number
            balanceAfter: number
        } | null
    } | null
}

const LEGACY_SOURCE_TYPES = new Set([
    'CREDIT_REQUEST',
    'MANAGER_TOPUP',
    'REWARD_REDEMPTION',
    'ADMIN_RELEASE',
    'ADMIN_ADJUSTMENT',
])

const POINT_SOURCE_META: Record<string, PointAnalysisSourceMeta> = {
    OPERATION_SPEND: {
        label: 'Operation spend',
        direction: 'earn',
        conversionState: 'available',
    },
    EID_REWARD: {
        label: 'Eid reward',
        direction: 'earn',
        conversionState: 'available',
    },
    POINT_CASH_REDEMPTION: {
        label: 'Converted to balance',
        direction: 'convert',
        conversionState: 'converted',
    },
    POINT_REVERSAL: {
        label: 'Point reversal',
        direction: 'reverse',
        conversionState: 'reversed',
    },
    CREDIT_REQUEST: {
        label: 'Credit request points',
        direction: 'legacy',
        conversionState: 'legacy',
    },
    MANAGER_TOPUP: {
        label: 'Manager top-up points',
        direction: 'legacy',
        conversionState: 'legacy',
    },
    REWARD_REDEMPTION: {
        label: 'Reward redemption',
        direction: 'legacy',
        conversionState: 'legacy',
    },
    ADMIN_RELEASE: {
        label: 'Admin release',
        direction: 'legacy',
        conversionState: 'legacy',
    },
    ADMIN_ADJUSTMENT: {
        label: 'Admin/manual adjustment',
        direction: 'legacy',
        conversionState: 'legacy',
    },
}

const VALID_ROLES = new Set(['ADMIN', 'MANAGER', 'AGENT', 'USER'])
const VALID_STATUSES = new Set(['PENDING', 'AVAILABLE', 'REDEEMED', 'CANCELLED'])
const VALID_SOURCE_TYPES = new Set(Object.keys(POINT_SOURCE_META))
const VALID_CONVERSION_STATES = new Set<PointAnalysisConversionState>([
    'available',
    'converted',
    'reversed',
    'pending',
    'cancelled',
    'legacy',
])

function round(value: number): number {
    return Math.round(value * 10000) / 10000
}

function readParam(source: SearchParamSource, key: string): string | null {
    if (source instanceof URLSearchParams) return source.get(key)
    const value = source[key]
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

function parsePositiveInteger(value: string | null, fallback: number, max?: number): number {
    const parsed = Number.parseInt(value ?? '', 10)
    const bounded = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
    return max ? Math.min(bounded, max) : bounded
}

function parseDateBound(value: string | null, boundary: 'start' | 'end'): Date | null {
    if (!value) return null

    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
    const iso = dateOnly ? cairoDateInputToUtcIso(value, boundary) : value
    if (!iso) throw new Error(`Invalid ${boundary === 'start' ? 'from' : 'to'} date`)

    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid ${boundary === 'start' ? 'from' : 'to'} date`)
    }

    return date
}

export function getPointAnalysisSourceMeta(sourceType: string): PointAnalysisSourceMeta {
    return POINT_SOURCE_META[sourceType] ?? {
        label: 'Unknown source',
        direction: 'neutral',
        conversionState: 'legacy',
    }
}

export function getPointAnalysisConversionState(entry: {
    sourceType: string
    status: string
    points: number
}): PointAnalysisConversionState {
    if (entry.status === 'PENDING') return 'pending'
    if (entry.status === 'CANCELLED') return 'cancelled'
    if (entry.sourceType === 'POINT_CASH_REDEMPTION') return 'converted'
    if (entry.sourceType === 'POINT_REVERSAL') return 'reversed'
    if (LEGACY_SOURCE_TYPES.has(entry.sourceType)) return 'legacy'
    return 'available'
}

export function buildPointAnalysisSummary(entries: PointSummaryEntry[]): PointAnalysisSummary {
    let earnedPoints = 0
    let availablePoints = 0
    let convertedPoints = 0
    let reversedPoints = 0
    let legacyPoints = 0
    let pendingPoints = 0
    let cancelledPoints = 0
    let convertedBalanceAmount = 0
    const ownerIds = new Set<string>()

    for (const entry of entries) {
        ownerIds.add(entry.ownerUserId)

        if (entry.status === 'PENDING') {
            pendingPoints += Math.abs(entry.points)
            continue
        }

        if (entry.status === 'CANCELLED') {
            cancelledPoints += Math.abs(entry.points)
            continue
        }

        if ((entry.sourceType === 'OPERATION_SPEND' || entry.sourceType === 'EID_REWARD') && entry.points > 0) {
            earnedPoints += entry.points
            availablePoints += entry.points
            continue
        }

        if (entry.sourceType === 'POINT_CASH_REDEMPTION') {
            const points = Math.abs(entry.points)
            convertedPoints += points
            availablePoints -= points
            convertedBalanceAmount += entry.pointCashRedemption?.balanceAmountUsd ?? 0
            continue
        }

        if (entry.sourceType === 'POINT_REVERSAL') {
            const points = Math.abs(entry.points)
            reversedPoints += points
            availablePoints -= points
            continue
        }

        if (LEGACY_SOURCE_TYPES.has(entry.sourceType)) {
            legacyPoints += entry.points
        }
    }

    return {
        earnedPoints: round(earnedPoints),
        availablePoints: round(Math.max(0, availablePoints)),
        convertedPoints: round(convertedPoints),
        convertedBalanceAmount: round(convertedBalanceAmount),
        reversedPoints: round(reversedPoints),
        pendingPoints: round(pendingPoints),
        cancelledPoints: round(cancelledPoints),
        legacyPoints: round(legacyPoints),
        ownersCount: ownerIds.size,
        ledgerEntriesCount: entries.length,
    }
}

export function formatCairoDateTime(value: Date): string {
    return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone: EGYPT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    }).format(value)
}

export function mapPointAnalysisRow(entry: PointAnalysisRowInput): PointsAnalysisRow {
    const meta = getPointAnalysisSourceMeta(entry.sourceType)
    const redemption = entry.pointCashRedemption ?? null

    return {
        ledgerEntryId: entry.id,
        createdAt: entry.createdAt.toISOString(),
        createdAtDisplay: formatCairoDateTime(entry.createdAt),
        owner: {
            id: entry.owner.id,
            username: entry.owner.username,
            email: entry.owner.email,
            role: entry.owner.role,
            isActive: entry.owner.isActive,
            deleted: Boolean(entry.owner.deletedAt),
            ...(typeof entry.owner.balance === 'number' ? { balance: entry.owner.balance } : {}),
        },
        sourceType: entry.sourceType,
        sourceLabel: meta.label,
        status: entry.status,
        points: entry.points,
        direction: meta.direction,
        conversionState: getPointAnalysisConversionState(entry),
        amountUsdSnapshot: entry.amountUsdSnapshot,
        ratePerThousandSnapshot: entry.ratePerThousandSnapshot,
        moneyValue: redemption?.balanceAmountUsd ?? entry.amountUsdSnapshot,
        operationRef: entry.operation
            ? {
                id: entry.operation.id,
                cardNumber: entry.operation.cardNumber,
                status: entry.operation.status,
            }
            : null,
        redemptionRef: redemption
            ? {
                id: redemption.id,
                pointsConverted: redemption.pointsConverted,
                balanceAmountUsd: redemption.balanceAmountUsd,
                conversionPointsSnapshot: redemption.conversionPointsSnapshot,
                conversionAmountUsdSnapshot: redemption.conversionAmountUsdSnapshot,
            }
            : null,
        transactionRef: redemption?.transaction
            ? {
                id: redemption.transaction.id,
                amount: redemption.transaction.amount,
                balanceAfter: redemption.transaction.balanceAfter,
            }
            : null,
        notes: entry.notes,
    }
}

export function parsePointAnalysisFilters(source: SearchParamSource): PointAnalysisFilters {
    const role = readParam(source, 'role')
    const sourceType = readParam(source, 'sourceType')
    const status = readParam(source, 'status')
    const conversionState = readParam(source, 'conversionState')
    const ownerSearch = (readParam(source, 'ownerSearch') ?? '').trim().slice(0, 120)

    if (role && !VALID_ROLES.has(role)) throw new Error('Invalid role')
    if (sourceType && !VALID_SOURCE_TYPES.has(sourceType)) throw new Error('Invalid source type')
    if (status && !VALID_STATUSES.has(status)) throw new Error('Invalid status')
    if (conversionState && !VALID_CONVERSION_STATES.has(conversionState as PointAnalysisConversionState)) {
        throw new Error('Invalid conversion state')
    }

    const from = parseDateBound(readParam(source, 'from'), 'start')
    const to = parseDateBound(readParam(source, 'to'), 'end')
    if (from && to && from > to) throw new Error('Invalid date range')

    return {
        page: parsePositiveInteger(readParam(source, 'page'), 1),
        limit: parsePositiveInteger(readParam(source, 'limit'), 25, 100),
        from,
        to,
        role: role as Role | null,
        ownerSearch,
        sourceType,
        status,
        conversionState: conversionState as PointAnalysisConversionState | null,
    }
}

export function buildPointAnalysisWhere(filters: PointAnalysisFilters): Prisma.PointLedgerEntryWhereInput {
    const and: Prisma.PointLedgerEntryWhereInput[] = []

    if (filters.from || filters.to) {
        and.push({
            createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
            },
        })
    }

    if (filters.role) and.push({ owner: { role: filters.role } })
    if (filters.sourceType) and.push({ sourceType: filters.sourceType as never })
    if (filters.status) and.push({ status: filters.status as never })

    if (filters.ownerSearch) {
        and.push({
            owner: {
                OR: [
                    { username: { contains: filters.ownerSearch, mode: 'insensitive' } },
                    { email: { contains: filters.ownerSearch, mode: 'insensitive' } },
                ],
            },
        })
    }

    if (filters.conversionState) {
        and.push(buildConversionStateWhere(filters.conversionState))
    }

    return and.length ? { AND: and } : {}
}

function buildConversionStateWhere(state: PointAnalysisConversionState): Prisma.PointLedgerEntryWhereInput {
    if (state === 'pending') return { status: 'PENDING' }
    if (state === 'cancelled') return { status: 'CANCELLED' }
    if (state === 'converted') return { sourceType: 'POINT_CASH_REDEMPTION' }
    if (state === 'reversed') return { sourceType: 'POINT_REVERSAL' }
    if (state === 'legacy') return { sourceType: { in: Array.from(LEGACY_SOURCE_TYPES) as never[] } }

    return {
        status: 'AVAILABLE',
        sourceType: { in: ['OPERATION_SPEND', 'EID_REWARD'] as never[] },
    }
}
