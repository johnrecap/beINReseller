import type { Prisma, ProviderAccountCausalReservation } from '@prisma/client'

const ENDED_OPERATION_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'] as const

// Called inside the caller's transaction. Serialize with completion/cancellation
// before touching the reservation, so a queued continuation cannot reopen it.
async function lockOperationForReservation(db: ProviderAccountReservationDb, operationId: string): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ status: string; administrative_stop_requested_at: Date | null }>>`SELECT "status", "administrative_stop_requested_at" FROM "operations" WHERE "id" = ${operationId} FOR UPDATE`
    return rows.length === 1 && !rows[0].administrative_stop_requested_at && !ENDED_OPERATION_STATUSES.some(status => status === rows[0].status)
}

export type ProviderAccountConsumer =
    | 'RENEWAL'
    | 'INSTALLMENT'
    | 'SIGNAL'
    | 'BALANCE'
    | 'REPORT'
    | 'KEEPALIVE'
    | 'POOL_SELECTION'

export type ProviderAccountConsumerDecision =
    | { allowed: true; reason: 'UNRESERVED' | 'EXACT_OWNER' }
    | { allowed: false; reason: 'ACCOUNT_CAUSALLY_RESERVED' | 'EXECUTION_LEASE_REQUIRED' }

export function isProviderAccountAutomationEligible(account: {
    isActive: boolean
    automationExclusive: boolean
}): boolean {
    return account.isActive === true && account.automationExclusive === true
}

export function decideProviderAccountConsumerAccess(input: {
    consumer: ProviderAccountConsumer
    activeReservation: {
        operationId: string
        reservationGeneration: number
    } | null
    requester: {
        operationId: string
        reservationGeneration: number
        exactExecutionLease: boolean
    } | null
}): ProviderAccountConsumerDecision {
    if (!input.activeReservation) {
        return { allowed: true, reason: 'UNRESERVED' }
    }

    if (
        input.requester?.operationId === input.activeReservation.operationId &&
        input.requester.reservationGeneration === input.activeReservation.reservationGeneration
    ) {
        return input.requester.exactExecutionLease
            ? { allowed: true, reason: 'EXACT_OWNER' }
            : { allowed: false, reason: 'EXECUTION_LEASE_REQUIRED' }
    }

    return { allowed: false, reason: 'ACCOUNT_CAUSALLY_RESERVED' }
}

export type ProviderAccountReservationDb = Pick<
    Prisma.TransactionClient,
    'providerAccountCausalReservation' | '$queryRaw'
>

export type AcquireProviderAccountReservationResult =
    | {
        status: 'ACQUIRED' | 'ALREADY_HELD'
        reservation: ProviderAccountCausalReservation
      }
    | {
        status: 'ACCOUNT_ALREADY_RESERVED' | 'OPERATION_ALREADY_RESERVED' | 'OPERATION_ENDED_OR_MISSING'
        conflictOperationId: string
      }

export type TransferProviderAccountReservationResult =
    | { status: 'TRANSFERRED'; reservation: ProviderAccountCausalReservation }
    | { status: 'STALE_OWNER' | 'TARGET_ALREADY_RESERVED'; conflictOperationId?: string }

export type ProviderAccountReservationReleaseAuthority =
    | { kind: 'SAFE_TERMINAL'; reasonCode: string }
    | { kind: 'MANUAL_REVIEW_RESOLVED'; resolutionId: string }
    | { kind: 'AUDITED_QUARANTINE_TRANSFER'; auditId: string }

function isUniqueConstraintError(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002'
}

async function lockProviderReservationKeys(
    db: ProviderAccountReservationDb,
    operationId: string,
    accountIds: string[]
): Promise<void> {
    const keys = [
        `provider-reservation:operation:${operationId}`,
        ...[...new Set(accountIds)]
            .sort()
            .map((accountId) => `provider-reservation:account:${accountId}`),
    ]
    for (const key of keys) {
        await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`
    }
}

function assertReservationIdentity(input: {
    operationId: string
    beinAccountId: string
    reservationGeneration?: number
}): void {
    if (!input.operationId.trim() || !input.beinAccountId.trim()) {
        throw new Error('INVALID_PROVIDER_ACCOUNT_RESERVATION_IDENTITY')
    }
    if (
        input.reservationGeneration !== undefined &&
        (!Number.isSafeInteger(input.reservationGeneration) || input.reservationGeneration <= 0)
    ) {
        throw new Error('INVALID_PROVIDER_ACCOUNT_RESERVATION_GENERATION')
    }
}

function assertAutomaticWindow(automaticWindowEndsAt: Date, now: Date): void {
    if (
        !Number.isFinite(automaticWindowEndsAt.getTime()) ||
        automaticWindowEndsAt.getTime() <= now.getTime()
    ) {
        throw new Error('INVALID_PROVIDER_ACCOUNT_AUTOMATIC_WINDOW')
    }
}

export async function findActiveProviderAccountReservationForAccount(
    db: ProviderAccountReservationDb,
    beinAccountId: string
): Promise<ProviderAccountCausalReservation | null> {
    if (!beinAccountId.trim()) return null
    return db.providerAccountCausalReservation.findFirst({
        where: { beinAccountId, releasedAt: null },
        orderBy: { acquiredAt: 'asc' },
    })
}

export async function findActiveProviderAccountReservationForOperation(
    db: ProviderAccountReservationDb,
    operationId: string
): Promise<ProviderAccountCausalReservation | null> {
    if (!operationId.trim()) return null
    return db.providerAccountCausalReservation.findFirst({
        where: { operationId, releasedAt: null },
    })
}

/**
 * Claim an account across baseline capture, provider mutation, delayed checks,
 * and unresolved review. Expiry of the short Redis lease never releases this row.
 */
export async function acquireProviderAccountCausalReservation(
    db: ProviderAccountReservationDb,
    input: {
        operationId: string
        beinAccountId: string
        automaticWindowEndsAt: Date
        now?: Date
    }
): Promise<AcquireProviderAccountReservationResult> {
    assertReservationIdentity(input)
    const now = input.now ?? new Date()
    assertAutomaticWindow(input.automaticWindowEndsAt, now)
    if (!await lockOperationForReservation(db, input.operationId)) {
        return { status: 'OPERATION_ENDED_OR_MISSING', conflictOperationId: input.operationId }
    }
    await lockProviderReservationKeys(db, input.operationId, [input.beinAccountId])
    const existing = await db.providerAccountCausalReservation.findUnique({
        where: { operationId: input.operationId },
    })

    if (existing?.releasedAt === null) {
        if (existing.beinAccountId !== input.beinAccountId) {
            return {
                status: 'OPERATION_ALREADY_RESERVED',
                conflictOperationId: existing.operationId,
            }
        }
        const renewed = await db.providerAccountCausalReservation.update({
            where: { operationId: input.operationId },
            data: {
                renewedAt: now,
                automaticWindowEndsAt: input.automaticWindowEndsAt,
            },
        })
        return { status: 'ALREADY_HELD', reservation: renewed }
    }

    const conflictBeforeWrite = await findActiveProviderAccountReservationForAccount(
        db,
        input.beinAccountId
    )
    if (conflictBeforeWrite) {
        return {
            status: 'ACCOUNT_ALREADY_RESERVED',
            conflictOperationId: conflictBeforeWrite.operationId,
        }
    }

    try {
        if (existing) {
            const reopened = await db.providerAccountCausalReservation.update({
                where: { operationId: input.operationId },
                data: {
                    beinAccountId: input.beinAccountId,
                    reservationGeneration: { increment: 1 },
                    acquiredAt: now,
                    renewedAt: now,
                    automaticWindowEndsAt: input.automaticWindowEndsAt,
                    releasedAt: null,
                    releaseReason: null,
                },
            })
            return { status: 'ACQUIRED', reservation: reopened }
        }

        const created = await db.providerAccountCausalReservation.create({
            data: {
                operationId: input.operationId,
                beinAccountId: input.beinAccountId,
                reservationGeneration: 1,
                acquiredAt: now,
                renewedAt: now,
                automaticWindowEndsAt: input.automaticWindowEndsAt,
            },
        })
        return { status: 'ACQUIRED', reservation: created }
    } catch (error) {
        if (!isUniqueConstraintError(error)) throw error
        throw new Error('PROVIDER_ACCOUNT_RESERVATION_CONFLICT', { cause: error })
    }
}

export async function assertActiveProviderAccountReservation(
    db: ProviderAccountReservationDb,
    input: {
        operationId: string
        beinAccountId: string
        reservationGeneration: number
    }
): Promise<boolean> {
    assertReservationIdentity(input)
    return !!await db.providerAccountCausalReservation.findFirst({
        where: {
            operationId: input.operationId,
            beinAccountId: input.beinAccountId,
            reservationGeneration: input.reservationGeneration,
            releasedAt: null,
            operation: { status: { notIn: [...ENDED_OPERATION_STATUSES] } },
        },
        select: { id: true },
    })
}

export async function renewProviderAccountCausalReservation(
    db: ProviderAccountReservationDb,
    input: {
        operationId: string
        beinAccountId: string
        reservationGeneration: number
        automaticWindowEndsAt?: Date
        now?: Date
    }
): Promise<boolean> {
    assertReservationIdentity(input)
    const now = input.now ?? new Date()
    if (input.automaticWindowEndsAt) {
        assertAutomaticWindow(input.automaticWindowEndsAt, now)
    }
    const result = await db.providerAccountCausalReservation.updateMany({
        where: {
            operationId: input.operationId,
            beinAccountId: input.beinAccountId,
            reservationGeneration: input.reservationGeneration,
            releasedAt: null,
            operation: { status: { notIn: [...ENDED_OPERATION_STATUSES] } },
        },
        data: {
            renewedAt: now,
            ...(input.automaticWindowEndsAt
                ? { automaticWindowEndsAt: input.automaticWindowEndsAt }
                : {}),
        },
    })
    return result.count === 1
}

export async function transferProviderAccountCausalReservation(
    db: ProviderAccountReservationDb,
    input: {
        operationId: string
        fromBeinAccountId: string
        toBeinAccountId: string
        reservationGeneration: number
        automaticWindowEndsAt: Date
        now?: Date
    }
): Promise<TransferProviderAccountReservationResult> {
    assertReservationIdentity({
        operationId: input.operationId,
        beinAccountId: input.fromBeinAccountId,
        reservationGeneration: input.reservationGeneration,
    })
    if (!input.toBeinAccountId.trim() || input.toBeinAccountId === input.fromBeinAccountId) {
        return { status: 'STALE_OWNER' }
    }
    const now = input.now ?? new Date()
    assertAutomaticWindow(input.automaticWindowEndsAt, now)
    if (!await lockOperationForReservation(db, input.operationId)) return { status: 'STALE_OWNER' }
    await lockProviderReservationKeys(db, input.operationId, [
        input.fromBeinAccountId,
        input.toBeinAccountId,
    ])

    const targetConflict = await findActiveProviderAccountReservationForAccount(
        db,
        input.toBeinAccountId
    )
    if (targetConflict && targetConflict.operationId !== input.operationId) {
        return {
            status: 'TARGET_ALREADY_RESERVED',
            conflictOperationId: targetConflict.operationId,
        }
    }

    try {
        const moved = await db.providerAccountCausalReservation.updateMany({
            where: {
                operationId: input.operationId,
                beinAccountId: input.fromBeinAccountId,
                reservationGeneration: input.reservationGeneration,
                releasedAt: null,
            },
            data: {
                beinAccountId: input.toBeinAccountId,
                reservationGeneration: { increment: 1 },
                acquiredAt: now,
                renewedAt: now,
                automaticWindowEndsAt: input.automaticWindowEndsAt,
                releaseReason: null,
            },
        })
        if (moved.count !== 1) return { status: 'STALE_OWNER' }
        const reservation = await db.providerAccountCausalReservation.findUniqueOrThrow({
            where: { operationId: input.operationId },
        })
        return { status: 'TRANSFERRED', reservation }
    } catch (error) {
        if (!isUniqueConstraintError(error)) throw error
        throw new Error('PROVIDER_ACCOUNT_TRANSFER_CONFLICT', { cause: error })
    }
}

export async function releaseProviderAccountCausalReservation(
    db: ProviderAccountReservationDb,
    input: {
        operationId: string
        beinAccountId: string
        reservationGeneration: number
        authority: ProviderAccountReservationReleaseAuthority
        now?: Date
    }
): Promise<boolean> {
    assertReservationIdentity(input)
    const evidence = input.authority.kind === 'SAFE_TERMINAL'
        ? input.authority.reasonCode.trim()
        : input.authority.kind === 'MANUAL_REVIEW_RESOLVED'
            ? input.authority.resolutionId.trim()
            : input.authority.auditId.trim()
    if (!evidence) return false

    const releaseReason = `${input.authority.kind}:${evidence}`.slice(0, 500)
    const result = await db.providerAccountCausalReservation.updateMany({
        where: {
            operationId: input.operationId,
            beinAccountId: input.beinAccountId,
            reservationGeneration: input.reservationGeneration,
            releasedAt: null,
        },
        data: {
            releasedAt: input.now ?? new Date(),
            releaseReason,
        },
    })
    return result.count === 1
}
