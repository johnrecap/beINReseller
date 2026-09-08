import { Prisma } from '@prisma/client'
import type { HttpClientService } from '../http/HttpClientService'
import type {
    SoldReportSafeRow,
    SoldReportScanResult,
} from '../http/sold-packages-report'
import type {
    FulfillmentProofMode,
    FulfillmentState,
    FulfillmentVerificationOutcome,
    ProviderPaymentState,
} from '../../../shared/operations/renewal-fulfillment'
import {
    RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY,
    RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY,
    RENEWAL_VERIFICATION_DELAYS_SETTING_KEY,
    SOLD_REPORT_PAGE_CAP_SETTING_KEY,
    SOLD_REPORT_SCAN_ATTEMPTS_SETTING_KEY,
    evaluateRenewalFulfillmentEnforcement,
    parseRenewalVerificationDelays,
    parseSoldReportPageCap,
    parseSoldReportScanAttempts,
} from '../../../shared/operations/renewal-fulfillment-config'
import { prisma } from './prisma'

export interface RenewalFulfillmentConfig {
    proofMode: FulfillmentProofMode
    reportPageCap: number
    reportScanAttempts: number
    verificationDelaysMs: readonly number[]
}

export interface CapturedRenewalFulfillmentBaseline {
    complete: boolean
    baselineId: string | null
    outcome: SoldReportScanResult['outcome']
    reasonCode: string
    dealerContextHash: string
    capturedAt: Date
}

export interface FulfillmentAttemptEvidence {
    operationId: string
    baselineId: string | null
    outcome: FulfillmentVerificationOutcome
    reasonCode: string
    completeScan: boolean
    pageCount: number
    rowCount: number
    candidateInvoiceNo: string | null
    reportObservedAt: Date | null
    contractObservedAt: Date | null
    requestedAttemptNo?: number
}

export interface RecordedFulfillmentVerificationAttempt {
    verificationId: string
    baselineId: string
    attemptId: string
    attemptNo: number
    retryDueAt: Date | null
    replayed: boolean
}

function sameNullableDate(left: Date | null, right: Date | null): boolean {
    return left === null
        ? right === null
        : right !== null && left.getTime() === right.getTime()
}

export async function getRenewalFulfillmentConfig(): Promise<RenewalFulfillmentConfig> {
    const settings = await prisma.setting.findMany({
        where: {
            key: {
                in: [
                    RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY,
                    RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY,
                    SOLD_REPORT_PAGE_CAP_SETTING_KEY,
                    SOLD_REPORT_SCAN_ATTEMPTS_SETTING_KEY,
                    RENEWAL_VERIFICATION_DELAYS_SETTING_KEY,
                ],
            },
        },
        select: { key: true, value: true },
    })
    const values = new Map(settings.map((setting) => [setting.key, setting.value]))
    const enforcement = evaluateRenewalFulfillmentEnforcement({
        requestedMode: values.get(RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY),
        attestationValue: values.get(
            RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY
        ),
    })
    return {
        proofMode: enforcement.effectiveMode,
        reportPageCap: parseSoldReportPageCap(
            values.get(SOLD_REPORT_PAGE_CAP_SETTING_KEY)
        ),
        reportScanAttempts: parseSoldReportScanAttempts(
            values.get(SOLD_REPORT_SCAN_ATTEMPTS_SETTING_KEY)
        ),
        verificationDelaysMs: parseRenewalVerificationDelays(
            values.get(RENEWAL_VERIFICATION_DELAYS_SETTING_KEY)
        ),
    }
}

function invoiceSet(rows: readonly SoldReportSafeRow[]): string[] {
    return [...new Set(rows.map((row) => row.invoiceNo.trim()).filter(Boolean))].sort()
}

async function reusableBaseline(input: {
    operationId: string
    beinAccountId: string
    cardNumber: string
    sessionGeneration: string
}): Promise<{
    id: string
    dealerContextHash: string
    capturedAt: Date
} | null> {
    const verification = await prisma.operationFulfillmentVerification.findUnique({
        where: { operationId: input.operationId },
        select: {
            activeBaseline: {
                select: {
                    id: true,
                    beinAccountId: true,
                    cardNumberSnapshot: true,
                    sessionGeneration: true,
                    supersededAt: true,
                    dealerContextHash: true,
                    capturedAt: true,
                },
            },
        },
    })
    const baseline = verification?.activeBaseline
    if (
        !baseline ||
        baseline.supersededAt ||
        baseline.beinAccountId !== input.beinAccountId ||
        baseline.cardNumberSnapshot !== input.cardNumber ||
        baseline.sessionGeneration !== input.sessionGeneration
    ) {
        return null
    }
    return baseline
}

type LockedBaselineVerification = {
    id: string
    state: string
    activeBaselineId: string | null
}

async function lockAndValidateBaselineCaptureContext(
    tx: Prisma.TransactionClient,
    input: {
        operationId: string
        beinAccountId: string
        cardNumber: string
        reservationGeneration: number
    }
): Promise<LockedBaselineVerification | null> {
    const operations = await tx.$queryRaw<Array<{
        id: string
        type: string
        status: string
        beinAccountId: string | null
        cardNumber: string
        fulfillmentState: string
        fulfillmentAuthority: string
        fulfillmentProofKind: string | null
    }>>`
        SELECT
            "id",
            "type"::text AS "type",
            "status"::text AS "status",
            "bein_account_id" AS "beinAccountId",
            "card_number" AS "cardNumber",
            "fulfillment_state"::text AS "fulfillmentState",
            "fulfillment_authority"::text AS "fulfillmentAuthority",
            "fulfillment_proof_kind"::text AS "fulfillmentProofKind"
        FROM "operations"
        WHERE "id" = ${input.operationId}
        FOR UPDATE
    `
    const operation = operations[0]
    if (
        !operation ||
        operation.type !== 'RENEW' ||
        operation.status !== 'COMPLETING' ||
        operation.beinAccountId !== input.beinAccountId ||
        operation.cardNumber !== input.cardNumber ||
        operation.fulfillmentState === 'VERIFIED' ||
        operation.fulfillmentAuthority !== 'NONE' ||
        operation.fulfillmentProofKind !== null
    ) {
        throw new Error('FULFILLMENT_BASELINE_CONTEXT_STALE')
    }

    const cardReservations = await tx.$queryRaw<Array<{
        operationId: string
        cardNumber: string
        releasedAt: Date | null
    }>>`
        SELECT
            "operation_id" AS "operationId",
            "card_number" AS "cardNumber",
            "released_at" AS "releasedAt"
        FROM "card_lifecycle_reservations"
        WHERE "operation_id" = ${input.operationId}
        FOR UPDATE
    `
    const providerReservations = await tx.$queryRaw<Array<{
        operationId: string
        beinAccountId: string
        reservationGeneration: number
        releasedAt: Date | null
    }>>`
        SELECT
            "operation_id" AS "operationId",
            "bein_account_id" AS "beinAccountId",
            "reservation_generation" AS "reservationGeneration",
            "released_at" AS "releasedAt"
        FROM "provider_account_causal_reservations"
        WHERE "operation_id" = ${input.operationId}
        FOR UPDATE
    `
    const cardReservation = cardReservations[0]
    const providerReservation = providerReservations[0]
    if (
        !cardReservation ||
        cardReservation.operationId !== input.operationId ||
        cardReservation.cardNumber !== input.cardNumber ||
        cardReservation.releasedAt !== null ||
        !providerReservation ||
        providerReservation.operationId !== input.operationId ||
        providerReservation.beinAccountId !== input.beinAccountId ||
        providerReservation.reservationGeneration !== input.reservationGeneration ||
        providerReservation.releasedAt !== null
    ) {
        throw new Error('FULFILLMENT_BASELINE_RESERVATION_STALE')
    }

    const [proof, claim, manualEvidence] = await Promise.all([
        tx.operationFulfillmentProof.findUnique({
            where: { operationId: input.operationId },
            select: { id: true },
        }),
        tx.providerInvoiceClaim.findUnique({
            where: { operationId: input.operationId },
            select: { id: true },
        }),
        tx.operationManualFulfillmentEvidence.findUnique({
            where: { operationId: input.operationId },
            select: { id: true },
        }),
    ])
    if (proof || claim || manualEvidence) throw new Error('FULFILLMENT_BASELINE_PROOF_ALREADY_EXISTS')

    const verifications = await tx.$queryRaw<LockedBaselineVerification[]>`
        SELECT
            "id",
            "state"::text AS "state",
            "active_baseline_id" AS "activeBaselineId"
        FROM "operation_fulfillment_verifications"
        WHERE "operation_id" = ${input.operationId}
        FOR UPDATE
    `
    const verification = verifications[0] || null
    if (verification && ['VERIFIED', 'CONFLICT'].includes(verification.state)) {
        throw new Error('FULFILLMENT_BASELINE_VERIFICATION_TERMINAL')
    }
    return verification
}

export async function captureRenewalFulfillmentBaseline(input: {
    operationId: string
    beinAccountId: string
    cardNumber: string
    reservationGeneration: number
    sessionGeneration: string
    client: HttpClientService
    assertExecutionCurrent: () => Promise<void>
}): Promise<CapturedRenewalFulfillmentBaseline> {
    const reusable = await reusableBaseline(input)
    if (reusable) {
        await input.assertExecutionCurrent()
        const confirmedReusable = await prisma.$transaction(async (tx) => {
            const verification = await lockAndValidateBaselineCaptureContext(tx, input)
            if (verification?.activeBaselineId !== reusable.id) return null
            return tx.operationFulfillmentBaseline.findFirst({
                where: {
                    id: reusable.id,
                    operationId: input.operationId,
                    beinAccountId: input.beinAccountId,
                    cardNumberSnapshot: input.cardNumber,
                    sessionGeneration: input.sessionGeneration,
                    supersededAt: null,
                },
                select: { id: true, dealerContextHash: true, capturedAt: true },
            })
        })
        if (confirmedReusable) {
            return {
                complete: true,
                baselineId: confirmedReusable.id,
                outcome: 'COMPLETE',
                reasonCode: 'REUSED_ACTIVE_BASELINE',
                dealerContextHash: confirmedReusable.dealerContextHash,
                capturedAt: confirmedReusable.capturedAt,
            }
        }
    }

    const config = await getRenewalFulfillmentConfig()
    const scan = await input.client.scanSoldPackagesReport({
        pageCap: config.reportPageCap,
        scanAttempts: config.reportScanAttempts,
    })
    const capturedAt = new Date()
    const dealerContextHash = scan.dealerContextHash || ''
    const complete = scan.outcome === 'COMPLETE' &&
        Boolean(scan.firstPageWatermark) &&
        Boolean(dealerContextHash)
    if (!complete) {
        return {
            complete: false,
            baselineId: null,
            outcome: scan.outcome,
            reasonCode: scan.reasonCode || 'BASELINE_INCOMPLETE',
            dealerContextHash,
            capturedAt,
        }
    }

    await input.assertExecutionCurrent()
    const targetCardRows = scan.rows.filter((row) => row.cardNumber.trim() === input.cardNumber.trim())
    const baseline = await prisma.$transaction(async (tx) => {
        const lockedVerification = await lockAndValidateBaselineCaptureContext(tx, input)
        const verification = lockedVerification
            ? await tx.operationFulfillmentVerification.update({
                where: { id: lockedVerification.id },
                data: {
                    state: 'VERIFYING',
                    startedAt: capturedAt,
                    terminalAt: null,
                },
                select: { id: true, activeBaselineId: true },
            })
            : await tx.operationFulfillmentVerification.create({
                data: {
                    operationId: input.operationId,
                    state: 'VERIFYING',
                    startedAt: capturedAt,
                },
                select: { id: true, activeBaselineId: true },
            })
        if (verification.activeBaselineId) {
            const activeBaseline = await tx.operationFulfillmentBaseline.findUnique({
                where: { id: verification.activeBaselineId },
                select: {
                    id: true,
                    operationId: true,
                    beinAccountId: true,
                    cardNumberSnapshot: true,
                    sessionGeneration: true,
                    supersededAt: true,
                    dealerContextHash: true,
                    capturedAt: true,
                },
            })
            if (
                activeBaseline &&
                activeBaseline.operationId === input.operationId &&
                activeBaseline.beinAccountId === input.beinAccountId &&
                activeBaseline.cardNumberSnapshot === input.cardNumber &&
                activeBaseline.sessionGeneration === input.sessionGeneration &&
                activeBaseline.supersededAt === null
            ) {
                return activeBaseline
            }
            await tx.operationFulfillmentBaseline.updateMany({
                where: { id: verification.activeBaselineId, supersededAt: null },
                data: {
                    supersededAt: capturedAt,
                    supersededReason: 'REPLACED_BY_NEW_COMPLETE_BASELINE',
                },
            })
        }
        const latest = await tx.operationFulfillmentBaseline.findFirst({
            where: { verificationId: verification.id },
            orderBy: { baselineSequence: 'desc' },
            select: { baselineSequence: true },
        })
        const created = await tx.operationFulfillmentBaseline.create({
            data: {
                verificationId: verification.id,
                operationId: input.operationId,
                beinAccountId: input.beinAccountId,
                cardNumberSnapshot: input.cardNumber,
                baselineSequence: (latest?.baselineSequence ?? 0) + 1,
                sessionGeneration: input.sessionGeneration,
                dealerContextHash,
                invoiceSet: invoiceSet(scan.rows),
                targetCardRows: targetCardRows as unknown as Prisma.InputJsonValue,
                pageCount: scan.pageCount,
                rowCount: scan.rows.length,
                firstPageWatermark: scan.firstPageWatermark!,
                scanAttemptCount: scan.scanAttemptCount,
                capturedAt,
            },
            select: { id: true },
        })
        await tx.operationFulfillmentVerification.update({
            where: { id: verification.id },
            data: { activeBaselineId: created.id },
        })
        await tx.operation.update({
            where: { id: input.operationId },
            data: {
                fulfillmentState: 'VERIFYING',
                fulfillmentAuthority: 'NONE',
            },
        })
        return created
    })

    return {
        complete: true,
        baselineId: baseline.id,
        outcome: scan.outcome,
        reasonCode: 'COMPLETE_BASELINE_CAPTURED',
        dealerContextHash,
        capturedAt,
    }
}

export async function supersedeRenewalFulfillmentBaseline(
    operationId: string,
    reasonCode: string
): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const verification = await tx.operationFulfillmentVerification.findUnique({
            where: { operationId },
            select: { id: true, activeBaselineId: true },
        })
        if (!verification?.activeBaselineId) return false
        const supersededAt = new Date()
        const updated = await tx.operationFulfillmentBaseline.updateMany({
            where: { id: verification.activeBaselineId, supersededAt: null },
            data: { supersededAt, supersededReason: reasonCode.slice(0, 500) },
        })
        if (updated.count !== 1) return false
        await tx.operationFulfillmentVerification.update({
            where: { id: verification.id },
            data: {
                activeBaselineId: null,
                state: 'PENDING',
                nextCheckAt: null,
            },
        })
        return true
    })
}

export async function getActiveRenewalFulfillmentBaseline(operationId: string) {
    const verification = await prisma.operationFulfillmentVerification.findUnique({
        where: { operationId },
        include: { activeBaseline: true },
    })
    const activeBaseline = verification?.activeBaseline
    if (!verification || !activeBaseline || activeBaseline.supersededAt) return null
    return { verification, activeBaseline }
}

export async function claimFinalProviderMutationStart(input: {
    operationId: string
    beinAccountId: string
    cardNumber: string
    reservationGeneration: number
    responseData: Prisma.InputJsonValue
}): Promise<{ claimed: boolean; startedAt: Date | null; reason: string }> {
    const active = await getActiveRenewalFulfillmentBaseline(input.operationId)
    if (
        !active ||
        active.activeBaseline.beinAccountId !== input.beinAccountId ||
        active.activeBaseline.cardNumberSnapshot !== input.cardNumber ||
        active.activeBaseline.sessionGeneration !== String(input.reservationGeneration)
    ) {
        return { claimed: false, startedAt: null, reason: 'missing_active_baseline' }
    }
    return prisma.$transaction(async (tx) => {
        const causalGate = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT operation_row."id"
            FROM "operations" operation_row
            JOIN "card_lifecycle_reservations" card_reservation
              ON card_reservation."operation_id" = operation_row."id"
             AND card_reservation."card_number" = ${input.cardNumber}
             AND card_reservation."released_at" IS NULL
            JOIN "provider_account_causal_reservations" account_reservation
              ON account_reservation."operation_id" = operation_row."id"
             AND account_reservation."bein_account_id" = ${input.beinAccountId}
             AND account_reservation."reservation_generation" = ${input.reservationGeneration}
             AND account_reservation."released_at" IS NULL
            JOIN "operation_fulfillment_verifications" verification
              ON verification."operation_id" = operation_row."id"
            JOIN "operation_fulfillment_baselines" baseline
              ON baseline."id" = verification."active_baseline_id"
             AND baseline."operation_id" = operation_row."id"
             AND baseline."bein_account_id" = ${input.beinAccountId}
             AND baseline."card_number_snapshot" = ${input.cardNumber}
             AND baseline."session_generation" = ${String(input.reservationGeneration)}
             AND baseline."superseded_at" IS NULL
            WHERE operation_row."id" = ${input.operationId}
              AND operation_row."bein_account_id" = ${input.beinAccountId}
              AND operation_row."card_number" = ${input.cardNumber}
              AND operation_row."status" IN ('AWAITING_FINAL_CONFIRM', 'COMPLETING')
              AND operation_row."provider_mutation_started_at" IS NULL
              AND operation_row."provider_mutation_stage" IS NULL
              AND verification."state" NOT IN ('VERIFIED', 'CONFLICT')
            FOR UPDATE OF operation_row, card_reservation, account_reservation, verification, baseline
        `
        if (causalGate.length !== 1) {
            return {
                claimed: false,
                startedAt: null,
                reason: 'missing_or_stale_causal_reservation',
            }
        }

        const startedAt = new Date()
        const updated = await tx.operation.updateMany({
            where: {
                id: input.operationId,
                beinAccountId: input.beinAccountId,
                cardNumber: input.cardNumber,
                status: { in: ['AWAITING_FINAL_CONFIRM', 'COMPLETING'] },
                providerMutationStartedAt: null,
                providerMutationStage: null,
            },
            data: {
                providerMutationStartedAt: startedAt,
                providerMutationStage: 'FINAL_OK',
                providerPaymentState: 'UNKNOWN',
                fulfillmentState: 'VERIFYING',
                responseData: input.responseData,
            },
        })
        return updated.count === 1
            ? { claimed: true, startedAt, reason: 'claimed' }
            : {
                claimed: false,
                startedAt: null,
                reason: 'final_provider_mutation_already_started',
            }
    })
}

export async function recordFulfillmentVerificationAttempt(
    input: FulfillmentAttemptEvidence
): Promise<RecordedFulfillmentVerificationAttempt> {
    const config = await getRenewalFulfillmentConfig()
    return prisma.$transaction(async (tx) => {
        const operations = await tx.$queryRaw<Array<{ id: string; status: string }>>`
            SELECT "id", "status"
            FROM "operations"
            WHERE "id" = ${input.operationId}
            FOR UPDATE
        `
        const operation = operations[0]
        if (!operation) throw new Error('FULFILLMENT_OPERATION_NOT_FOUND')
        if (['COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED'].includes(operation.status)) {
            throw new Error('FULFILLMENT_VERIFICATION_STALE_WRITE_BLOCKED')
        }

        const rows = await tx.$queryRaw<Array<{
            id: string
            attempt_count: number
            state: string
            active_baseline_id: string | null
        }>>`
            SELECT "id", "attempt_count", "state", "active_baseline_id"
            FROM "operation_fulfillment_verifications"
            WHERE "operation_id" = ${input.operationId}
            FOR UPDATE
        `
        const verification = rows[0]
        if (!verification) throw new Error('FULFILLMENT_VERIFICATION_NOT_INITIALIZED')
        if (verification.state === 'VERIFIED' || verification.state === 'CONFLICT') {
            throw new Error('FULFILLMENT_VERIFICATION_STALE_WRITE_BLOCKED')
        }
        if (!input.baselineId || verification.active_baseline_id !== input.baselineId) {
            throw new Error('FULFILLMENT_ACTIVE_BASELINE_CHANGED')
        }
        const nextAttemptNo = verification.attempt_count + 1
        const requestedAttemptNo = input.requestedAttemptNo ?? nextAttemptNo
        if (requestedAttemptNo <= verification.attempt_count) {
            const existing = await tx.operationFulfillmentVerificationAttempt.findUnique({
                where: {
                    verificationId_attemptNo: {
                        verificationId: verification.id,
                        attemptNo: requestedAttemptNo,
                    },
                },
                select: {
                    id: true,
                    baselineId: true,
                    attemptNo: true,
                    outcome: true,
                    completeScan: true,
                    pageCount: true,
                    rowCount: true,
                    candidateInvoiceNo: true,
                    reportObservedAt: true,
                    contractObservedAt: true,
                    reasonCode: true,
                    retryDueAt: true,
                },
            })
            if (!existing) throw new Error('FULFILLMENT_VERIFICATION_ATTEMPT_GAP')
            const replayMatches =
                existing.baselineId === input.baselineId &&
                existing.outcome === input.outcome &&
                existing.completeScan === input.completeScan &&
                existing.pageCount === input.pageCount &&
                existing.rowCount === input.rowCount &&
                existing.candidateInvoiceNo === input.candidateInvoiceNo &&
                sameNullableDate(existing.reportObservedAt, input.reportObservedAt) &&
                sameNullableDate(existing.contractObservedAt, input.contractObservedAt) &&
                existing.reasonCode === input.reasonCode.slice(0, 500)
            if (!replayMatches) {
                throw new Error('FULFILLMENT_VERIFICATION_ATTEMPT_REPLAY_MISMATCH')
            }
            return {
                attemptId: existing.id,
                verificationId: verification.id,
                baselineId: input.baselineId,
                attemptNo: existing.attemptNo,
                retryDueAt: existing.retryDueAt,
                replayed: true,
            }
        }
        if (requestedAttemptNo !== nextAttemptNo) {
            throw new Error('FULFILLMENT_VERIFICATION_ATTEMPT_OUT_OF_ORDER')
        }
        const attemptNo = requestedAttemptNo
        const retryable = [
            'VALID_NO_MATCH',
            'REPORT_ONLY',
            'CONTRACT_ONLY',
            'INCOMPLETE_SCAN',
            'CHECK_FAILED',
        ].includes(input.outcome)
        const nextDelay = retryable ? config.verificationDelaysMs[attemptNo] : undefined
        const retryDueAt = nextDelay === undefined ? null : new Date(Date.now() + nextDelay)
        const terminalState = input.outcome === 'MATCHED'
            ? config.proofMode === 'REVIEW_ONLY' ? 'REVIEW_ONLY' : 'VERIFYING'
            : input.outcome === 'PROOF_CONFLICT'
                ? 'CONFLICT'
                : input.outcome === 'CHECK_FAILED' || input.outcome === 'INCOMPLETE_SCAN'
                    ? 'CHECK_FAILED'
                    : 'NO_MATCH'
        const createdAttempt = await tx.operationFulfillmentVerificationAttempt.create({
            data: {
                verificationId: verification.id,
                baselineId: input.baselineId,
                attemptNo,
                outcome: input.outcome,
                completeScan: input.completeScan,
                pageCount: input.pageCount,
                rowCount: input.rowCount,
                candidateCount: input.candidateInvoiceNo ? 1 : 0,
                candidateInvoiceNo: input.candidateInvoiceNo,
                reportObservedAt: input.reportObservedAt,
                contractObservedAt: input.contractObservedAt,
                reasonCode: input.reasonCode.slice(0, 500),
                retryDueAt,
            },
            select: { id: true },
        })
        await tx.operationFulfillmentVerification.update({
            where: { id: verification.id },
            data: {
                state: retryDueAt ? 'VERIFYING' : terminalState,
                attemptCount: attemptNo,
                nextCheckAt: retryDueAt,
                lastOutcome: input.outcome,
                lastReasonCode: input.reasonCode.slice(0, 500),
                terminalAt: retryDueAt ? null : new Date(),
            },
        })
        return {
            attemptId: createdAttempt.id,
            verificationId: verification.id,
            baselineId: input.baselineId,
            attemptNo,
            retryDueAt,
            replayed: false,
        }
    })
}

export async function markFulfillmentVerificationAttemptProofConflict(input: {
    operationId: string
    attemptNo: number
    reasonCode: string
}): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const operations = await tx.$queryRaw<Array<{ id: string; status: string }>>`
            SELECT "id", "status"
            FROM "operations"
            WHERE "id" = ${input.operationId}
            FOR UPDATE
        `
        if (
            operations.length !== 1 ||
            ['COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED'].includes(operations[0].status)
        ) return false

        const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "operation_fulfillment_verifications"
            WHERE "operation_id" = ${input.operationId}
            FOR UPDATE
        `
        const verification = rows[0]
        if (!verification) return false

        const attempts = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "operation_fulfillment_verification_attempts"
            WHERE "verification_id" = ${verification.id}
              AND "attempt_no" = ${input.attemptNo}
            FOR UPDATE
        `
        if (attempts.length !== 1) return false

        const reasonCode = input.reasonCode.slice(0, 500)
        const terminalAt = new Date()
        await tx.operationFulfillmentVerificationAttempt.update({
            where: { id: attempts[0].id },
            data: {
                outcome: 'PROOF_CONFLICT',
                reasonCode,
                retryDueAt: null,
            },
        })
        await tx.operationFulfillmentVerification.update({
            where: { id: verification.id },
            data: {
                state: 'CONFLICT',
                nextCheckAt: null,
                lastOutcome: 'PROOF_CONFLICT',
                lastReasonCode: reasonCode,
                terminalAt,
            },
        })
        return true
    })
}

export async function persistRenewalFulfillmentState(input: {
    operationId: string
    providerPaymentState: ProviderPaymentState
    fulfillmentState: FulfillmentState
    verificationOutcome: FulfillmentVerificationOutcome
    status: 'COMPLETING' | 'REVIEW_REQUIRED' | 'FAILED'
    responseData: Prisma.InputJsonValue
    responseMessage: string
}): Promise<boolean> {
    const updated = await prisma.operation.updateMany({
        where: {
            id: input.operationId,
            status: { notIn: ['COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED'] },
        },
        data: {
            status: input.status,
            providerPaymentState: input.providerPaymentState,
            fulfillmentState: input.fulfillmentState,
            fulfillmentVerificationOutcome: input.verificationOutcome,
            responseData: input.responseData,
            responseMessage: input.responseMessage,
            finalConfirmExpiry: null,
            ...(input.status === 'FAILED' ? { completedAt: new Date() } : {}),
        },
    })
    return updated.count === 1
}
