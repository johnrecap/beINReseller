import { Prisma, type ProviderPaymentState } from '@prisma/client'
import type { SoldReportSafeRow, SoldReportScanResult } from '../http/sold-packages-report'
import type { QuotePackage } from '../../../shared/operations/package-quote'
import { getRenewalFulfillmentConfig } from './fulfillment-baseline'
import { captureRenewalCompletionInTransaction } from './fulfillment-finalization'
import { prisma } from './prisma'

export function cairoReportDay(at: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(at)
    const part = (name: string) => parts.find(item => item.type === name)?.value || ''
    return `${part('year')}-${part('month')}-${part('day')}`
}

const exact = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()
const money = (value: string | number) => {
    const parsed = typeof value === 'number' ? value : Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null
}

export type SameDayReportMatch = {
    outcome: 'MATCHED' | 'VALID_NO_MATCH' | 'INCOMPLETE_SCAN' | 'CHECK_FAILED' | 'PROOF_CONFLICT'
    reasonCode: string
    row: SoldReportSafeRow | null
    candidateCount: number
}

export function correlateSameDayReport(input: {
    report: SoldReportScanResult
    cardNumber: string
    smartcardType: string
    selectedPackage: QuotePackage
    claimedInvoices: ReadonlyMap<string, string>
    operationId: string
}): SameDayReportMatch {
    if (input.report.outcome !== 'COMPLETE' || !input.report.dealerContextHash) {
        return { outcome: input.report.outcome === 'CHECK_FAILED' ? 'CHECK_FAILED' : 'INCOMPLETE_SCAN',
            reasonCode: input.report.reasonCode || 'REPORT_SCAN_INCOMPLETE', row: null, candidateCount: 0 }
    }
    const expectedCard = input.cardNumber.trim()
    const serial = input.smartcardType === 'CISCO' && /^\d{10}$/.test(expectedCard)
        ? expectedCard.slice(0, -1) : expectedCard
    const expectedItem = `Card_${input.smartcardType}`
    const amount = money(input.selectedPackage.price)
    if (!amount || !input.selectedPackage.name?.trim() || !['CISCO', 'IRDETO'].includes(input.smartcardType)) {
        return { outcome: 'PROOF_CONFLICT', reasonCode: 'INVALID_SELECTED_PACKAGE', row: null, candidateCount: 0 }
    }
    const matching = input.report.rows.filter(row =>
        (row.cardNumber.trim() === expectedCard || row.cardNumber.trim() === serial) &&
        exact(row.itemType) === exact(expectedItem) &&
        exact(row.packageName) === exact(input.selectedPackage.name) &&
        money(row.providerAmount) === amount &&
        row.currency.toUpperCase() === (input.selectedPackage.currency || 'USD').toUpperCase())
    const available = matching.filter(row => {
        const owner = input.claimedInvoices.get(row.invoiceNo.trim())
        return !owner || owner === input.operationId
    })
    if (available.length > 1) return { outcome: 'PROOF_CONFLICT', reasonCode: 'MULTIPLE_MATCHING_INVOICES',
        row: null, candidateCount: available.length }
    if (available.length === 0) return { outcome: matching.length ? 'PROOF_CONFLICT' : 'VALID_NO_MATCH',
        reasonCode: matching.length ? 'MATCHING_INVOICE_ALREADY_CLAIMED' : 'NO_SAME_DAY_MATCH',
        row: null, candidateCount: 0 }
    return { outcome: 'MATCHED', reasonCode: 'ONE_SAME_DAY_INVOICE', row: available[0], candidateCount: 1 }
}

export async function claimSameDayFinalMutation(input: {
    operationId: string
    beinAccountId: string
    cardNumber: string
    reservationGeneration: number
    responseData: Prisma.InputJsonValue
}): Promise<{ claimed: boolean; startedAt: Date | null }> {
    return prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT op."id" FROM "operations" op
            JOIN "card_lifecycle_reservations" card ON card."operation_id" = op."id"
              AND card."card_number" = ${input.cardNumber} AND card."released_at" IS NULL
            JOIN "provider_account_causal_reservations" account ON account."operation_id" = op."id"
              AND account."bein_account_id" = ${input.beinAccountId}
              AND account."reservation_generation" = ${input.reservationGeneration}
              AND account."released_at" IS NULL
            WHERE op."id" = ${input.operationId} AND op."renewal_flow_version" = 2
              AND op."bein_account_id" = ${input.beinAccountId}
              AND op."card_number" = ${input.cardNumber}
              AND op."status" IN ('AWAITING_FINAL_CONFIRM', 'COMPLETING')
              AND op."provider_mutation_started_at" IS NULL
              AND op."provider_mutation_stage" IS NULL
            FOR UPDATE OF op, card, account
        `
        if (rows.length !== 1) return { claimed: false, startedAt: null }
        const startedAt = new Date()
        const updated = await tx.operation.updateMany({
            where: { id: input.operationId, renewalFlowVersion: 2,
                providerMutationStartedAt: null, providerMutationStage: null },
            data: { providerMutationStartedAt: startedAt, providerMutationStage: 'FINAL_OK',
                providerPaymentState: 'UNKNOWN', fulfillmentState: 'VERIFYING', responseData: input.responseData },
        })
        if (updated.count !== 1) return { claimed: false, startedAt: null }
        await tx.operationFulfillmentVerification.upsert({
            where: { operationId: input.operationId },
            create: { operationId: input.operationId, state: 'VERIFYING', startedAt },
            update: { state: 'VERIFYING', startedAt },
        })
        return { claimed: true, startedAt }
    })
}

export async function markSameDayPayRequest(operationId: string): Promise<Date> {
    const at = new Date()
    const updated = await prisma.operation.updateMany({
        where: { id: operationId, renewalFlowVersion: 2, providerMutationStage: 'FINAL_OK',
            providerMutationStartedAt: { not: null }, providerPayRequestedAt: null },
        data: { providerPayRequestedAt: at },
    })
    if (updated.count !== 1) throw new Error('FINAL_PAY_REQUEST_ALREADY_MARKED')
    return at
}

export async function recordSameDayAttempt(input: {
    operationId: string
    outcome: SameDayReportMatch['outcome']
    reasonCode: string
    report: SoldReportScanResult
    candidateCount: number
    candidateInvoiceNo: string | null
    observedAt: Date
    requestedAttemptNo?: number
}) {
    const config = await getRenewalFulfillmentConfig()
    return prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "operations" WHERE "id" = ${input.operationId} FOR UPDATE`
        const op = await tx.operation.findUnique({ where: { id: input.operationId },
            select: { status: true, renewalFlowVersion: true } })
        if (!op || op.renewalFlowVersion !== 2 || !['COMPLETING', 'REVIEW_REQUIRED'].includes(op.status))
            throw new Error('SAME_DAY_ATTEMPT_STALE_OPERATION')
        const verification = await tx.operationFulfillmentVerification.findUnique({
            where: { operationId: input.operationId }, select: { id: true, attemptCount: true, state: true },
        })
        if (!verification || verification.state === 'VERIFIED') throw new Error('SAME_DAY_VERIFICATION_UNAVAILABLE')
        const attemptNo = verification.attemptCount + 1
        if (input.requestedAttemptNo !== undefined && input.requestedAttemptNo !== attemptNo)
            throw new Error('SAME_DAY_ATTEMPT_OUT_OF_ORDER')
        const retryable = ['VALID_NO_MATCH', 'INCOMPLETE_SCAN', 'CHECK_FAILED'].includes(input.outcome)
        const delay = retryable ? config.verificationDelaysMs[attemptNo] : undefined
        const retryDueAt = delay === undefined ? null : new Date(Date.now() + delay)
        const attempt = await tx.operationFulfillmentVerificationAttempt.create({ data: {
            verificationId: verification.id, baselineId: null, attemptNo,
            outcome: input.outcome, completeScan: input.report.outcome === 'COMPLETE',
            pageCount: input.report.pageCount, rowCount: input.report.rows.length,
            candidateCount: input.candidateCount, candidateInvoiceNo: input.candidateInvoiceNo,
            reportObservedAt: input.observedAt, contractObservedAt: null,
            reasonCode: input.reasonCode.slice(0, 500), retryDueAt,
        } })
        await tx.operationFulfillmentVerification.update({ where: { id: verification.id }, data: {
            state: retryDueAt || input.outcome === 'MATCHED' ? 'VERIFYING'
                : input.outcome === 'PROOF_CONFLICT' ? 'CONFLICT'
                    : input.outcome === 'VALID_NO_MATCH' ? 'NO_MATCH' : 'CHECK_FAILED',
            attemptCount: attemptNo, nextCheckAt: retryDueAt, lastOutcome: input.outcome,
            lastReasonCode: input.reasonCode.slice(0, 500), terminalAt: retryDueAt ? null : new Date(),
        } })
        return { attemptId: attempt.id, attemptNo, retryDueAt }
    })
}

export async function finalizeSameDayReport(input: {
    operationId: string
    beinAccountId: string
    reservationGeneration: number
    providerPaymentState: ProviderPaymentState
    reportDate: string
    submittedAt: Date
    observedAt: Date
    dealerContextHash: string
    row: SoldReportSafeRow
    attemptId: string
    attemptNo: number
}): Promise<'COMPLETED' | 'ALREADY_COMPLETED' | 'PROOF_CONFLICT'> {
    if (input.providerPaymentState === 'NOT_CHARGED' || !/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate))
        return 'PROOF_CONFLICT'
    try {
        return await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "operations" WHERE "id" = ${input.operationId} FOR UPDATE`
            const reservations = await tx.$queryRaw<Array<{ operationId: string }>>`
                SELECT card."operation_id" AS "operationId"
                FROM "card_lifecycle_reservations" card
                JOIN "provider_account_causal_reservations" account
                  ON account."operation_id" = card."operation_id"
                WHERE card."operation_id" = ${input.operationId}
                  AND card."released_at" IS NULL
                  AND account."released_at" IS NULL
                  AND account."bein_account_id" = ${input.beinAccountId}
                  AND account."reservation_generation" = ${input.reservationGeneration}
                FOR UPDATE OF card, account
            `
            if (reservations.length !== 1) return 'PROOF_CONFLICT'
            const op = await tx.operation.findUnique({ where: { id: input.operationId }, include: {
                fulfillmentProof: true, providerInvoiceClaim: true,
                refundSettlements: { select: { id: true } },
                transactions: { where: { type: 'REFUND' }, select: { id: true } },
                cardLifecycleReservation: true, providerAccountCausalReservation: true,
                fulfillmentVerification: { include: { attempts: { orderBy: { attemptNo: 'desc' }, take: 1 } } },
                chargedBeinSpendLedger: { select: { beinAccountId: true } },
            } })
            if (!op || op.renewalFlowVersion !== 2 || op.type !== 'RENEW' || !op.userId || op.customerId ||
                op.beinAccountId !== input.beinAccountId || op.refundSettlements.length || op.transactions.length ||
                op.chargedBeinSpendLedger && op.chargedBeinSpendLedger.beinAccountId !== input.beinAccountId)
                return 'PROOF_CONFLICT'
            if (op.status === 'COMPLETED') return op.fulfillmentProof?.invoiceNo === input.row.invoiceNo &&
                op.fulfillmentProof.proofKind === 'SOLD_REPORT_SAME_DAY' ? 'ALREADY_COMPLETED' : 'PROOF_CONFLICT'
            const selected = op.selectedPackage as QuotePackage | null
            const verification = op.fulfillmentVerification
            const opContext = typeof op.responseData === 'string'
                ? (() => { try { return JSON.parse(op.responseData) as Record<string, unknown> } catch { return {} } })()
                : op.responseData && typeof op.responseData === 'object' && !Array.isArray(op.responseData)
                    ? op.responseData as Record<string, unknown> : {}
            const itemType = typeof opContext.smartcardType === 'string'
                ? opContext.smartcardType.toUpperCase() : 'CISCO'
            const rowStillMatches = selected && correlateSameDayReport({
                report: { outcome: 'COMPLETE', dealerContextHash: input.dealerContextHash,
                    rows: [input.row], pageCount: 1, pageCap: 1, scanAttemptCount: 1,
                    firstPageWatermark: input.row.rowFingerprint },
                cardNumber: op.cardNumber, smartcardType: itemType, selectedPackage: selected,
                claimedInvoices: new Map(), operationId: op.id,
            }).outcome === 'MATCHED'
            const persistedDay = op.providerPayRequestedAt ||
                (opContext.directOkSuccess === true ? op.providerMutationStartedAt : null)
            if (!['COMPLETING', 'REVIEW_REQUIRED'].includes(op.status) || !selected ||
                !rowStillMatches || (selected.appliedPromoCode || null) !== (op.promoCode || null) ||
                !persistedDay || cairoReportDay(persistedDay) !== input.reportDate ||
                !op.providerMutationStartedAt || op.providerMutationStage !== 'FINAL_OK' ||
                op.providerPaymentState !== input.providerPaymentState ||
                !op.cardLifecycleReservation || op.cardLifecycleReservation.releasedAt ||
                !op.providerAccountCausalReservation || op.providerAccountCausalReservation.releasedAt ||
                op.providerAccountCausalReservation.reservationGeneration !== input.reservationGeneration ||
                !verification || verification.attemptCount !== input.attemptNo ||
                verification.attempts[0]?.id !== input.attemptId ||
                verification.attempts[0]?.outcome !== 'MATCHED' ||
                op.fulfillmentAuthority !== 'NONE' || op.fulfillmentProof || op.providerInvoiceClaim)
                return 'PROOF_CONFLICT'
            const claim = await tx.providerInvoiceClaim.create({ data: {
                operationId: op.id, beinAccountId: input.beinAccountId,
                invoiceNo: input.row.invoiceNo.trim(), claimKind: 'SOLD_REPORT_SAME_DAY',
            } })
            const completedAt = new Date()
            await tx.operationFulfillmentProof.create({ data: {
                operationId: op.id, beinAccountId: input.beinAccountId,
                invoiceClaimId: claim.id, invoiceNo: claim.invoiceNo,
                cardNumberSnapshot: op.cardNumber, proofKind: 'SOLD_REPORT_SAME_DAY',
                selectedPackageName: selected.name, contractPackageName: null, contractStatus: null,
                contractType: null, contractStartDate: input.row.contractStartDate,
                contractExpiryDate: input.row.contractExpiryDate, verificationSource: 'POST_FINAL_PAY',
                providerCheckedAt: input.observedAt, reportObservedAt: input.observedAt,
                reportRowFingerprint: input.row.rowFingerprint,
                providerAmount: new Prisma.Decimal(input.row.providerAmount.replace(/,/g, '')),
                currency: input.row.currency, reportPackageName: input.row.packageName,
                reportItemType: input.row.itemType, dealerContextHash: input.dealerContextHash,
                reportDate: new Date(`${input.reportDate}T00:00:00.000Z`),
                providerSubmittedAt: input.submittedAt, promoCodeSnapshot: op.promoCode,
                customerChargedAmount: new Prisma.Decimal(op.amount),
            } })
            await tx.operation.update({ where: { id: op.id }, data: {
                status: 'COMPLETED', completedAt, fulfillmentState: 'VERIFIED',
                fulfillmentVerificationOutcome: 'MATCHED', fulfillmentAuthority: 'AUTOMATED_REPORT',
            } })
            await tx.operationFulfillmentVerification.update({ where: { id: verification.id }, data: {
                state: 'VERIFIED', nextCheckAt: null, lastOutcome: 'MATCHED', terminalAt: completedAt,
            } })
            await captureRenewalCompletionInTransaction(tx, op.id, 'AUTOMATED_REPORT_FULFILLMENT', completedAt)
            await tx.cardLifecycleReservation.updateMany({ where: { operationId: op.id, releasedAt: null },
                data: { releasedAt: completedAt, releaseReason: 'SAFE_TERMINAL:AUTOMATED_REPORT' } })
            await tx.providerAccountCausalReservation.updateMany({ where: { operationId: op.id, releasedAt: null },
                data: { releasedAt: completedAt, releaseReason: 'SAFE_TERMINAL:AUTOMATED_REPORT' } })
            await tx.operationIntegrityIssue.updateMany({ where: { operationId: op.id,
                issueType: { in: ['PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED', 'FULFILLMENT_PROOF_CONFLICT'] },
                status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
            data: { status: 'RESOLVED', reviewedAt: completedAt,
                reviewNote: 'Resolved by unique same-day sold report proof.' } })
            return 'COMPLETED'
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'PROOF_CONFLICT'
        throw error
    }
}
