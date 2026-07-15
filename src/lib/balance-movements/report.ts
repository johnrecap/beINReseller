import type { Prisma, Role } from '@prisma/client'
import {
    addDaysToCairoDateInput,
    cairoDateInputToUtcIso,
    currentCairoDateInput,
    startOfCairoMonthDateInput,
} from '@/lib/egypt-time'

export type BalanceMovementRange = 'today' | 'week' | 'month' | 'custom'
export type BalanceMovementOwnerType = 'ADMIN' | 'MANAGER' | 'AGENT'
export type BalanceMovementRecipientRole = 'ALL' | 'MANAGER' | 'USER'
export type BalanceMovementActorRole = 'ALL' | 'ADMIN' | 'MANAGER' | 'SYSTEM'

export type BalanceMovementReportFilters = {
    page: number
    limit: number
    range: BalanceMovementRange
    from: Date | null
    to: Date | null
    fromInput: string
    toInput: string
    recipientRole: BalanceMovementRecipientRole
    recipientId: string
    actorRole: BalanceMovementActorRole
    actorId: string
    ownerType: BalanceMovementOwnerType | ''
    ownerId: string
    userSearch: string
}

export type BalanceMovementSourceInput = {
    admin: { role: Role | string; username: string } | null
    creditRequest: { requestNumber: string } | null
    pointCashRedemption: { id: string } | null
    notes: string | null
}

export type BalanceMovementSource = {
    key:
        | 'ADMIN_TOP_UP'
        | 'MANAGER_TRANSFER'
        | 'CREDIT_REQUEST_APPROVAL'
        | 'POINT_CONVERSION'
        | 'INITIAL_BALANCE_CORRECTION'
        | 'LEGACY_DEPOSIT'
    label: string
}

export type BalanceMovementBucketKey =
    | 'ADMIN_TO_MANAGERS'
    | 'ADMIN_TO_USERS'
    | 'MANAGER_TO_USERS'
    | 'SYSTEM_INCREASES'
    | 'OTHER_DEPOSIT'

export type BalanceMovementBucket = {
    key: BalanceMovementBucketKey
    label: string
}

export const BALANCE_MOVEMENT_EXPORT_LIMIT = 2000

const VALID_RANGES = new Set<BalanceMovementRange>(['today', 'week', 'month', 'custom'])
const VALID_OWNER_TYPES = new Set<BalanceMovementOwnerType>(['ADMIN', 'MANAGER', 'AGENT'])
const VALID_RECIPIENT_ROLES = new Set<BalanceMovementRecipientRole>(['ALL', 'MANAGER', 'USER'])
const VALID_ACTOR_ROLES = new Set<BalanceMovementActorRole>(['ALL', 'ADMIN', 'MANAGER', 'SYSTEM'])
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

function normalizeId(value: string | null): string {
    return (value || '').trim()
}

export function normalizeMoney(value: number): number {
    return Math.round(value * 100) / 100
}

function parsePositiveInt(value: string | null, fallback: number, max = 100000): number {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback
    return Math.min(parsed, max)
}

function dateInputToUtcDate(value: string, boundary: 'start' | 'end'): Date {
    const iso = cairoDateInputToUtcIso(value, boundary)
    if (!iso) throw new Error('Invalid balance movement report date range')
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
    range: BalanceMovementRange,
    searchParams: URLSearchParams,
    now: Date
): { fromInput: string; toInput: string } {
    const today = currentCairoDateInput(now)

    if (range === 'custom') {
        const fromInput = normalizeId(searchParams.get('from'))
        const toInput = normalizeId(searchParams.get('to'))
        if (!fromInput || !toInput) {
            throw new Error('Missing required balance movement report date range')
        }
        return { fromInput, toInput }
    }

    if (range === 'week') {
        return {
            fromInput: addDaysToCairoDateInput(today, -getUtcDayFromDateInput(today)),
            toInput: today,
        }
    }

    if (range === 'today') {
        return { fromInput: today, toInput: today }
    }

    return { fromInput: startOfCairoMonthDateInput(today), toInput: today }
}

function parseRecipientRole(searchParams: URLSearchParams): BalanceMovementRecipientRole {
    const rawRecipientRole = (searchParams.get('recipientRole') || '').toUpperCase()
    if (VALID_RECIPIENT_ROLES.has(rawRecipientRole as BalanceMovementRecipientRole)) {
        return rawRecipientRole as BalanceMovementRecipientRole
    }

    const legacyReport = searchParams.get('report')
    if (legacyReport === 'manager') return 'MANAGER'
    if (legacyReport === 'user') return 'USER'
    return 'ALL'
}

function parseActorRole(searchParams: URLSearchParams): BalanceMovementActorRole {
    const rawActorRole = (searchParams.get('actorRole') || '').toUpperCase()
    if (VALID_ACTOR_ROLES.has(rawActorRole as BalanceMovementActorRole)) {
        return rawActorRole as BalanceMovementActorRole
    }
    return 'ALL'
}

function parseRecipientId(searchParams: URLSearchParams, recipientRole: BalanceMovementRecipientRole): string {
    const explicitRecipientId = normalizeId(searchParams.get('recipientId'))
    if (explicitRecipientId) return explicitRecipientId

    if (recipientRole === 'MANAGER') return normalizeId(searchParams.get('managerId'))
    if (recipientRole === 'USER') return normalizeId(searchParams.get('userId'))
    return ''
}

export function parseBalanceMovementReportFilters(
    searchParams: URLSearchParams,
    now = new Date()
): BalanceMovementReportFilters {
    const rawRange = searchParams.get('range')
    const rawOwnerType = searchParams.get('ownerType')
    const recipientRole = parseRecipientRole(searchParams)
    const actorRole = parseActorRole(searchParams)

    const range = VALID_RANGES.has(rawRange as BalanceMovementRange)
        ? rawRange as BalanceMovementRange
        : 'month'
    const ownerType = VALID_OWNER_TYPES.has(rawOwnerType as BalanceMovementOwnerType)
        ? rawOwnerType as BalanceMovementOwnerType
        : ''

    const { fromInput, toInput } = resolveRangeInputs(range, searchParams, now)
    const from = dateInputToUtcDate(fromInput, 'start')
    const to = dateInputToUtcDate(toInput, 'end')
    if (from.getTime() > to.getTime()) {
        throw new Error('Invalid balance movement report date range')
    }

    return {
        page: parsePositiveInt(searchParams.get('page'), 1),
        limit: parsePositiveInt(searchParams.get('limit'), DEFAULT_LIMIT, MAX_LIMIT),
        range,
        from,
        to,
        fromInput,
        toInput,
        recipientRole,
        recipientId: parseRecipientId(searchParams, recipientRole),
        actorRole,
        actorId: normalizeId(searchParams.get('actorId')),
        ownerType,
        ownerId: normalizeId(searchParams.get('ownerId')),
        userSearch: normalizeId(searchParams.get('userSearch')).slice(0, 120),
    }
}

function activeManagerOwnerWhere(ownerId?: string): Prisma.UserWhereInput {
    return {
        role: 'MANAGER',
        isActive: true,
        deletedAt: null,
        ...(ownerId ? { id: ownerId } : {}),
    }
}

function activeAdminOwnerWhere(ownerId?: string): Prisma.UserWhereInput {
    return {
        role: 'ADMIN',
        isActive: true,
        deletedAt: null,
        ...(ownerId ? { id: ownerId } : {}),
    }
}

function activeAgentOwnerWhere(ownerId?: string): Prisma.UserWhereInput {
    return {
        role: 'AGENT',
        isActive: true,
        deletedAt: null,
        agentProfile: { is: { isActive: true } },
        ...(ownerId ? { id: ownerId } : {}),
    }
}

function noCurrentOwnerWhere(): Prisma.UserWhereInput {
    return {
        managerLink: {
            none: {
                manager: {
                    role: { in: ['ADMIN', 'MANAGER'] },
                    isActive: true,
                    deletedAt: null,
                },
            },
        },
        agentAssignmentAsUser: {
            none: {
                isActive: true,
                agent: activeAgentOwnerWhere(),
            },
        },
    }
}

export function buildBalanceMovementOwnerUserWhere(
    ownerType: BalanceMovementOwnerType | '',
    ownerId = ''
): Prisma.UserWhereInput | null {
    if (ownerType === 'MANAGER') {
        return {
            managerLink: {
                some: {
                    managerId: ownerId || undefined,
                    manager: activeManagerOwnerWhere(ownerId || undefined),
                },
            },
        }
    }

    if (ownerType === 'AGENT') {
        return {
            agentAssignmentAsUser: {
                some: {
                    isActive: true,
                    agentId: ownerId || undefined,
                    agent: activeAgentOwnerWhere(ownerId || undefined),
                },
            },
        }
    }

    if (ownerType === 'ADMIN') {
        return {
            OR: [
                {
                    managerLink: {
                        some: {
                            managerId: ownerId || undefined,
                            manager: activeAdminOwnerWhere(ownerId || undefined),
                        },
                    },
                },
                {
                    createdById: ownerId || undefined,
                    createdBy: { is: activeAdminOwnerWhere(ownerId || undefined) },
                    ...noCurrentOwnerWhere(),
                },
            ],
        }
    }

    return null
}

function userSearchWhere(search: string): Prisma.UserWhereInput {
    return {
        OR: [
            { username: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
        ],
    }
}

export function buildBalanceMovementUserOptionWhere(
    filters: BalanceMovementReportFilters
): Prisma.UserWhereInput {
    const and: Prisma.UserWhereInput[] = [{ role: 'USER', deletedAt: null }]
    const ownerWhere = buildBalanceMovementOwnerUserWhere(filters.ownerType, filters.ownerId)
    if (ownerWhere) and.push(ownerWhere)
    if (filters.userSearch) and.push(userSearchWhere(filters.userSearch))
    if (filters.recipientRole === 'USER' && filters.recipientId) and.push({ id: filters.recipientId })
    return { AND: and }
}

function systemSourceWhere(): Prisma.TransactionWhereInput {
    return {
        OR: [
            { creditRequest: { isNot: null } },
            { pointCashRedemption: { isNot: null } },
            { admin: { is: null } },
            {
                AND: [
                    { notes: { contains: 'Initial Balance', mode: 'insensitive' } },
                    { NOT: { notes: { contains: 'Opening balance by admin', mode: 'insensitive' } } },
                    { NOT: { notes: { contains: 'Initial balance from manager', mode: 'insensitive' } } },
                ],
            },
        ],
    }
}

function notSystemSourceWhere(): Prisma.TransactionWhereInput {
    return { NOT: systemSourceWhere() }
}

function combineTransactionWhere(
    baseWhere: Prisma.TransactionWhereInput,
    extraWhere: Prisma.TransactionWhereInput
): Prisma.TransactionWhereInput {
    return { AND: [baseWhere, extraWhere] }
}

export function buildBalanceMovementReportWhere(
    filters: BalanceMovementReportFilters
): Prisma.TransactionWhereInput {
    const and: Prisma.TransactionWhereInput[] = [
        { type: 'DEPOSIT' },
        { amount: { gt: 0 } },
    ]

    if (filters.from || filters.to) {
        and.push({
            createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
            },
        })
    }

    if (filters.recipientRole === 'MANAGER') {
        and.push({ user: { role: 'MANAGER', deletedAt: null } })
    } else if (filters.recipientRole === 'USER') {
        and.push({ user: { role: 'USER', deletedAt: null } })
    } else {
        and.push({ user: { role: { in: ['MANAGER', 'USER'] }, deletedAt: null } })
    }

    if (filters.recipientId) and.push({ userId: filters.recipientId })

    if (filters.actorRole === 'ADMIN') {
        and.push({ admin: { is: { role: 'ADMIN', deletedAt: null } } })
        and.push(notSystemSourceWhere())
    } else if (filters.actorRole === 'MANAGER') {
        and.push({ admin: { is: { role: 'MANAGER', deletedAt: null } } })
        and.push(notSystemSourceWhere())
    } else if (filters.actorRole === 'SYSTEM') {
        and.push(systemSourceWhere())
    }

    if (filters.actorId && filters.actorRole !== 'SYSTEM') {
        and.push({ adminId: filters.actorId })
    }

    if (filters.recipientRole !== 'MANAGER') {
        const ownerWhere = buildBalanceMovementOwnerUserWhere(filters.ownerType, filters.ownerId)
        if (ownerWhere) and.push({ user: ownerWhere })
        if (filters.userSearch) and.push({ user: userSearchWhere(filters.userSearch) })
    }

    return { AND: and }
}

export function buildBalanceMovementSummaryWheres(
    baseWhere: Prisma.TransactionWhereInput
): {
    adminToManagers: Prisma.TransactionWhereInput
    adminToUsers: Prisma.TransactionWhereInput
    managerToUsers: Prisma.TransactionWhereInput
} {
    return {
        adminToManagers: combineTransactionWhere(baseWhere, {
            user: { role: 'MANAGER', deletedAt: null },
            admin: { is: { role: 'ADMIN', deletedAt: null } },
            ...notSystemSourceWhere(),
        }),
        adminToUsers: combineTransactionWhere(baseWhere, {
            user: { role: 'USER', deletedAt: null },
            admin: { is: { role: 'ADMIN', deletedAt: null } },
            ...notSystemSourceWhere(),
        }),
        managerToUsers: combineTransactionWhere(baseWhere, {
            user: { role: 'USER', deletedAt: null },
            admin: { is: { role: 'MANAGER', deletedAt: null } },
            ...notSystemSourceWhere(),
        }),
    }
}

function isInitialBalanceCorrectionNote(notes: string | null): boolean {
    const lowerNotes = (notes || '').toLowerCase()
    if (!lowerNotes.includes('initial balance')) return false
    return !lowerNotes.includes('opening balance by admin') && !lowerNotes.includes('initial balance from manager')
}

export function getBalanceMovementSource(input: BalanceMovementSourceInput): BalanceMovementSource {
    if (input.creditRequest) {
        return { key: 'CREDIT_REQUEST_APPROVAL', label: `Credit request ${input.creditRequest.requestNumber}` }
    }

    if (input.pointCashRedemption) {
        return { key: 'POINT_CONVERSION', label: 'Point conversion' }
    }

    if (isInitialBalanceCorrectionNote(input.notes)) {
        return { key: 'INITIAL_BALANCE_CORRECTION', label: 'Initial balance correction' }
    }

    if (input.admin?.role === 'ADMIN') {
        return { key: 'ADMIN_TOP_UP', label: `Admin top-up by ${input.admin.username}` }
    }

    if (input.admin?.role === 'MANAGER') {
        return { key: 'MANAGER_TRANSFER', label: `Manager transfer by ${input.admin.username}` }
    }

    return { key: 'LEGACY_DEPOSIT', label: 'Recorded deposit' }
}

export function getBalanceMovementBucket(input: {
    recipientRole: Role | string
    actorRole: Role | string | null
    sourceKey: BalanceMovementSource['key']
}): BalanceMovementBucket {
    if (
        input.sourceKey === 'CREDIT_REQUEST_APPROVAL'
        || input.sourceKey === 'POINT_CONVERSION'
        || input.sourceKey === 'INITIAL_BALANCE_CORRECTION'
        || input.sourceKey === 'LEGACY_DEPOSIT'
    ) {
        return { key: 'SYSTEM_INCREASES', label: 'System increase' }
    }

    if (input.actorRole === 'ADMIN' && input.recipientRole === 'MANAGER') {
        return { key: 'ADMIN_TO_MANAGERS', label: 'Admin to managers' }
    }

    if (input.actorRole === 'ADMIN' && input.recipientRole === 'USER') {
        return { key: 'ADMIN_TO_USERS', label: 'Admin to users' }
    }

    if (input.actorRole === 'MANAGER' && input.recipientRole === 'USER') {
        return { key: 'MANAGER_TO_USERS', label: 'Managers to users' }
    }

    return { key: 'OTHER_DEPOSIT', label: 'Other deposit' }
}
