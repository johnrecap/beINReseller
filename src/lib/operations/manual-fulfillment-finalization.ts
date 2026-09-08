import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
    appendManualReviewDecision,
} from '@/lib/financial-review/manual-decisions'
import {
    extractFinancialReviewMetadata,
    withFinancialReviewMetadata,
} from '@/lib/financial-review/evidence'
import { captureOperationSpendAwardRunInTransaction } from '@/lib/points/operation-spend-award-runs'
import { classifyFinancialReview, reviewCapabilitySelect } from '@/lib/financial-review/capabilities'
import { lockFinancialOperation } from '../../../shared/operations/financial-lock'
import { captureCompletionEffects } from '../../../shared/operations/completion-effects'

type ProviderPaymentState = 'CHARGED' | 'UNKNOWN'

const MANUAL_EVIDENCE_MAX_DELAY_MS = 24 * 60 * 60 * 1_000
const MANUAL_EVIDENCE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000

export interface ManualFulfillmentFinalizationEvidence {
    beinAccountId: string
    invoiceNo: string
    cardNumberSnapshot: string
    packageNameSnapshot: string
    providerAmount: string
    currency: string
    evidenceSource: string
    evidenceNote: string
    observedAt: Date
    actorUserId: string
}

export type ManualFulfillmentFinalizationResult = {
    status: 'COMPLETED' | 'ALREADY_COMPLETED' | 'REVIEW_REQUIRED' | 'PROOF_CONFLICT' | 'INVALID_EVIDENCE'
    manualEvidenceId?: string
}

function nonEmpty(value: unknown, maxLength = Number.MAX_SAFE_INTEGER): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
}

function normalizeMoney(value: unknown): string | null {
    const raw = typeof value === 'number'
        ? Number.isFinite(value) ? String(value) : ''
        : typeof value === 'string'
            ? value.trim()
            : value && typeof (value as { toString?: unknown }).toString === 'function'
                ? String(value)
                : ''
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw)
    if (!match) return null
    const whole = match[1].replace(/^0+(?=\d)/, '')
    const fraction = (match[2] ?? '').padEnd(2, '0')
    return /[1-9]/.test(`${whole}${fraction}`)
        ? `${whole}.${fraction}`
        : null
}

function selectedPackage(value: unknown): { name: string | null; amount: string | null } {
    const selected = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
    const name = typeof selected?.name === 'string'
        ? selected.name.trim()
        : typeof selected?.providerName === 'string'
            ? selected.providerName.trim()
            : null
    const amount = typeof selected?.price === 'string' || typeof selected?.price === 'number'
        ? String(selected.price)
        : null
    return { name: name || null, amount }
}

function validateEvidence(input: ManualFulfillmentFinalizationEvidence): {
    valid: boolean
    invoiceNo: string
    providerAmount: string | null
    currency: string
} {
    const invoiceNo = input.invoiceNo?.trim() || ''
    const providerAmount = normalizeMoney(input.providerAmount)
    const currency = input.currency?.trim().toUpperCase() || ''
    const valid = Boolean(
        invoiceNo &&
        nonEmpty(input.beinAccountId) &&
        nonEmpty(input.cardNumberSnapshot, 64) &&
        /^\d+$/.test(input.cardNumberSnapshot.trim()) &&
        nonEmpty(input.packageNameSnapshot) &&
        providerAmount &&
        /^[A-Z]{3}$/.test(currency) &&
        nonEmpty(input.evidenceSource, 100) &&
        nonEmpty(input.evidenceNote, 2000) &&
        input.observedAt instanceof Date &&
        Number.isFinite(input.observedAt.getTime()) &&
        nonEmpty(input.actorUserId)
    )
    return { valid, invoiceNo, providerAmount, currency }
}

function sameExistingEvidence(
    existing: {
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
    input: ManualFulfillmentFinalizationEvidence
): boolean {
    const normalized = validateEvidence(input)
    return normalized.valid &&
        existing.beinAccountId === input.beinAccountId &&
        existing.invoiceNo === normalized.invoiceNo &&
        existing.cardNumberSnapshot === input.cardNumberSnapshot.trim() &&
        existing.packageNameSnapshot === input.packageNameSnapshot.trim() &&
        normalizeMoney(existing.providerAmount) === normalized.providerAmount &&
        existing.currency === normalized.currency &&
        existing.evidenceSource === input.evidenceSource.trim() &&
        existing.evidenceNote === input.evidenceNote.trim() &&
        existing.observedAt.getTime() === input.observedAt.getTime() &&
        existing.actorUserId === input.actorUserId
}

export async function finalizeManualRenewalFulfillment(input: {
    operationId: string
    providerPaymentState: ProviderPaymentState
    evidence: ManualFulfillmentFinalizationEvidence
    decisionNote: string
    actorUsername: string
    legacyDecision?: { decisionKey: string; sourceReference: string; payloadFingerprint: string }
}): Promise<ManualFulfillmentFinalizationResult> {
    const validation = validateEvidence(input.evidence)
    if (
        !validation.valid ||
        !input.operationId.trim() ||
        !nonEmpty(input.decisionNote, 2_000) ||
        !nonEmpty(input.actorUsername, 200) ||
        validation.currency !== 'USD'
    ) return { status: 'INVALID_EVIDENCE' }

    try {
        return await prisma.$transaction(async (tx) => {
            if (!await lockFinancialOperation(tx, input.operationId)) return { status: 'PROOF_CONFLICT' }

            const operation = await tx.operation.findUnique({
                where: { id: input.operationId },
                select: {
                    ...reviewCapabilitySelect,
                    createdAt: true,
                    id: true,
                    type: true,
                    userId: true,
                    customerId: true,
                    status: true,
                    amount: true,
                    beinAccountId: true,
                    cardNumber: true,
                    selectedPackage: true,
                    responseData: true,
                    providerPaymentState: true,
                    providerMutationStartedAt: true,
                    providerMutationStage: true,
                    fulfillmentAuthority: true,
                    fulfillmentProof: { select: { id: true } },
                    manualFulfillmentEvidence: true,
                },
            })
            if (!operation) return { status: 'PROOF_CONFLICT' }

            const actorRows = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "users" WHERE "id" = ${input.evidence.actorUserId}
                  AND "role" = 'ADMIN' AND "is_active" = true AND "deleted_at" IS NULL FOR SHARE
            `
            if (actorRows.length !== 1) return { status: 'PROOF_CONFLICT' }
            const existingDecision = input.legacyDecision ? await tx.operationReviewAdjudication.findUnique({
                where: { decisionKey: input.legacyDecision.decisionKey },
            }) : null
            if (existingDecision && (existingDecision.operationId !== operation.id ||
                existingDecision.payloadFingerprint !== input.legacyDecision!.payloadFingerprint)) {
                return { status: 'PROOF_CONFLICT' }
            }

            if (operation.status === 'COMPLETED' && operation.manualFulfillmentEvidence) {
                return (!input.legacyDecision || Boolean(existingDecision)) && operation.fulfillmentAuthority === 'MANUAL_PROVIDER_CONFIRMATION' &&
                    sameExistingEvidence(operation.manualFulfillmentEvidence, input.evidence)
                    ? {
                        status: 'ALREADY_COMPLETED',
                        manualEvidenceId: operation.manualFulfillmentEvidence.id,
                    }
                    : { status: 'PROOF_CONFLICT' }
            }

            const capabilities = classifyFinancialReview(operation)
            const legacy = Boolean(input.legacyDecision)
            const panelOperation = Boolean(operation.userId && !operation.customerId)
            if ((panelOperation && (!capabilities.allowedActions.includes('BEIN_EXECUTED_NO_REFUND') ||
                capabilities.classification !== (legacy ? 'LEGACY_RENEWAL' : 'MODERN_RENEWAL'))) || (legacy && !panelOperation)) {
                return { status: 'PROOF_CONFLICT' }
            }

            const [actor, refundTransaction, walletRefund] = await Promise.all([
                tx.user.findUnique({
                    where: { id: input.evidence.actorUserId },
                    select: { id: true, role: true, isActive: true },
                }),
                tx.transaction.findFirst({
                    where: { operationId: operation.id, type: 'REFUND' },
                    select: { id: true },
                }),
                operation.customerId
                    ? tx.walletTransaction.findFirst({
                        where: { referenceId: operation.id, referenceType: 'REFUND' },
                        select: { id: true },
                    })
                    : Promise.resolve(null),
            ])
            const selected = selectedPackage(operation.selectedPackage)
            const expectedAmount = normalizeMoney(selected.amount ?? operation.amount)
            const providerMutationStartedAt = operation.providerMutationStartedAt?.getTime() ?? NaN
            const evidenceObservedAt = input.evidence.observedAt.getTime()
            const evidenceWithinMutationWindow =
                Number.isFinite(providerMutationStartedAt) &&
                evidenceObservedAt >= providerMutationStartedAt &&
                evidenceObservedAt <= providerMutationStartedAt + MANUAL_EVIDENCE_MAX_DELAY_MS &&
                evidenceObservedAt <= Date.now() + MANUAL_EVIDENCE_MAX_FUTURE_SKEW_MS
            if (
                operation.status !== 'REVIEW_REQUIRED' ||
                operation.type !== 'RENEW' ||
                (!legacy && (operation.providerMutationStage !== 'FINAL_OK' ||
                    operation.providerPaymentState !== input.providerPaymentState || !evidenceWithinMutationWindow)) ||
                (legacy && (evidenceObservedAt < operation.createdAt.getTime() ||
                    evidenceObservedAt > Date.now() + MANUAL_EVIDENCE_MAX_FUTURE_SKEW_MS)) ||
                operation.beinAccountId !== input.evidence.beinAccountId ||
                operation.cardNumber !== input.evidence.cardNumberSnapshot.trim() ||
                operation.fulfillmentProof ||
                operation.manualFulfillmentEvidence ||
                refundTransaction ||
                walletRefund ||
                !actor || actor.role !== 'ADMIN' || !actor.isActive ||
                selected.name !== input.evidence.packageNameSnapshot.trim() ||
                expectedAmount !== validation.providerAmount
            ) {
                return { status: 'PROOF_CONFLICT' }
            }

            if (input.legacyDecision) await tx.operationReviewAdjudication.create({ data: {
                operationId: operation.id, actorId: input.evidence.actorUserId,
                decisionKey: input.legacyDecision.decisionKey, payloadFingerprint: input.legacyDecision.payloadFingerprint,
                decisionKind: 'LEGACY_MANUAL_COMPLETION', classification: 'LEGACY_RECONCILABLE',
                sourceReference: input.legacyDecision.sourceReference, observedAt: input.evidence.observedAt,
                reasonCode: 'ATTRIBUTABLE_PROVIDER_EXECUTION', decisionNote: input.decisionNote.trim(),
                normalizedEvidence: { beinAccountId: input.evidence.beinAccountId, invoiceNo: validation.invoiceNo,
                    cardNumber: input.evidence.cardNumberSnapshot.trim(), packageName: input.evidence.packageNameSnapshot.trim(),
                    providerAmount: validation.providerAmount, currency: validation.currency,
                    evidenceSource: input.evidence.evidenceSource.trim(), evidenceNote: input.evidence.evidenceNote.trim() },
            } })

            const invoiceClaim = await tx.providerInvoiceClaim.create({
                data: {
                    operationId: operation.id,
                    beinAccountId: input.evidence.beinAccountId,
                    invoiceNo: validation.invoiceNo,
                    claimKind: 'MANUAL_PROVIDER_CONFIRMATION',
                },
                select: { id: true },
            })
            const evidence = await tx.operationManualFulfillmentEvidence.create({
                data: {
                    operationId: operation.id,
                    beinAccountId: input.evidence.beinAccountId,
                    invoiceClaimId: invoiceClaim.id,
                    invoiceNo: validation.invoiceNo,
                    cardNumberSnapshot: input.evidence.cardNumberSnapshot.trim(),
                    packageNameSnapshot: input.evidence.packageNameSnapshot.trim(),
                    providerAmount: validation.providerAmount!,
                    currency: validation.currency,
                    evidenceSource: input.evidence.evidenceSource.trim(),
                    evidenceNote: input.evidence.evidenceNote.trim(),
                    observedAt: input.evidence.observedAt,
                    actorUserId: input.evidence.actorUserId,
                },
                select: { id: true },
            })

            const completedAt = new Date()
            const responseData = withFinancialReviewMetadata(operation.responseData, (current) =>
                appendManualReviewDecision(current, {
                    action: 'BEIN_EXECUTED_NO_REFUND',
                    note: input.decisionNote,
                    decidedBy: actor.id,
                    decidedByUsername: input.actorUsername,
                    decidedAt: completedAt.toISOString(),
                    cardRenewed: true,
                    paymentStatus: operation.providerPaymentState === 'CHARGED' ? 'تم تأكيد الدفع' : null,
                    source: 'admin_manual_review',
                })
            )
            void extractFinancialReviewMetadata(responseData)

            const updated = await tx.operation.updateMany({
                where: { id: operation.id, status: 'REVIEW_REQUIRED' },
                data: {
                    status: 'COMPLETED',
                    completedAt,
                    responseData,
                    providerPaymentState: legacy ? operation.providerPaymentState : input.providerPaymentState,
                    fulfillmentState: 'VERIFIED',
                    fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION',
                },
            })
            if (updated.count !== 1) throw new Error('OPERATION_FINALIZATION_CONFLICT')

            const captured = await captureOperationSpendAwardRunInTransaction(
                tx,
                operation.id,
                'ADMIN_MANUAL_FULFILLMENT',
                completedAt
            )
            if (captured.outcome === 'CONFLICT') throw new Error('AWARD_RUN_CONFLICT')
            await captureCompletionEffects(tx, operation.id, completedAt)

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

            return { status: 'COMPLETED', manualEvidenceId: evidence.id }
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return { status: 'PROOF_CONFLICT' }
        }
        throw error
    }
}
