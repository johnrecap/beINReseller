import type { CardLifecycleReservation, Prisma } from '@prisma/client'

export type CardReservationOperationStatus =
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETING'
    | 'REVIEW_REQUIRED'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'

export type CardLifecycleReservationDisposition =
    | { action: 'HOLD'; reason: 'UNRESOLVED_REVIEW' | 'UNSAFE_OR_ACTIVE' }
    | { action: 'RELEASE'; reason: 'MANUAL_REVIEW_RESOLVED' | 'SAFE_TERMINAL' }

const TERMINAL_STATUSES = new Set<CardReservationOperationStatus>([
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
])

export function resolveCardLifecycleReservationDisposition(input: {
    operationStatus: CardReservationOperationStatus
    terminalResolutionSafe: boolean
    manualReviewResolutionId: string | null
}): CardLifecycleReservationDisposition {
    if (
        input.operationStatus === 'REVIEW_REQUIRED' &&
        input.manualReviewResolutionId?.trim()
    ) {
        return { action: 'RELEASE', reason: 'MANUAL_REVIEW_RESOLVED' }
    }

    if (input.operationStatus === 'REVIEW_REQUIRED') {
        return { action: 'HOLD', reason: 'UNRESOLVED_REVIEW' }
    }

    if (input.terminalResolutionSafe && TERMINAL_STATUSES.has(input.operationStatus)) {
        return { action: 'RELEASE', reason: 'SAFE_TERMINAL' }
    }

    return { action: 'HOLD', reason: 'UNSAFE_OR_ACTIVE' }
}

export type CardLifecycleReservationDb = Pick<
    Prisma.TransactionClient,
    'cardLifecycleReservation' | '$queryRaw'
>

export type AcquireCardLifecycleReservationResult =
    | {
        status: 'ACQUIRED' | 'ALREADY_HELD'
        reservation: CardLifecycleReservation
      }
    | {
        status: 'CARD_ALREADY_RESERVED' | 'OPERATION_ALREADY_RESERVED'
        conflictOperationId: string
      }

function normalizeCardNumber(cardNumber: string): string {
    const normalized = cardNumber.replace(/\s+/g, '')
    if (!normalized || normalized.length > 64 || !/^\d+$/.test(normalized)) {
        throw new Error('INVALID_CARD_NUMBER')
    }
    return normalized
}

function isUniqueConstraintError(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002'
}

async function lockCardReservationKeys(
    db: CardLifecycleReservationDb,
    operationId: string,
    cardNumber: string
): Promise<void> {
    for (const key of [`card-reservation:operation:${operationId}`, `card-reservation:card:${cardNumber}`]) {
        await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`
    }
}

async function findActiveCardConflict(
    db: CardLifecycleReservationDb,
    cardNumber: string
): Promise<CardLifecycleReservation | null> {
    return db.cardLifecycleReservation.findFirst({
        where: { cardNumber, releasedAt: null },
        orderBy: { acquiredAt: 'asc' },
    })
}

/**
 * Claim the normalized card lifecycle before starting provider work.
 * The migration's partial unique index is the final concurrency boundary;
 * this helper converts a uniqueness race into an explicit safe outcome.
 */
export async function acquireCardLifecycleReservation(
    db: CardLifecycleReservationDb,
    input: {
        operationId: string
        cardNumber: string
        now?: Date
    }
): Promise<AcquireCardLifecycleReservationResult> {
    const cardNumber = normalizeCardNumber(input.cardNumber)
    const now = input.now ?? new Date()
    await lockCardReservationKeys(db, input.operationId, cardNumber)
    const existing = await db.cardLifecycleReservation.findUnique({
        where: { operationId: input.operationId },
    })

    if (existing?.releasedAt === null) {
        if (existing.cardNumber !== cardNumber) {
            return {
                status: 'OPERATION_ALREADY_RESERVED',
                conflictOperationId: existing.operationId,
            }
        }
        const renewed = await db.cardLifecycleReservation.update({
            where: { operationId: input.operationId },
            data: { renewedAt: now },
        })
        return { status: 'ALREADY_HELD', reservation: renewed }
    }

    const conflictBeforeWrite = await findActiveCardConflict(db, cardNumber)
    if (conflictBeforeWrite) {
        return {
            status: 'CARD_ALREADY_RESERVED',
            conflictOperationId: conflictBeforeWrite.operationId,
        }
    }

    try {
        if (existing) {
            const reopened = await db.cardLifecycleReservation.update({
                where: { operationId: input.operationId },
                data: {
                    cardNumber,
                    acquiredAt: now,
                    renewedAt: now,
                    releasedAt: null,
                    releaseReason: null,
                },
            })
            return { status: 'ACQUIRED', reservation: reopened }
        }

        const created = await db.cardLifecycleReservation.create({
            data: {
                operationId: input.operationId,
                cardNumber,
                acquiredAt: now,
                renewedAt: now,
            },
        })
        return { status: 'ACQUIRED', reservation: created }
    } catch (error) {
        if (!isUniqueConstraintError(error)) throw error
        throw new Error('CARD_LIFECYCLE_RESERVATION_CONFLICT', { cause: error })
    }
}

export async function assertActiveCardLifecycleReservation(
    db: CardLifecycleReservationDb,
    input: { operationId: string; cardNumber: string }
): Promise<boolean> {
    const cardNumber = normalizeCardNumber(input.cardNumber)
    return !!await db.cardLifecycleReservation.findFirst({
        where: {
            operationId: input.operationId,
            cardNumber,
            releasedAt: null,
        },
        select: { id: true },
    })
}

export async function renewCardLifecycleReservation(
    db: CardLifecycleReservationDb,
    input: { operationId: string; cardNumber: string; now?: Date }
): Promise<boolean> {
    const cardNumber = normalizeCardNumber(input.cardNumber)
    const result = await db.cardLifecycleReservation.updateMany({
        where: {
            operationId: input.operationId,
            cardNumber,
            releasedAt: null,
        },
        data: { renewedAt: input.now ?? new Date() },
    })
    return result.count === 1
}

export async function releaseCardLifecycleReservation(
    db: CardLifecycleReservationDb,
    input: {
        operationId: string
        disposition: CardLifecycleReservationDisposition
        resolutionId?: string | null
        now?: Date
    }
): Promise<boolean> {
    if (input.disposition.action !== 'RELEASE') return false

    const resolutionId = input.resolutionId?.trim()
    if (
        input.disposition.reason === 'MANUAL_REVIEW_RESOLVED' &&
        !resolutionId
    ) {
        return false
    }
    const releaseReason = resolutionId
        ? `${input.disposition.reason}:${resolutionId}`.slice(0, 500)
        : input.disposition.reason
    const result = await db.cardLifecycleReservation.updateMany({
        where: { operationId: input.operationId, releasedAt: null },
        data: {
            releasedAt: input.now ?? new Date(),
            releaseReason,
        },
    })
    return result.count === 1
}
