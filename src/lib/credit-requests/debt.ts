import { Prisma } from '@prisma/client'

export type CreditDebtLedgerEntryType = 'CREDIT_APPROVED' | 'PAYMENT_RECORDED'

export type CreditDebtLedgerEntryLike = {
    entryType: CreditDebtLedgerEntryType
    amountUsd: number
}

export type CreditDebtPendingRequestLike = {
    amountUsd: number
}

export type CreditDebtSummaryInput = {
    creditDebtLimitUsd?: number | null
    pendingRequests?: CreditDebtPendingRequestLike[]
    ledgerEntries?: CreditDebtLedgerEntryLike[]
}

export type CreditDebtSummary = {
    creditDebtLimitUsd: number
    pendingRequestedUsd: number
    outstandingDebtUsd: number
    usedCapacityUsd: number
    availableUsd: number
    hasLimit: boolean
}

export type CreditCapacityValidation =
    | { allowed: true }
    | {
        allowed: false
        reason: 'CREDIT_LIMIT_NOT_CONFIGURED' | 'CREDIT_LIMIT_EXCEEDED'
        availableUsd: number
    }

export type CreditPaymentValidation =
    | { allowed: true; debtAfterUsd: number }
    | {
        allowed: false
        reason: 'INVALID_PAYMENT_AMOUNT' | 'PAYMENT_EXCEEDS_DEBT'
        debtAfterUsd: number
    }

type CreditDebtReadClient = Pick<Prisma.TransactionClient, 'user' | 'creditRequest' | 'creditDebtLedgerEntry'>
type CreditDebtDbClient = CreditDebtReadClient & Pick<Prisma.TransactionClient, '$queryRaw'>

const CENTS_PER_USD = 100

function toCents(value: number | null | undefined): number {
    if (!Number.isFinite(value ?? NaN)) return 0
    return Math.round(Number(value) * CENTS_PER_USD)
}

function fromCents(value: number): number {
    return Math.round(value) / CENTS_PER_USD
}

function sumCents(values: Array<number | null | undefined>): number {
    return values.reduce<number>((total, value) => total + toCents(value), 0)
}

export function normalizeMoney(value: number | null | undefined): number {
    return fromCents(Math.max(0, toCents(value)))
}

export function summarizeCreditDebt(input: CreditDebtSummaryInput): CreditDebtSummary {
    const limitCents = Math.max(0, toCents(input.creditDebtLimitUsd))
    const pendingRequestedCents = sumCents((input.pendingRequests || []).map((request) => request.amountUsd))
    const approvedCents = sumCents(
        (input.ledgerEntries || [])
            .filter((entry) => entry.entryType === 'CREDIT_APPROVED')
            .map((entry) => entry.amountUsd)
    )
    const paidCents = sumCents(
        (input.ledgerEntries || [])
            .filter((entry) => entry.entryType === 'PAYMENT_RECORDED')
            .map((entry) => entry.amountUsd)
    )
    const outstandingDebtCents = Math.max(0, approvedCents - paidCents)
    const usedCapacityCents = outstandingDebtCents + pendingRequestedCents
    const availableCents = Math.max(0, limitCents - usedCapacityCents)

    return {
        creditDebtLimitUsd: fromCents(limitCents),
        pendingRequestedUsd: fromCents(pendingRequestedCents),
        outstandingDebtUsd: fromCents(outstandingDebtCents),
        usedCapacityUsd: fromCents(usedCapacityCents),
        availableUsd: fromCents(availableCents),
        hasLimit: limitCents > 0,
    }
}

export function validateCreditRequestCapacity(
    summary: CreditDebtSummary,
    requestedAmountUsd: number
): CreditCapacityValidation {
    if (!summary.hasLimit) {
        return {
            allowed: false,
            reason: 'CREDIT_LIMIT_NOT_CONFIGURED',
            availableUsd: 0,
        }
    }

    if (toCents(requestedAmountUsd) > toCents(summary.availableUsd)) {
        return {
            allowed: false,
            reason: 'CREDIT_LIMIT_EXCEEDED',
            availableUsd: summary.availableUsd,
        }
    }

    return { allowed: true }
}

export function canApproveReservedCredit(summary: CreditDebtSummary): CreditCapacityValidation {
    if (!summary.hasLimit) {
        return {
            allowed: false,
            reason: 'CREDIT_LIMIT_NOT_CONFIGURED',
            availableUsd: 0,
        }
    }

    if (toCents(summary.usedCapacityUsd) > toCents(summary.creditDebtLimitUsd)) {
        return {
            allowed: false,
            reason: 'CREDIT_LIMIT_EXCEEDED',
            availableUsd: summary.availableUsd,
        }
    }

    return { allowed: true }
}

export function calculateDebtAfterPayment(
    summary: CreditDebtSummary,
    paymentAmountUsd: number
): CreditPaymentValidation {
    const paymentCents = toCents(paymentAmountUsd)
    const outstandingCents = toCents(summary.outstandingDebtUsd)

    if (paymentCents <= 0) {
        return {
            allowed: false,
            reason: 'INVALID_PAYMENT_AMOUNT',
            debtAfterUsd: summary.outstandingDebtUsd,
        }
    }

    if (paymentCents > outstandingCents) {
        return {
            allowed: false,
            reason: 'PAYMENT_EXCEEDS_DEBT',
            debtAfterUsd: summary.outstandingDebtUsd,
        }
    }

    return {
        allowed: true,
        debtAfterUsd: fromCents(outstandingCents - paymentCents),
    }
}

export async function lockCreditDebtUser(
    db: Pick<Prisma.TransactionClient, '$queryRaw'>,
    userId: string
) {
    await db.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`
}

export async function getCreditDebtSummary(
    db: CreditDebtDbClient,
    userId: string
): Promise<CreditDebtSummary> {
    const [user, pendingRequests, ledgerEntries] = await Promise.all([
        db.user.findUnique({
            where: { id: userId },
            select: { creditDebtLimitUsd: true },
        }),
        db.creditRequest.findMany({
            where: { userId, status: 'PENDING' },
            select: { amountUsd: true },
        }),
        db.creditDebtLedgerEntry.findMany({
            where: { userId },
            select: {
                entryType: true,
                amountUsd: true,
            },
        }),
    ])

    return summarizeCreditDebt({
        creditDebtLimitUsd: user?.creditDebtLimitUsd ?? 0,
        pendingRequests,
        ledgerEntries,
    })
}

export async function getCreditDebtSummaryMap(
    db: CreditDebtReadClient,
    userIds: string[]
): Promise<Map<string, CreditDebtSummary>> {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
    const result = new Map<string, CreditDebtSummary>()
    if (uniqueUserIds.length === 0) return result

    const [users, pendingRequests, ledgerEntries] = await Promise.all([
        db.user.findMany({
            where: { id: { in: uniqueUserIds } },
            select: { id: true, creditDebtLimitUsd: true },
        }),
        db.creditRequest.findMany({
            where: { userId: { in: uniqueUserIds }, status: 'PENDING' },
            select: { userId: true, amountUsd: true },
        }),
        db.creditDebtLedgerEntry.findMany({
            where: { userId: { in: uniqueUserIds } },
            select: {
                userId: true,
                entryType: true,
                amountUsd: true,
            },
        }),
    ])

    const limitByUser = new Map(users.map((user) => [user.id, user.creditDebtLimitUsd]))
    const pendingByUser = new Map<string, CreditDebtPendingRequestLike[]>()
    const ledgerByUser = new Map<string, CreditDebtLedgerEntryLike[]>()

    for (const request of pendingRequests) {
        const list = pendingByUser.get(request.userId) || []
        list.push({ amountUsd: request.amountUsd })
        pendingByUser.set(request.userId, list)
    }

    for (const entry of ledgerEntries) {
        const list = ledgerByUser.get(entry.userId) || []
        list.push({ entryType: entry.entryType, amountUsd: entry.amountUsd })
        ledgerByUser.set(entry.userId, list)
    }

    for (const userId of uniqueUserIds) {
        result.set(userId, summarizeCreditDebt({
            creditDebtLimitUsd: limitByUser.get(userId) ?? 0,
            pendingRequests: pendingByUser.get(userId) || [],
            ledgerEntries: ledgerByUser.get(userId) || [],
        }))
    }

    return result
}
