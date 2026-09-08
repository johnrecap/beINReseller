import { Prisma } from '@prisma/client'
import type { FulfillmentProofClaimStatus } from '../../../shared/operations/renewal-fulfillment'
import { prisma } from './prisma'

export type FulfillmentProofVerificationSource =
    | 'POST_FINAL_PAY'
    | 'WORKER_RETRY'
    | 'RECOVERY'
    | 'ADMIN_LIVE_CHECK'

type DecimalInput = string | number | { toString(): string }

export interface FulfillmentProofCandidate {
    operationId: string
    beinAccountId: string
    cardNumberSnapshot: string
    invoiceNo?: string | null
    proofKind?: 'LEGACY_CONTRACT_ONLY' | 'SOLD_REPORT_CONTRACT_CORRELATION'
    selectedPackageName?: string | null
    contractPackageName?: string | null
    contractStatus: string
    contractType?: string | null
    contractStartDate?: string | null
    contractExpiryDate?: string | null
    verificationSource: FulfillmentProofVerificationSource
    providerCheckedAt: Date
    baselineId?: string | null
    sessionGeneration?: string | null
    baselineCapturedAt?: Date | null
    reportObservedAt?: Date | null
    contractObservedAt?: Date | null
    reportRowFingerprint?: string | null
    providerAmount?: DecimalInput | null
    currency?: string | null
    reportPackageName?: string | null
    reportItemType?: string | null
    dealerContextHash?: string | null
}

export interface ManualFulfillmentEvidenceInput {
    operationId?: string | null
    beinAccountId?: string | null
    invoiceNo?: string | null
    cardNumberSnapshot?: string | null
    packageNameSnapshot?: string | null
    providerAmount?: DecimalInput | null
    currency?: string | null
    evidenceSource?: string | null
    evidenceNote?: string | null
    observedAt?: Date | null
    actorUserId?: string | null
}

interface ExistingFulfillmentProof {
    id?: string
    operationId: string
    beinAccountId: string
    cardNumberSnapshot: string
    invoiceNo: string
    proofKind?: string | null
    selectedPackageName?: string | null
    contractPackageName?: string | null
    contractStatus?: string | null
    contractType?: string | null
    contractStartDate?: string | null
    contractExpiryDate?: string | null
    verificationSource?: string | null
    providerCheckedAt?: Date | null
    baselineId?: string | null
    sessionGeneration?: string | null
    baselineCapturedAt?: Date | null
    reportObservedAt?: Date | null
    contractObservedAt?: Date | null
    reportRowFingerprint?: string | null
    providerAmount?: DecimalInput | null
    currency?: string | null
    reportPackageName?: string | null
    reportItemType?: string | null
    dealerContextHash?: string | null
}

export type FulfillmentProofClaimResult = {
    status: FulfillmentProofClaimStatus
    proofId?: string
    invoiceClaimId?: string
    conflictingOperationId?: string
}

type CompositeValidationResult =
    | { valid: true; normalizedInvoiceNo: string }
    | { valid: false; reason: 'INVALID_INVOICE' | 'COMPOSITE_METADATA_INCOMPLETE' }

export type ManualEvidenceValidationResult =
    | {
        valid: true
        normalizedInvoiceNo: string
        normalizedCurrency: string
        normalizedProviderAmount: string
    }
    | { valid: false; reason: 'MANUAL_EVIDENCE_INCOMPLETE' }

function nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function validDate(value: unknown): value is Date {
    return value instanceof Date && Number.isFinite(value.getTime())
}

function sha256Hex(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

export function normalizeFulfillmentInvoice(invoiceNo: unknown): string | null {
    if (typeof invoiceNo !== 'string') return null
    const normalized = invoiceNo.trim()
    return normalized || null
}

function normalizeDecimalAmount(value: DecimalInput | null | undefined): string | null {
    let raw: string
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null
        raw = String(value)
    } else if (typeof value === 'string') {
        raw = value
    } else if (value && typeof value.toString === 'function') {
        raw = value.toString()
    } else {
        return null
    }

    const normalized = raw.trim()
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized)
    if (!match) return null
    const whole = match[1].replace(/^0+(?=\d)/, '')
    const fraction = (match[2] ?? '').padEnd(2, '0')
    if (!/[1-9]/.test(`${whole}${fraction}`)) return null
    return `${whole}.${fraction}`
}

function normalizeCurrency(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim().toUpperCase()
    return /^[A-Z]{3}$/.test(normalized) ? normalized : null
}

export function validateCompositeFulfillmentProofCandidate(
    candidate: FulfillmentProofCandidate
): CompositeValidationResult {
    const invoiceNo = normalizeFulfillmentInvoice(candidate.invoiceNo)
    if (!invoiceNo) return { valid: false, reason: 'INVALID_INVOICE' }

    const complete =
        candidate.proofKind === 'SOLD_REPORT_CONTRACT_CORRELATION' &&
        nonEmptyString(candidate.operationId) &&
        nonEmptyString(candidate.beinAccountId) &&
        nonEmptyString(candidate.cardNumberSnapshot) &&
        nonEmptyString(candidate.baselineId) &&
        nonEmptyString(candidate.sessionGeneration) &&
        validDate(candidate.baselineCapturedAt) &&
        validDate(candidate.reportObservedAt) &&
        validDate(candidate.contractObservedAt) &&
        validDate(candidate.providerCheckedAt) &&
        candidate.baselineCapturedAt.getTime() <= candidate.reportObservedAt.getTime() &&
        sha256Hex(candidate.reportRowFingerprint) &&
        normalizeDecimalAmount(candidate.providerAmount) !== null &&
        normalizeCurrency(candidate.currency) === 'USD' &&
        nonEmptyString(candidate.selectedPackageName) &&
        nonEmptyString(candidate.reportPackageName) &&
        nonEmptyString(candidate.reportItemType) &&
        nonEmptyString(candidate.contractPackageName) &&
        candidate.contractStatus.trim().toLowerCase() === 'active' &&
        sha256Hex(candidate.dealerContextHash)

    return complete
        ? { valid: true, normalizedInvoiceNo: invoiceNo }
        : { valid: false, reason: 'COMPOSITE_METADATA_INCOMPLETE' }
}

export function validateManualFulfillmentEvidenceInput(
    input: ManualFulfillmentEvidenceInput
): ManualEvidenceValidationResult {
    const invoiceNo = normalizeFulfillmentInvoice(input.invoiceNo)
    const providerAmount = normalizeDecimalAmount(input.providerAmount)
    const currency = normalizeCurrency(input.currency)
    const complete =
        nonEmptyString(input.operationId) &&
        nonEmptyString(input.beinAccountId) &&
        invoiceNo !== null &&
        nonEmptyString(input.cardNumberSnapshot) &&
        nonEmptyString(input.packageNameSnapshot) &&
        providerAmount !== null &&
        currency !== null &&
        nonEmptyString(input.evidenceSource) &&
        input.evidenceSource.trim().length <= 100 &&
        nonEmptyString(input.evidenceNote) &&
        input.evidenceNote.trim().length <= 2000 &&
        validDate(input.observedAt) &&
        nonEmptyString(input.actorUserId)

    return complete
        ? {
            valid: true,
            normalizedInvoiceNo: invoiceNo,
            normalizedCurrency: currency,
            normalizedProviderAmount: providerAmount,
        }
        : { valid: false, reason: 'MANUAL_EVIDENCE_INCOMPLETE' }
}

function sameString(left: unknown, right: unknown): boolean {
    const normalize = (value: unknown) => typeof value === 'string' ? value.trim() : null
    return normalize(left) === normalize(right)
}

function sameDate(left: unknown, right: unknown): boolean {
    if (!validDate(left) || !validDate(right)) return left == null && right == null
    return left.getTime() === right.getTime()
}

function isExactCompositeReplay(
    existing: ExistingFulfillmentProof,
    candidate: FulfillmentProofCandidate
): boolean {
    return existing.proofKind === 'SOLD_REPORT_CONTRACT_CORRELATION' &&
        candidate.proofKind === 'SOLD_REPORT_CONTRACT_CORRELATION' &&
        sameString(existing.selectedPackageName, candidate.selectedPackageName) &&
        sameString(existing.contractPackageName, candidate.contractPackageName) &&
        sameString(existing.contractStatus?.toLowerCase(), candidate.contractStatus.toLowerCase()) &&
        sameString(existing.contractType, candidate.contractType) &&
        sameString(existing.contractStartDate, candidate.contractStartDate) &&
        sameString(existing.contractExpiryDate, candidate.contractExpiryDate) &&
        sameString(existing.verificationSource, candidate.verificationSource) &&
        sameDate(existing.providerCheckedAt, candidate.providerCheckedAt) &&
        sameString(existing.baselineId, candidate.baselineId) &&
        sameString(existing.sessionGeneration, candidate.sessionGeneration) &&
        sameDate(existing.baselineCapturedAt, candidate.baselineCapturedAt) &&
        sameDate(existing.reportObservedAt, candidate.reportObservedAt) &&
        sameDate(existing.contractObservedAt, candidate.contractObservedAt) &&
        sameString(existing.reportRowFingerprint, candidate.reportRowFingerprint) &&
        normalizeDecimalAmount(existing.providerAmount) === normalizeDecimalAmount(candidate.providerAmount) &&
        normalizeCurrency(existing.currency) === normalizeCurrency(candidate.currency) &&
        sameString(existing.reportPackageName, candidate.reportPackageName) &&
        sameString(existing.reportItemType, candidate.reportItemType) &&
        sameString(existing.dealerContextHash, candidate.dealerContextHash)
}

export function compareExistingFulfillmentProof(
    existing: ExistingFulfillmentProof,
    candidate: FulfillmentProofCandidate
): Exclude<FulfillmentProofClaimStatus, 'CLAIMED' | 'INVALID_INVOICE'> {
    const invoiceNo = normalizeFulfillmentInvoice(candidate.invoiceNo)
    if (
        existing.operationId !== candidate.operationId &&
        existing.beinAccountId === candidate.beinAccountId &&
        normalizeFulfillmentInvoice(existing.invoiceNo) === invoiceNo
    ) {
        return 'INVOICE_ALREADY_USED'
    }
    if (
        existing.operationId === candidate.operationId &&
        existing.beinAccountId === candidate.beinAccountId &&
        existing.cardNumberSnapshot === candidate.cardNumberSnapshot &&
        normalizeFulfillmentInvoice(existing.invoiceNo) === invoiceNo &&
        isExactCompositeReplay(existing, candidate)
    ) {
        return 'ALREADY_CLAIMED'
    }
    return 'OPERATION_PROOF_CONFLICT'
}

const proofSelection = {
    id: true,
    operationId: true,
    beinAccountId: true,
    cardNumberSnapshot: true,
    invoiceNo: true,
    proofKind: true,
    selectedPackageName: true,
    contractPackageName: true,
    contractStatus: true,
    contractType: true,
    contractStartDate: true,
    contractExpiryDate: true,
    verificationSource: true,
    providerCheckedAt: true,
    baselineId: true,
    sessionGeneration: true,
    baselineCapturedAt: true,
    reportObservedAt: true,
    contractObservedAt: true,
    reportRowFingerprint: true,
    providerAmount: true,
    currency: true,
    reportPackageName: true,
    reportItemType: true,
    dealerContextHash: true,
    invoiceClaimId: true,
} as const

async function classifyUniqueProofConflict(
    db: Prisma.TransactionClient | typeof prisma,
    candidate: FulfillmentProofCandidate
): Promise<FulfillmentProofClaimResult> {
    const invoiceNo = normalizeFulfillmentInvoice(candidate.invoiceNo)
    if (!invoiceNo) return { status: 'INVALID_INVOICE' }

    const [operationProof, invoiceClaim] = await Promise.all([
        db.operationFulfillmentProof.findUnique({
            where: { operationId: candidate.operationId },
            select: proofSelection,
        }),
        db.providerInvoiceClaim.findUnique({
            where: { beinAccountId_invoiceNo: { beinAccountId: candidate.beinAccountId, invoiceNo } },
            include: { proof: { select: proofSelection } },
        }),
    ])
    const existing = operationProof ?? invoiceClaim?.proof
    if (existing) {
        return {
            status: compareExistingFulfillmentProof(existing, candidate),
            proofId: existing.id,
            invoiceClaimId: existing.invoiceClaimId,
            ...(existing.operationId !== candidate.operationId
                ? { conflictingOperationId: existing.operationId }
                : {}),
        }
    }
    if (invoiceClaim) {
        return {
            status: invoiceClaim.operationId === candidate.operationId
                ? 'OPERATION_PROOF_CONFLICT'
                : 'INVOICE_ALREADY_USED',
            invoiceClaimId: invoiceClaim.id,
            ...(invoiceClaim.operationId !== candidate.operationId
                ? { conflictingOperationId: invoiceClaim.operationId }
                : {}),
        }
    }
    throw new Error('Fulfillment proof unique conflict could not be resolved')
}

export async function claimOperationFulfillmentProofInTransaction(
    tx: Prisma.TransactionClient,
    candidate: FulfillmentProofCandidate
): Promise<FulfillmentProofClaimResult> {
    const validation = validateCompositeFulfillmentProofCandidate(candidate)
    if (!validation.valid) {
        return {
            status: validation.reason === 'INVALID_INVOICE'
                ? 'INVALID_INVOICE'
                : 'OPERATION_PROOF_CONFLICT',
        }
    }
    const invoiceNo = validation.normalizedInvoiceNo

    const operation = await tx.operation.findUnique({
        where: { id: candidate.operationId },
        select: { id: true, beinAccountId: true, cardNumber: true },
    })
    if (
        !operation ||
        operation.beinAccountId !== candidate.beinAccountId ||
        operation.cardNumber !== candidate.cardNumberSnapshot
    ) {
        return { status: 'OPERATION_PROOF_CONFLICT' }
    }

    const baseline = await tx.operationFulfillmentBaseline.findUnique({
        where: { id: candidate.baselineId! },
        select: {
            id: true,
            operationId: true,
            beinAccountId: true,
            cardNumberSnapshot: true,
            sessionGeneration: true,
            dealerContextHash: true,
            capturedAt: true,
            supersededAt: true,
        },
    })
    if (
        !baseline ||
        baseline.operationId !== candidate.operationId ||
        baseline.beinAccountId !== candidate.beinAccountId ||
        baseline.cardNumberSnapshot !== candidate.cardNumberSnapshot ||
        baseline.sessionGeneration !== candidate.sessionGeneration ||
        baseline.dealerContextHash !== candidate.dealerContextHash ||
        baseline.capturedAt.getTime() !== candidate.baselineCapturedAt!.getTime() ||
        baseline.supersededAt !== null
    ) {
        return { status: 'OPERATION_PROOF_CONFLICT' }
    }

    const existingProof = await tx.operationFulfillmentProof.findUnique({
        where: { operationId: candidate.operationId },
        select: proofSelection,
    })
    if (existingProof) {
        return {
            status: compareExistingFulfillmentProof(existingProof, candidate),
            proofId: existingProof.id,
            invoiceClaimId: existingProof.invoiceClaimId,
        }
    }

    const invoiceClaim = await tx.providerInvoiceClaim.create({
        data: {
            operationId: candidate.operationId,
            beinAccountId: candidate.beinAccountId,
            invoiceNo,
            claimKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
        },
        select: { id: true },
    })
    const proof = await tx.operationFulfillmentProof.create({
        data: {
            operationId: candidate.operationId,
            beinAccountId: candidate.beinAccountId,
            invoiceClaimId: invoiceClaim.id,
            cardNumberSnapshot: candidate.cardNumberSnapshot,
            invoiceNo,
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
            selectedPackageName: candidate.selectedPackageName!.trim(),
            contractPackageName: candidate.contractPackageName!.trim(),
            contractStatus: candidate.contractStatus.trim(),
            contractType: candidate.contractType?.trim() || null,
            contractStartDate: candidate.contractStartDate?.trim() || null,
            contractExpiryDate: candidate.contractExpiryDate?.trim() || null,
            verificationSource: candidate.verificationSource,
            providerCheckedAt: candidate.providerCheckedAt,
            baselineId: candidate.baselineId!,
            sessionGeneration: candidate.sessionGeneration!.trim(),
            baselineCapturedAt: candidate.baselineCapturedAt!,
            reportObservedAt: candidate.reportObservedAt!,
            contractObservedAt: candidate.contractObservedAt!,
            reportRowFingerprint: candidate.reportRowFingerprint!,
            providerAmount: normalizeDecimalAmount(candidate.providerAmount)!,
            currency: 'USD',
            reportPackageName: candidate.reportPackageName!.trim(),
            reportItemType: candidate.reportItemType!.trim(),
            dealerContextHash: candidate.dealerContextHash!,
        },
        select: { id: true },
    })
    return { status: 'CLAIMED', proofId: proof.id, invoiceClaimId: invoiceClaim.id }
}

export async function claimOperationFulfillmentProof(
    candidate: FulfillmentProofCandidate
): Promise<FulfillmentProofClaimResult> {
    try {
        return await prisma.$transaction(async (tx) => {
            await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "operations" WHERE "id" = ${candidate.operationId} FOR UPDATE
            `
            return claimOperationFulfillmentProofInTransaction(tx, candidate)
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return classifyUniqueProofConflict(prisma, candidate)
        }
        throw error
    }
}
