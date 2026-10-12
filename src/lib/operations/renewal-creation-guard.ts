import type { Operation, Prisma } from '@prisma/client'
import { acquireCardLifecycleReservation } from '@/lib/operations/card-lifecycle-reservation'
import { readRenewalCardCooldown, RENEWAL_CARD_COOLDOWN_CODE, type CardCooldownSnapshot } from './renewal-card-cooldown'

export const RENEWAL_CREATION_BLOCKED_CODE = 'RENEWAL_FULFILLMENT_REVIEW_PENDING'
export const RENEWAL_LEGACY_ROUTE_DISABLED_CODE = 'RENEWAL_ROUTE_MIGRATION_REQUIRED'

const ACTIVE_OPERATION_STATUSES = [
    'PENDING',
    'PROCESSING',
    'AWAITING_CAPTCHA',
    'AWAITING_PACKAGE',
    'AWAITING_FINAL_CONFIRM',
    'COMPLETING',
] as const

const FULFILLMENT_SAFETY_ISSUE_TYPES = [
    'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
    'FULFILLMENT_PROOF_CONFLICT',
    'DUPLICATE_RENEWAL_CHARGE_BURST',
    'STRIPE_RENEWAL_REFUND_CONFLICT',
] as const

type RenewalCreationTx = Pick<
    Prisma.TransactionClient,
    'operation' | 'operationIntegrityIssue' | 'cardLifecycleReservation' | '$queryRaw'
>

export type RenewalCreationBlockReason =
    | 'UNRESOLVED_REVIEW'
    | 'FULFILLMENT_INTEGRITY_ISSUE'
    | 'ACTIVE_OPERATION'
    | 'CARD_LIFECYCLE_RESERVED'
    | 'CARD_COOLDOWN'

export class RenewalCreationBlockedError extends Error {
    get code() { return this.reason === 'CARD_COOLDOWN' ? RENEWAL_CARD_COOLDOWN_CODE : RENEWAL_CREATION_BLOCKED_CODE }

    constructor(
        readonly reason: RenewalCreationBlockReason,
        readonly conflictOperationId: string,
        readonly cooldown?: CardCooldownSnapshot,
    ) {
        super(`${RENEWAL_CREATION_BLOCKED_CODE}:${reason}:${conflictOperationId}`)
        this.name = 'RenewalCreationBlockedError'
    }
}

export function isRenewalCreationBlockedError(error: unknown): error is RenewalCreationBlockedError {
    return error instanceof RenewalCreationBlockedError || (
        !!error &&
        typeof error === 'object' &&
        'code' in error &&
        [RENEWAL_CREATION_BLOCKED_CODE, RENEWAL_CARD_COOLDOWN_CODE].includes(String(error.code)) &&
        'conflictOperationId' in error &&
        typeof error.conflictOperationId === 'string'
    )
}

export function normalizeRenewalCardNumber(cardNumber: string): string {
    const normalized = cardNumber.replace(/\s+/g, '')
    if (!normalized || normalized.length > 64 || !/^\d+$/.test(normalized)) {
        throw new Error('INVALID_CARD_NUMBER')
    }
    return normalized
}

export async function lockRenewalCardLifecycle(
    tx: RenewalCreationTx,
    cardNumber: string
): Promise<void> {
    const lockKey = `renewal-card-lifecycle:${cardNumber}`
    // Prisma cannot deserialize PostgreSQL void; the cast preserves the transaction lock.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`
}

async function assertNoRenewalCardConflict(
    tx: RenewalCreationTx,
    cardNumber: string,
    operationId?: string
): Promise<void> {
    const unresolvedReview = await tx.operation.findFirst({
        where: {
            cardNumber,
            status: 'REVIEW_REQUIRED',
            ...(operationId ? { id: { not: operationId } } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
    })
    if (unresolvedReview) {
        throw new RenewalCreationBlockedError('UNRESOLVED_REVIEW', unresolvedReview.id)
    }

    const integrityIssue = await tx.operationIntegrityIssue.findFirst({
        where: {
            issueType: { in: [...FULFILLMENT_SAFETY_ISSUE_TYPES] },
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
            operation: {
                cardNumber,
            },
        },
        orderBy: { lastSeenAt: 'desc' },
        select: { operationId: true },
    })
    if (integrityIssue) {
        throw new RenewalCreationBlockedError(
            'FULFILLMENT_INTEGRITY_ISSUE',
            integrityIssue.operationId
        )
    }

    const activeOperation = await tx.operation.findFirst({
        where: {
            cardNumber,
            status: { in: [...ACTIVE_OPERATION_STATUSES] },
            ...(operationId ? { id: { not: operationId } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    })
    if (activeOperation) {
        throw new RenewalCreationBlockedError('ACTIVE_OPERATION', activeOperation.id)
    }

    const reservation = await tx.cardLifecycleReservation.findFirst({
        where: {
            cardNumber,
            releasedAt: null,
            ...(operationId ? { operationId: { not: operationId } } : {}),
        },
        orderBy: { acquiredAt: 'asc' },
        select: { operationId: true },
    })
    if (reservation) {
        throw new RenewalCreationBlockedError(
            'CARD_LIFECYCLE_RESERVED',
            reservation.operationId
        )
    }
}

async function claimReservation(
    tx: RenewalCreationTx,
    input: { operationId: string; cardNumber: string }
): Promise<void> {
    const reservation = await acquireCardLifecycleReservation(tx, input)
    if (
        reservation.status === 'CARD_ALREADY_RESERVED' ||
        reservation.status === 'OPERATION_ALREADY_RESERVED'
    ) {
        throw new RenewalCreationBlockedError(
            'CARD_LIFECYCLE_RESERVED',
            reservation.conflictOperationId
        )
    }
}

/**
 * The caller keeps financial writes and the outbox insert in this same transaction.
 * This function serializes the card, checks every durable blocker, creates the
 * renewal, and claims its lifecycle reservation before returning.
 */
export async function createGuardedRenewalOperation(
    tx: RenewalCreationTx,
    input: {
        cardNumber: string
        data: Omit<Prisma.OperationUncheckedCreateInput, 'type' | 'cardNumber'>
    }
): Promise<Operation> {
    const cardNumber = normalizeRenewalCardNumber(input.cardNumber)
    await lockRenewalCardLifecycle(tx, cardNumber)
    await assertNoRenewalCardConflict(tx, cardNumber)
    if (input.data.purpose !== 'INSTALLMENT') await assertCardCooldownEnded(tx, cardNumber)

    const operation = await tx.operation.create({
        data: {
            providerPaymentState: 'NOT_SUBMITTED',
            fulfillmentState: 'UNVERIFIED',
            fulfillmentAuthority: 'NONE',
            ...input.data,
            type: 'RENEW',
            cardNumber,
        },
    })

    await claimReservation(tx, { operationId: operation.id, cardNumber })
    return operation
}

/**
 * Reclaims legacy in-flight renewals and rejects any competing/reviewed card
 * before a route advances or dispatches provider work.
 */
export async function ensureGuardedRenewalOperationReservation(
    tx: RenewalCreationTx,
    input: { operationId: string; cardNumber: string }
): Promise<void> {
    const cardNumber = normalizeRenewalCardNumber(input.cardNumber)
    await lockRenewalCardLifecycle(tx, cardNumber)

    const operation = await tx.operation.findUnique({
        where: { id: input.operationId },
        select: { id: true, type: true, cardNumber: true, status: true, purpose: true },
    })
    if (!operation || operation.type !== 'RENEW' || operation.cardNumber !== cardNumber) {
        throw new Error('INVALID_RENEWAL_OPERATION')
    }
    if (operation.status === 'REVIEW_REQUIRED') {
        throw new RenewalCreationBlockedError('UNRESOLVED_REVIEW', operation.id)
    }
    if (!ACTIVE_OPERATION_STATUSES.includes(
        operation.status as (typeof ACTIVE_OPERATION_STATUSES)[number]
    )) {
        throw new Error('INVALID_RENEWAL_OPERATION_STATE')
    }

    await assertNoRenewalCardConflict(tx, cardNumber, operation.id)
    if (operation.purpose !== 'INSTALLMENT') await assertCardCooldownEnded(tx, cardNumber)
    await claimReservation(tx, { operationId: operation.id, cardNumber })
}

export function renewalCreationBlockedPayload(error: RenewalCreationBlockedError) {
    if (error.reason === 'CARD_COOLDOWN' && error.cooldown) {
        return { code: RENEWAL_CARD_COOLDOWN_CODE, error: RENEWAL_CARD_COOLDOWN_CODE,
            messageKey: 'operations.cardCooldownActive', ...error.cooldown }
    }
    return {
        code: RENEWAL_CREATION_BLOCKED_CODE,
        error: 'This card has an unresolved or active renewal. Resolve it before continuing.',
        operationId: error.conflictOperationId,
    }
}

async function assertCardCooldownEnded(tx: RenewalCreationTx, cardNumber: string) {
    const cooldown = await readRenewalCardCooldown(tx, cardNumber)
    if (cooldown.remainingSeconds > 0) throw new RenewalCreationBlockedError('CARD_COOLDOWN', '', cooldown)
}

export function legacyRenewalRouteDisabledPayload() {
    return {
        code: RENEWAL_LEGACY_ROUTE_DISABLED_CODE,
        error: 'This renewal entry point is temporarily unavailable. Use the guided renewal flow.',
    }
}

export type StoreRenewalCancellationDecision =
    | { action: 'CANCEL_SAFE' }
    | {
        action: 'REVIEW_REQUIRED'
        reason:
            | 'UNSAFE_SUBSCRIPTION_STATUS'
            | 'UNSAFE_OPERATION_STATUS'
            | 'PAYMENT_EVIDENCE'
            | 'PROVIDER_MUTATION_EVIDENCE'
            | 'FULFILLMENT_EVIDENCE'
            | 'INTEGRITY_ISSUE'
      }

export function decideStoreRenewalCancellationSafety(input: {
    subscriptionStatus: string
    operationStatus: string
    stripePaymentIntentId: string | null
    paymentId: string | null
    providerPaymentState: string | null
    providerMutationStartedAt: Date | null
    fulfillmentAuthority: string | null
    fulfillmentProofExists: boolean
    unresolvedIntegrityIssueExists: boolean
    storeCreditDebitExists: boolean
}): StoreRenewalCancellationDecision {
    // AWAITING_PAYMENT is also the durable pre-provider PaymentIntent claim.
    // Cancelling it could refund store credit while the Stripe create call is
    // still in flight, so only pre-selection states are automatically safe.
    if (!['PENDING', 'AWAITING_PACKAGE'].includes(input.subscriptionStatus)) {
        return { action: 'REVIEW_REQUIRED', reason: 'UNSAFE_SUBSCRIPTION_STATUS' }
    }
    if (input.operationStatus !== 'AWAITING_PACKAGE') {
        return { action: 'REVIEW_REQUIRED', reason: 'UNSAFE_OPERATION_STATUS' }
    }
    if (input.stripePaymentIntentId || input.paymentId) {
        return { action: 'REVIEW_REQUIRED', reason: 'PAYMENT_EVIDENCE' }
    }
    if (input.storeCreditDebitExists) {
        return { action: 'REVIEW_REQUIRED', reason: 'PAYMENT_EVIDENCE' }
    }
    if (
        input.providerMutationStartedAt ||
        ![null, 'NOT_SUBMITTED'].includes(input.providerPaymentState)
    ) {
        return { action: 'REVIEW_REQUIRED', reason: 'PROVIDER_MUTATION_EVIDENCE' }
    }
    if (
        input.fulfillmentProofExists ||
        ![null, 'NONE'].includes(input.fulfillmentAuthority)
    ) {
        return { action: 'REVIEW_REQUIRED', reason: 'FULFILLMENT_EVIDENCE' }
    }
    if (input.unresolvedIntegrityIssueExists) {
        return { action: 'REVIEW_REQUIRED', reason: 'INTEGRITY_ISSUE' }
    }
    return { action: 'CANCEL_SAFE' }
}
