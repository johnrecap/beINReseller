import { Prisma } from '@prisma/client'
import { captureCompletionEffects } from '../../../shared/operations/completion-effects'
import {
    captureOperationSpendAwardRunInTransaction as captureAwardRun,
    type AwardRunTransaction,
    type OperationSpendAwardRunCreateData,
    type OperationSpendAwardRunUpdateData,
    type OperationSpendLedgerCreateData,
} from '../../../shared/points/operation-spend-award-runs'
import type {
    FulfillmentProofMode,
    FulfillmentVerificationOutcome,
    ProviderPaymentState,
} from '../../../shared/operations/renewal-fulfillment'
import {
    claimOperationFulfillmentProofInTransaction,
    compareExistingFulfillmentProof,
    normalizeFulfillmentInvoice,
    validateCompositeFulfillmentProofCandidate,
    validateManualFulfillmentEvidenceInput,
    type FulfillmentProofCandidate,
    type ManualFulfillmentEvidenceInput,
} from './fulfillment-proof'
import { prisma } from './prisma'

export type RenewalFulfillmentFinalizationStatus =
    | 'COMPLETED'
    | 'ALREADY_COMPLETED'
    | 'REVIEW_REQUIRED'
    | 'PROOF_CONFLICT'
    | 'INVALID_EVIDENCE'

export type RenewalFulfillmentFinalizationResult = {
    status: RenewalFulfillmentFinalizationStatus
    proofId?: string
    manualEvidenceId?: string
    shouldFinalizeSideEffects: boolean
}

type AutomatedRenewalOperationContext = {
    id: string
    type: string
    status: string
    amount: number
    beinAccountId: string | null
    cardNumber: string
    selectedPackage: unknown
    providerPaymentState: string | null
    providerMutationStartedAt: Date | null
    providerMutationStage: string | null
    fulfillmentAuthority: string | null
    fulfillmentProofKind: string | null
    manualFulfillmentEvidencePresent: boolean
}

type AutomatedRenewalActiveBaselineContext = {
    id: string
    operationId: string
    beinAccountId: string
    cardNumberSnapshot: string
    sessionGeneration: string
    dealerContextHash: string
    capturedAt: Date
}

type AutomatedRenewalCardReservationContext = {
    operationId: string
    cardNumber: string
    releasedAt: Date | null
}

type AutomatedRenewalProviderAccountReservationContext = {
    operationId: string
    beinAccountId: string
    reservationGeneration: number
    releasedAt: Date | null
}

type AutomatedRenewalVerificationContext = {
    id: string
    state: string
    activeBaselineId: string | null
    attemptCount: number
    lastOutcome: string | null
}

type AutomatedRenewalVerificationAttemptContext = {
    id: string
    verificationId: string
    baselineId: string | null
    attemptNo: number
    outcome: string
    completeScan: boolean
    candidateCount: number
    candidateInvoiceNo: string | null
    reportObservedAt: Date | null
    contractObservedAt: Date | null
}

export type AutomatedRenewalFulfillmentContextInput = {
    requestedOperationId: string
    providerPaymentState: ProviderPaymentState
    verificationAttemptId: string
    verificationAttemptNo: number
    baselineId: string
    reservationGeneration: number
    operation: AutomatedRenewalOperationContext
    verification: AutomatedRenewalVerificationContext
    latestAttempt: AutomatedRenewalVerificationAttemptContext
    cardReservation: AutomatedRenewalCardReservationContext | null
    providerAccountReservation: AutomatedRenewalProviderAccountReservationContext | null
    activeBaseline: AutomatedRenewalActiveBaselineContext
    proofCandidate: FulfillmentProofCandidate
}

export type AutomatedRenewalFulfillmentContextValidation =
    | { valid: true }
    | {
        valid: false
        reason:
            | 'INVALID_PROOF_CANDIDATE'
            | 'OPERATION_ID_MISMATCH'
            | 'OPERATION_TYPE_MISMATCH'
            | 'OPERATION_STATUS_MISMATCH'
            | 'PROVIDER_PAYMENT_STATE_MISMATCH'
            | 'FINAL_MUTATION_MARKER_MISSING'
            | 'PROVIDER_ACCOUNT_MISMATCH'
            | 'CARD_CONTEXT_MISMATCH'
            | 'CARD_RESERVATION_MISMATCH'
            | 'PROVIDER_RESERVATION_MISMATCH'
            | 'RESERVATION_GENERATION_MISMATCH'
            | 'FULFILLMENT_AUTHORITY_CONFLICT'
            | 'VERIFICATION_STATE_MISMATCH'
            | 'VERIFICATION_ATTEMPT_MISMATCH'
            | 'VERIFICATION_INVOICE_MISMATCH'
            | 'ACTIVE_BASELINE_MISMATCH'
            | 'PACKAGE_CONTEXT_MISMATCH'
            | 'AMOUNT_CONTEXT_MISMATCH'
            | 'EVIDENCE_CHRONOLOGY_MISMATCH'
    }

type AutomatedRenewalFulfillmentContextFailureReason = Extract<
    AutomatedRenewalFulfillmentContextValidation,
    { valid: false }
>['reason']

function awardRunCreateData(
    data: OperationSpendAwardRunCreateData
): Prisma.OperationSpendAwardRunUncheckedCreateInput {
    return data
}

function awardRunUpdateData(
    data: OperationSpendAwardRunUpdateData
): Prisma.OperationSpendAwardRunUncheckedUpdateInput {
    return data
}

function awardRunUpdateManyData(
    data: OperationSpendAwardRunUpdateData
): Prisma.OperationSpendAwardRunUncheckedUpdateManyInput {
    return data
}

function pointLedgerCreateData(
    data: OperationSpendLedgerCreateData[]
): Prisma.PointLedgerEntryCreateManyInput[] {
    return data
}

function awardRunTransaction(tx: Prisma.TransactionClient): AwardRunTransaction {
    return {
        $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> {
            return tx.$queryRaw<T>(query)
        },
        operation: {
            findUnique: (args) => tx.operation.findUnique(args) as never,
        },
        pointProgramSettings: {
            findUnique: (args) => tx.pointProgramSettings.findUnique(args),
        },
        pointRule: {
            findMany: (args) => tx.pointRule.findMany(args),
        },
        operationSpendAwardRun: {
            findUnique: (args) => tx.operationSpendAwardRun.findUnique(args),
            create: ({ data }) => tx.operationSpendAwardRun.create({ data: awardRunCreateData(data) }),
            upsert: ({ where, create, update }) => tx.operationSpendAwardRun.upsert({
                where,
                create: awardRunCreateData(create),
                update: awardRunUpdateData(update),
            }),
            update: ({ where, data }) => tx.operationSpendAwardRun.update({
                where,
                data: awardRunUpdateData(data),
            }),
            updateMany: ({ where, data }) => tx.operationSpendAwardRun.updateMany({
                where,
                data: awardRunUpdateManyData(data),
            }),
        },
        pointLedgerEntry: {
            findFirst: (args) => tx.pointLedgerEntry.findFirst(args),
            count: (args) => tx.pointLedgerEntry.count(args),
            createMany: ({ data }) => tx.pointLedgerEntry.createMany({ data: pointLedgerCreateData(data) }),
        },
    }
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function selectedPackageContext(value: unknown): { name: string | null; amount: string | null } {
    const selected = jsonRecord(value)
    const name = typeof selected?.name === 'string'
        ? selected.name.trim()
        : typeof selected?.providerName === 'string'
            ? selected.providerName.trim()
            : null
    const rawAmount = selected?.price
    const amount = typeof rawAmount === 'string' || typeof rawAmount === 'number'
        ? String(rawAmount)
        : null
    return { name: name || null, amount }
}

function normalizedMoney(value: unknown): string | null {
    const raw = typeof value === 'number'
        ? Number.isFinite(value) ? String(value) : ''
        : typeof value === 'string'
            ? value.trim()
            : value && typeof (value as { toString?: unknown }).toString === 'function'
                ? String(value)
                : ''
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw)
    if (!match) return null
    return `${BigInt(match[1]).toString()}.${(match[2] ?? '').padEnd(2, '0')}`
}

function sameEvidenceDate(left: Date | null, right: Date | null | undefined): boolean {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime()
}

function validateMatchedVerificationAttempt(
    input: AutomatedRenewalFulfillmentContextInput
): AutomatedRenewalFulfillmentContextFailureReason | null {
    const completedReplay = input.operation.status === 'COMPLETED'
    if (input.verification.state !== (completedReplay ? 'VERIFIED' : 'VERIFYING')) {
        return 'VERIFICATION_STATE_MISMATCH'
    }
    if (
        input.verification.activeBaselineId !== input.baselineId ||
        input.baselineId !== input.proofCandidate.baselineId ||
        input.latestAttempt.baselineId !== input.baselineId
    ) {
        return 'ACTIVE_BASELINE_MISMATCH'
    }
    if (
        input.latestAttempt.id !== input.verificationAttemptId ||
        input.latestAttempt.verificationId !== input.verification.id ||
        input.latestAttempt.attemptNo !== input.verificationAttemptNo ||
        input.verification.attemptCount !== input.verificationAttemptNo ||
        input.latestAttempt.outcome !== 'MATCHED' ||
        input.verification.lastOutcome !== 'MATCHED' ||
        !input.latestAttempt.completeScan ||
        input.latestAttempt.candidateCount !== 1 ||
        !sameEvidenceDate(input.latestAttempt.reportObservedAt, input.proofCandidate.reportObservedAt) ||
        !sameEvidenceDate(input.latestAttempt.contractObservedAt, input.proofCandidate.contractObservedAt)
    ) {
        return 'VERIFICATION_ATTEMPT_MISMATCH'
    }
    if (
        normalizeFulfillmentInvoice(input.latestAttempt.candidateInvoiceNo) !==
        normalizeFulfillmentInvoice(input.proofCandidate.invoiceNo)
    ) {
        return 'VERIFICATION_INVOICE_MISMATCH'
    }
    return null
}

export function validateAutomatedRenewalFulfillmentContext(
    input: AutomatedRenewalFulfillmentContextInput
): AutomatedRenewalFulfillmentContextValidation {
    const candidateValidation = validateCompositeFulfillmentProofCandidate(input.proofCandidate)
    if (!candidateValidation.valid) {
        return { valid: false, reason: 'INVALID_PROOF_CANDIDATE' }
    }

    const {
        operation,
        cardReservation,
        providerAccountReservation,
        activeBaseline,
        proofCandidate,
    } = input
    if (
        operation.id !== input.requestedOperationId ||
        proofCandidate.operationId !== input.requestedOperationId
    ) {
        return { valid: false, reason: 'OPERATION_ID_MISMATCH' }
    }
    if (operation.type !== 'RENEW') {
        return { valid: false, reason: 'OPERATION_TYPE_MISMATCH' }
    }
    if (!['COMPLETING', 'REVIEW_REQUIRED', 'COMPLETED'].includes(operation.status)) {
        return { valid: false, reason: 'OPERATION_STATUS_MISMATCH' }
    }
    if (
        (operation.providerPaymentState !== 'CHARGED' && operation.providerPaymentState !== 'UNKNOWN') ||
        operation.providerPaymentState !== input.providerPaymentState
    ) {
        return { valid: false, reason: 'PROVIDER_PAYMENT_STATE_MISMATCH' }
    }
    if (
        !(operation.providerMutationStartedAt instanceof Date) ||
        !Number.isFinite(operation.providerMutationStartedAt.getTime()) ||
        operation.providerMutationStage !== 'FINAL_OK'
    ) {
        return { valid: false, reason: 'FINAL_MUTATION_MARKER_MISSING' }
    }
    if (
        operation.beinAccountId !== proofCandidate.beinAccountId ||
        activeBaseline.beinAccountId !== proofCandidate.beinAccountId
    ) {
        return { valid: false, reason: 'PROVIDER_ACCOUNT_MISMATCH' }
    }
    if (
        operation.cardNumber !== proofCandidate.cardNumberSnapshot ||
        activeBaseline.cardNumberSnapshot !== proofCandidate.cardNumberSnapshot
    ) {
        return { valid: false, reason: 'CARD_CONTEXT_MISMATCH' }
    }
    const completedReplay = operation.status === 'COMPLETED'
    if (
        !cardReservation ||
        cardReservation.operationId !== operation.id ||
        cardReservation.cardNumber !== operation.cardNumber ||
        (completedReplay ? cardReservation.releasedAt === null : cardReservation.releasedAt !== null)
    ) {
        return { valid: false, reason: 'CARD_RESERVATION_MISMATCH' }
    }
    if (
        !providerAccountReservation ||
        providerAccountReservation.operationId !== operation.id ||
        providerAccountReservation.beinAccountId !== operation.beinAccountId ||
        (completedReplay
            ? providerAccountReservation.releasedAt === null
            : providerAccountReservation.releasedAt !== null)
    ) {
        return { valid: false, reason: 'PROVIDER_RESERVATION_MISMATCH' }
    }

    if (
        operation.manualFulfillmentEvidencePresent ||
        (completedReplay
            ? operation.fulfillmentAuthority !== 'AUTOMATED_COMPOSITE' ||
                operation.fulfillmentProofKind !== 'SOLD_REPORT_CONTRACT_CORRELATION'
            : operation.fulfillmentAuthority !== 'NONE')
    ) {
        return { valid: false, reason: 'FULFILLMENT_AUTHORITY_CONFLICT' }
    }
    const verificationFailure = validateMatchedVerificationAttempt(input)
    if (verificationFailure) {
        return { valid: false, reason: verificationFailure }
    }
    if (
        activeBaseline.id !== input.baselineId ||
        activeBaseline.operationId !== operation.id ||
        activeBaseline.sessionGeneration !== proofCandidate.sessionGeneration ||
        activeBaseline.dealerContextHash !== proofCandidate.dealerContextHash ||
        activeBaseline.capturedAt.getTime() !== proofCandidate.baselineCapturedAt!.getTime()
    ) {
        return { valid: false, reason: 'ACTIVE_BASELINE_MISMATCH' }
    }
    const reservationGeneration = providerAccountReservation.reservationGeneration
    if (
        !Number.isSafeInteger(reservationGeneration) ||
        reservationGeneration <= 0 ||
        reservationGeneration !== input.reservationGeneration ||
        String(reservationGeneration) !== activeBaseline.sessionGeneration ||
        String(reservationGeneration) !== proofCandidate.sessionGeneration
    ) {
        return { valid: false, reason: 'RESERVATION_GENERATION_MISMATCH' }
    }

    const selectedPackage = selectedPackageContext(operation.selectedPackage)
    if (
        !selectedPackage.name ||
        selectedPackage.name !== proofCandidate.selectedPackageName!.trim()
    ) {
        return { valid: false, reason: 'PACKAGE_CONTEXT_MISMATCH' }
    }
    const proofAmount = normalizedMoney(proofCandidate.providerAmount)
    if (
        !proofAmount ||
        normalizedMoney(selectedPackage.amount) !== proofAmount
    ) {
        return { valid: false, reason: 'AMOUNT_CONTEXT_MISMATCH' }
    }

    const baselineCapturedAt = activeBaseline.capturedAt.getTime()
    const mutationStartedAt = operation.providerMutationStartedAt.getTime()
    const reportObservedAt = proofCandidate.reportObservedAt!.getTime()
    const contractObservedAt = proofCandidate.contractObservedAt!.getTime()
    const providerCheckedAt = proofCandidate.providerCheckedAt.getTime()
    // Causal boundary: the baseline must be strictly older than the mutation marker.
    // Post-provider observations may share a millisecond, but must remain ordered as
    // marker <= report <= contract <= final provider check. Retry bounds are enforced
    // by the verification scheduler; this transaction never widens temporal causality.
    if (!(
        baselineCapturedAt < mutationStartedAt &&
        mutationStartedAt <= reportObservedAt &&
        reportObservedAt <= contractObservedAt &&
        contractObservedAt <= providerCheckedAt
    )) {
        return { valid: false, reason: 'EVIDENCE_CHRONOLOGY_MISMATCH' }
    }

    return { valid: true }
}

async function lockOperation(tx: Prisma.TransactionClient, operationId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "operations" WHERE "id" = ${operationId} FOR UPDATE
    `
    return rows.length === 1
}

async function lockCurrentVerificationAttempt(
    tx: Prisma.TransactionClient,
    operationId: string
): Promise<{
    verification: AutomatedRenewalVerificationContext
    latestAttempt: AutomatedRenewalVerificationAttemptContext
} | null> {
    const verificationRows = await tx.$queryRaw<AutomatedRenewalVerificationContext[]>`
        SELECT
            "id",
            "state",
            "active_baseline_id" AS "activeBaselineId",
            "attempt_count" AS "attemptCount",
            "last_outcome" AS "lastOutcome"
        FROM "operation_fulfillment_verifications"
        WHERE "operation_id" = ${operationId}
        FOR UPDATE
    `
    if (verificationRows.length !== 1) return null

    const verification = verificationRows[0]
    const attemptRows = await tx.$queryRaw<AutomatedRenewalVerificationAttemptContext[]>`
        SELECT
            "id",
            "verification_id" AS "verificationId",
            "baseline_id" AS "baselineId",
            "attempt_no" AS "attemptNo",
            "outcome",
            "complete_scan" AS "completeScan",
            "candidate_count" AS "candidateCount",
            "candidate_invoice_no" AS "candidateInvoiceNo",
            "report_observed_at" AS "reportObservedAt",
            "contract_observed_at" AS "contractObservedAt"
        FROM "operation_fulfillment_verification_attempts"
        WHERE "verification_id" = ${verification.id}
        ORDER BY "attempt_no" DESC
        LIMIT 1
        FOR UPDATE
    `
    return attemptRows.length === 1
        ? { verification, latestAttempt: attemptRows[0] }
        : null
}

async function lockCardLifecycleReservation(
    tx: Prisma.TransactionClient,
    operationId: string
): Promise<AutomatedRenewalCardReservationContext | null> {
    const rows = await tx.$queryRaw<AutomatedRenewalCardReservationContext[]>`
        SELECT
            "operation_id" AS "operationId",
            "card_number" AS "cardNumber",
            "released_at" AS "releasedAt"
        FROM "card_lifecycle_reservations"
        WHERE "operation_id" = ${operationId}
        FOR UPDATE
    `
    return rows.length === 1 ? rows[0] : null
}

async function lockProviderAccountCausalReservation(
    tx: Prisma.TransactionClient,
    operationId: string
): Promise<AutomatedRenewalProviderAccountReservationContext | null> {
    const rows = await tx.$queryRaw<AutomatedRenewalProviderAccountReservationContext[]>`
        SELECT
            "operation_id" AS "operationId",
            "bein_account_id" AS "beinAccountId",
            "reservation_generation" AS "reservationGeneration",
            "released_at" AS "releasedAt"
        FROM "provider_account_causal_reservations"
        WHERE "operation_id" = ${operationId}
        FOR UPDATE
    `
    return rows.length === 1 ? rows[0] : null
}

async function lockActiveCompositeBaseline(
    tx: Prisma.TransactionClient,
    operationId: string,
    baselineId: string
): Promise<AutomatedRenewalActiveBaselineContext | null> {
    const rows = await tx.$queryRaw<AutomatedRenewalActiveBaselineContext[]>`
        SELECT
            "id",
            "operation_id" AS "operationId",
            "bein_account_id" AS "beinAccountId",
            "card_number_snapshot" AS "cardNumberSnapshot",
            "session_generation" AS "sessionGeneration",
            "dealer_context_hash" AS "dealerContextHash",
            "captured_at" AS "capturedAt"
        FROM "operation_fulfillment_baselines"
        WHERE "id" = ${baselineId}
          AND "operation_id" = ${operationId}
          AND "superseded_at" IS NULL
        FOR UPDATE
    `
    return rows.length === 1 ? rows[0] : null
}

async function lockChargedSpendLedgerAccount(
    tx: Prisma.TransactionClient,
    operationId: string
): Promise<string | null> {
    const rows = await tx.$queryRaw<Array<{ beinAccountId: string }>>`
        SELECT CASE WHEN ledger."user_id" IS NOT DISTINCT FROM operation_row."user_id"
                     AND ledger."customer_id" IS NOT DISTINCT FROM operation_row."customer_id"
                     AND ((ledger."user_id" IS NULL) <> (ledger."customer_id" IS NULL))
                    THEN ledger."bein_account_id" ELSE '' END AS "beinAccountId"
        FROM "bein_account_spend_ledger" ledger
        JOIN "operations" operation_row ON operation_row."id" = ledger."operation_id"
        WHERE ledger."operation_id" = ${operationId}
        FOR SHARE OF ledger
    `
    return rows.length === 1 ? rows[0].beinAccountId : null
}

async function hasRefund(
    tx: Prisma.TransactionClient,
    operationId: string,
    customerId: string | null
): Promise<boolean> {
    const [resellerRefund, customerRefund] = await Promise.all([
        tx.transaction.findFirst({
            where: { operationId, type: 'REFUND' },
            select: { id: true },
        }),
        customerId
            ? tx.walletTransaction.findFirst({
                where: { referenceId: operationId, referenceType: 'REFUND' },
                select: { id: true },
            })
            : Promise.resolve(null),
    ])
    return Boolean(resellerRefund || customerRefund)
}

export async function captureRenewalCompletionInTransaction(
    tx: Prisma.TransactionClient,
    operationId: string,
    completionSource: string,
    completedAt: Date
): Promise<void> {
    const capture = await captureAwardRun(
        awardRunTransaction(tx),
        operationId,
        completionSource,
        completedAt
    )
    if (capture.outcome === 'CONFLICT') throw new Error('AWARD_RUN_CONFLICT')
    await captureCompletionEffects(tx, operationId, completedAt)
}

export async function finalizeAutomatedRenewalFulfillment(input: {
    operationId: string
    providerPaymentState: ProviderPaymentState
    verificationOutcome: FulfillmentVerificationOutcome
    proofMode: FulfillmentProofMode
    verificationAttemptId: string
    verificationAttemptNo: number
    baselineId: string
    reservationGeneration: number
    proofCandidate: FulfillmentProofCandidate
}): Promise<RenewalFulfillmentFinalizationResult> {
    if (
        input.proofMode !== 'ENFORCE' ||
        input.verificationOutcome !== 'MATCHED' ||
        (input.providerPaymentState !== 'CHARGED' && input.providerPaymentState !== 'UNKNOWN')
    ) {
        return { status: 'REVIEW_REQUIRED', shouldFinalizeSideEffects: false }
    }

    try {
        return await prisma.$transaction(async (tx) => {
            if (!await lockOperation(tx, input.operationId)) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }
            const operation = await tx.operation.findUnique({
                where: { id: input.operationId },
                select: {
                    id: true,
                    userId: true,
                    customerId: true,
                    type: true,
                    status: true,
                    amount: true,
                    beinAccountId: true,
                    cardNumber: true,
                    selectedPackage: true,
                    providerPaymentState: true,
                    providerMutationStartedAt: true,
                    providerMutationStage: true,
                    fulfillmentAuthority: true,
                    fulfillmentProof: true,
                    manualFulfillmentEvidence: { select: { id: true } },
                },
            })
            if (!operation) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }
            const verificationAttemptContext = await lockCurrentVerificationAttempt(
                tx,
                operation.id
            )
            if (!verificationAttemptContext) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }
            const cardReservation = await lockCardLifecycleReservation(tx, operation.id)
            const providerAccountReservation = await lockProviderAccountCausalReservation(
                tx,
                operation.id
            )
            const activeBaseline = await lockActiveCompositeBaseline(
                tx,
                operation.id,
                input.baselineId
            )
            if (!activeBaseline) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }
            const contextValidation = validateAutomatedRenewalFulfillmentContext({
                requestedOperationId: input.operationId,
                providerPaymentState: input.providerPaymentState,
                verificationAttemptId: input.verificationAttemptId,
                verificationAttemptNo: input.verificationAttemptNo,
                baselineId: input.baselineId,
                reservationGeneration: input.reservationGeneration,
                operation: {
                    id: operation.id,
                    type: operation.type,
                    status: operation.status,
                    amount: operation.amount,
                    beinAccountId: operation.beinAccountId,
                    cardNumber: operation.cardNumber,
                    selectedPackage: operation.selectedPackage,
                    providerPaymentState: operation.providerPaymentState,
                    providerMutationStartedAt: operation.providerMutationStartedAt,
                    providerMutationStage: operation.providerMutationStage,
                    fulfillmentAuthority: operation.fulfillmentAuthority,
                    fulfillmentProofKind: operation.fulfillmentProof?.proofKind ?? null,
                    manualFulfillmentEvidencePresent: Boolean(operation.manualFulfillmentEvidence),
                },
                verification: verificationAttemptContext.verification,
                latestAttempt: verificationAttemptContext.latestAttempt,
                cardReservation,
                providerAccountReservation,
                activeBaseline,
                proofCandidate: input.proofCandidate,
            })
            if (
                !contextValidation.valid ||
                await hasRefund(tx, input.operationId, operation.customerId)
            ) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }

            const chargedSpendLedgerAccountId = await lockChargedSpendLedgerAccount(
                tx,
                operation.id
            )
            const spendLedgerAccountMismatch = input.providerPaymentState === 'CHARGED'
                ? chargedSpendLedgerAccountId !== input.proofCandidate.beinAccountId
                : chargedSpendLedgerAccountId !== null &&
                    chargedSpendLedgerAccountId !== input.proofCandidate.beinAccountId
            if (spendLedgerAccountMismatch) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }
            if (operation.status === 'COMPLETED') {
                return operation.fulfillmentProof &&
                    compareExistingFulfillmentProof(
                        operation.fulfillmentProof,
                        input.proofCandidate
                    ) === 'ALREADY_CLAIMED'
                    ? {
                        status: 'ALREADY_COMPLETED',
                        proofId: operation.fulfillmentProof.id,
                        shouldFinalizeSideEffects: false,
                    }
                    : { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }

            const proofClaim = await claimOperationFulfillmentProofInTransaction(tx, input.proofCandidate)
            const proofAccepted = proofClaim.status === 'CLAIMED' || proofClaim.status === 'ALREADY_CLAIMED'
            if (!proofAccepted || !proofClaim.proofId) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }
            const completedAt = new Date()
            const updated = await tx.operation.updateMany({
                where: {
                    id: operation.id,
                    type: 'RENEW',
                    status: { in: ['COMPLETING', 'REVIEW_REQUIRED'] },
                    amount: operation.amount,
                    beinAccountId: input.proofCandidate.beinAccountId,
                    cardNumber: input.proofCandidate.cardNumberSnapshot,
                    selectedPackage: {
                        equals: operation.selectedPackage as Prisma.InputJsonValue,
                    },
                    providerPaymentState: input.providerPaymentState,
                    providerMutationStartedAt: operation.providerMutationStartedAt,
                    providerMutationStage: 'FINAL_OK',
                    fulfillmentAuthority: 'NONE',
                },
                data: {
                    status: 'COMPLETED',
                    completedAt,
                    providerPaymentState: input.providerPaymentState,
                    fulfillmentState: 'VERIFIED',
                    fulfillmentVerificationOutcome: 'MATCHED',
                    fulfillmentAuthority: 'AUTOMATED_COMPOSITE',
                },
            })
            if (updated.count !== 1) throw new Error('OPERATION_FINALIZATION_CONFLICT')

            const verificationUpdated = await tx.operationFulfillmentVerification.updateMany({
                where: {
                    id: verificationAttemptContext.verification.id,
                    operationId: operation.id,
                    state: 'VERIFYING',
                    activeBaselineId: input.baselineId,
                    attemptCount: input.verificationAttemptNo,
                    lastOutcome: 'MATCHED',
                },
                data: {
                    state: 'VERIFIED',
                    lastOutcome: 'MATCHED',
                    nextCheckAt: null,
                    terminalAt: completedAt,
                },
            })
            if (verificationUpdated.count !== 1) {
                throw new Error('FULFILLMENT_VERIFICATION_FINALIZATION_CONFLICT')
            }
            await captureRenewalCompletionInTransaction(tx, operation.id, 'AUTOMATED_COMPOSITE_FULFILLMENT', completedAt)
            await Promise.all([
                tx.operationIntegrityIssue.updateMany({
                    where: {
                        operationId: operation.id,
                        issueType: {
                            in: [
                                'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
                                'FULFILLMENT_PROOF_CONFLICT',
                            ],
                        },
                        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
                    },
                    data: {
                        status: 'RESOLVED',
                        reviewedAt: completedAt,
                        reviewNote: 'Resolved atomically by unique composite fulfillment proof.',
                    },
                }),
                tx.cardLifecycleReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: { releasedAt: completedAt, releaseReason: 'SAFE_TERMINAL:AUTOMATED_COMPOSITE' },
                }),
                tx.providerAccountCausalReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: { releasedAt: completedAt, releaseReason: 'SAFE_TERMINAL:AUTOMATED_COMPOSITE' },
                }),
            ])

            return {
                status: 'COMPLETED',
                proofId: proofClaim.proofId,
                shouldFinalizeSideEffects: true,
            }
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
        }
        throw error
    }
}

function sameManualEvidence(
    existing: {
        operationId: string
        beinAccountId: string
        invoiceNo: string
        cardNumberSnapshot: string
        packageNameSnapshot: string
        providerAmount: Prisma.Decimal
        currency: string
        evidenceSource: string
        evidenceNote: string
        observedAt: Date
        actorUserId: string
    },
    input: ManualFulfillmentEvidenceInput
): boolean {
    const validation = validateManualFulfillmentEvidenceInput(input)
    return validation.valid &&
        existing.operationId === input.operationId &&
        existing.beinAccountId === input.beinAccountId &&
        normalizeFulfillmentInvoice(existing.invoiceNo) === validation.normalizedInvoiceNo &&
        existing.cardNumberSnapshot === input.cardNumberSnapshot?.trim() &&
        existing.packageNameSnapshot === input.packageNameSnapshot?.trim() &&
        normalizedMoney(existing.providerAmount) === validation.normalizedProviderAmount &&
        existing.currency === validation.normalizedCurrency &&
        existing.evidenceSource === input.evidenceSource?.trim() &&
        existing.evidenceNote === input.evidenceNote?.trim() &&
        existing.observedAt.getTime() === input.observedAt?.getTime() &&
        existing.actorUserId === input.actorUserId
}

export async function finalizeManualRenewalFulfillment(input: {
    operationId: string
    providerPaymentState: ProviderPaymentState
    evidence: ManualFulfillmentEvidenceInput
}): Promise<RenewalFulfillmentFinalizationResult> {
    const validation = validateManualFulfillmentEvidenceInput(input.evidence)
    if (!validation.valid || input.evidence.operationId !== input.operationId) {
        return { status: 'INVALID_EVIDENCE', shouldFinalizeSideEffects: false }
    }
    if (input.providerPaymentState !== 'CHARGED' && input.providerPaymentState !== 'UNKNOWN') {
        return { status: 'REVIEW_REQUIRED', shouldFinalizeSideEffects: false }
    }

    try {
        return await prisma.$transaction(async (tx) => {
            if (!await lockOperation(tx, input.operationId)) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }
            const operation = await tx.operation.findUnique({
                where: { id: input.operationId },
                select: {
                    id: true,
                    userId: true,
                    customerId: true,
                    status: true,
                    amount: true,
                    beinAccountId: true,
                    cardNumber: true,
                    selectedPackage: true,
                    providerPaymentState: true,
                    fulfillmentAuthority: true,
                    fulfillmentProof: { select: { id: true } },
                    manualFulfillmentEvidence: true,
                },
            })
            if (!operation) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }
            if (operation.status === 'COMPLETED' && operation.manualFulfillmentEvidence) {
                return operation.fulfillmentAuthority === 'MANUAL_PROVIDER_CONFIRMATION' &&
                    sameManualEvidence(operation.manualFulfillmentEvidence, input.evidence)
                    ? {
                        status: 'ALREADY_COMPLETED',
                        manualEvidenceId: operation.manualFulfillmentEvidence.id,
                        shouldFinalizeSideEffects: false,
                    }
                    : { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }
            if (
                operation.status !== 'REVIEW_REQUIRED' ||
                operation.providerPaymentState === 'NOT_CHARGED' ||
                operation.beinAccountId !== input.evidence.beinAccountId ||
                operation.cardNumber !== input.evidence.cardNumberSnapshot?.trim() ||
                operation.fulfillmentProof ||
                operation.manualFulfillmentEvidence ||
                await hasRefund(tx, operation.id, operation.customerId)
            ) {
                return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
            }

            const actor = await tx.user.findUnique({
                where: { id: input.evidence.actorUserId! },
                select: { id: true, role: true, isActive: true },
            })
            const selectedPackage = selectedPackageContext(operation.selectedPackage)
            const expectedAmount = normalizedMoney(selectedPackage.amount ?? operation.amount)
            if (
                !actor || actor.role !== 'ADMIN' || !actor.isActive ||
                selectedPackage.name !== input.evidence.packageNameSnapshot?.trim() ||
                expectedAmount !== validation.normalizedProviderAmount
            ) {
                return { status: 'INVALID_EVIDENCE', shouldFinalizeSideEffects: false }
            }

            const invoiceClaim = await tx.providerInvoiceClaim.create({
                data: {
                    operationId: operation.id,
                    beinAccountId: input.evidence.beinAccountId!,
                    invoiceNo: validation.normalizedInvoiceNo,
                    claimKind: 'MANUAL_PROVIDER_CONFIRMATION',
                },
                select: { id: true },
            })
            const evidence = await tx.operationManualFulfillmentEvidence.create({
                data: {
                    operationId: operation.id,
                    beinAccountId: input.evidence.beinAccountId!,
                    invoiceClaimId: invoiceClaim.id,
                    invoiceNo: validation.normalizedInvoiceNo,
                    cardNumberSnapshot: input.evidence.cardNumberSnapshot!.trim(),
                    packageNameSnapshot: input.evidence.packageNameSnapshot!.trim(),
                    providerAmount: validation.normalizedProviderAmount,
                    currency: validation.normalizedCurrency,
                    evidenceSource: input.evidence.evidenceSource!.trim(),
                    evidenceNote: input.evidence.evidenceNote!.trim(),
                    observedAt: input.evidence.observedAt!,
                    actorUserId: input.evidence.actorUserId!,
                },
                select: { id: true },
            })

            const completedAt = new Date()
            const updated = await tx.operation.updateMany({
                where: { id: operation.id, status: 'REVIEW_REQUIRED' },
                data: {
                    status: 'COMPLETED',
                    completedAt,
                    providerPaymentState: input.providerPaymentState,
                    fulfillmentState: 'VERIFIED',
                    fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION',
                },
            })
            if (updated.count !== 1) throw new Error('OPERATION_FINALIZATION_CONFLICT')

            await captureRenewalCompletionInTransaction(tx, operation.id, 'ADMIN_MANUAL_FULFILLMENT', completedAt)
            await Promise.all([
                tx.operationIntegrityIssue.updateMany({
                    where: {
                        operationId: operation.id,
                        issueType: {
                            in: [
                                'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
                                'FULFILLMENT_PROOF_CONFLICT',
                            ],
                        },
                        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
                    },
                    data: {
                        status: 'RESOLVED',
                        reviewedAt: completedAt,
                        reviewNote: 'Resolved atomically by unique manual provider evidence.',
                    },
                }),
                tx.cardLifecycleReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: {
                        releasedAt: completedAt,
                        releaseReason: `MANUAL_REVIEW_RESOLVED:${evidence.id}`,
                    },
                }),
                tx.providerAccountCausalReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: {
                        releasedAt: completedAt,
                        releaseReason: `MANUAL_REVIEW_RESOLVED:${evidence.id}`,
                    },
                }),
            ])

            return {
                status: 'COMPLETED',
                manualEvidenceId: evidence.id,
                shouldFinalizeSideEffects: true,
            }
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return { status: 'PROOF_CONFLICT', shouldFinalizeSideEffects: false }
        }
        throw error
    }
}
