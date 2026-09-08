import { OperationStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type { PrismaClient } from '@prisma/client';
import { lockFinancialOperation } from '../../../shared/operations/financial-lock';
import { isRefundSettlementVeto } from '../../../shared/operations/audit-financial-context';

export type RenewalNoChargeFinalizationResult =
    | { status: 'FAILED_AND_REFUNDED'; refundId: string }
    | { status: 'ALREADY_FAILED_AND_REFUNDED'; refundId: string }
    | { status: 'REVIEW_REQUIRED'; reason: string }
    | { status: 'EVIDENCE_CONFLICT'; reason: string };

function canonicalDeductionAmount(
    entries: Array<{ userId: string; amount: number }>,
    userId: string
): number | null {
    if (
        entries.length !== 1 ||
        entries.some((entry) => entry.userId !== userId || !Number.isFinite(entry.amount) || entry.amount >= 0)
    ) return null;
    const amount = Math.round(Math.abs(entries[0].amount) * 100) / 100;
    return amount > 0 ? amount : null;
}

async function moveToSettlementReview(
    tx: Prisma.TransactionClient,
    input: {
        operationId: string;
        currentStatus: OperationStatus;
        responseData: Prisma.InputJsonValue;
        reason: string;
    }
): Promise<RenewalNoChargeFinalizationResult> {
    const updated = await tx.operation.updateMany({
        where: {
            id: input.operationId,
            status: input.currentStatus,
            providerPaymentState: 'NOT_CHARGED',
        },
        data: {
            status: 'REVIEW_REQUIRED',
            fulfillmentState: 'NOT_FOUND',
            fulfillmentVerificationOutcome: 'VALID_NO_MATCH',
            responseData: input.responseData,
            responseMessage: input.reason,
            completedAt: null,
            finalConfirmExpiry: null,
            heartbeatExpiry: null,
        },
    });
    return updated.count === 1
        ? { status: 'REVIEW_REQUIRED', reason: input.reason }
        : { status: 'EVIDENCE_CONFLICT', reason: 'NO_CHARGE_SETTLEMENT_STATE_CHANGED' };
}

export async function finalizeRenewalNoChargeFailure(input: {
    operationId: string;
    responseData: Prisma.InputJsonValue;
    responseMessage: string;
    refundReason: string;
    expected?: { verificationId: string; baselineId: string; attemptId: string; attemptNo: number };
}, db: Pick<PrismaClient, '$transaction' | 'operation'> = prisma): Promise<RenewalNoChargeFinalizationResult> {
    try {
        return await db.$transaction(async (tx) => {
            if (!input.expected || !await lockFinancialOperation(tx, input.operationId)) {
                return { status: 'EVIDENCE_CONFLICT', reason: 'EXPECTED_VERIFICATION_CONTEXT_REQUIRED' };
            }
            const locked = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "operations" WHERE "id" = ${input.operationId} FOR UPDATE
            `;
            if (locked.length !== 1) {
                return { status: 'EVIDENCE_CONFLICT', reason: 'OPERATION_NOT_FOUND' };
            }

            const operation = await tx.operation.findUnique({
                where: { id: input.operationId },
                select: {
                    id: true,
                    type: true,
                    purpose: true,
                    beinAccountId: true,
                    cardNumber: true,
                    status: true,
                    userId: true,
                    customerId: true,
                    providerMutationStartedAt: true,
                    providerMutationStage: true,
                    providerPaymentState: true,
                    fulfillmentState: true,
                    fulfillmentVerificationOutcome: true,
                    fulfillmentAuthority: true,
                    chargedBeinSpendLedger: { select: { id: true } },
                    fulfillmentProof: { select: { id: true } },
                    manualFulfillmentEvidence: { select: { id: true } },
                    fulfillmentVerification: {
                        select: {
                            id: true,
                            activeBaselineId: true,
                            activeBaseline: true,
                            attemptCount: true,
                            state: true,
                            lastOutcome: true,
                            nextCheckAt: true,
                            attempts: {
                                orderBy: { attemptNo: 'desc' },
                                take: 1,
                                select: { id: true, baselineId: true, attemptNo: true, outcome: true, completeScan: true, retryDueAt: true },
                            },
                        },
                    },
                    transactions: {
                        where: { type: { in: ['OPERATION_DEDUCT', 'REFUND'] } },
                        select: { id: true, userId: true, type: true, amount: true },
                    },
                },
            });
            if (!operation) return { status: 'EVIDENCE_CONFLICT', reason: 'OPERATION_NOT_FOUND' };

            const latestAttempt = operation.fulfillmentVerification?.attempts[0];
            const verification = operation.fulfillmentVerification;
            const baseline = verification?.activeBaseline;
            const expected = input.expected;
            const settlements = await tx.renewalRefundSettlement.findMany({ where: { operationId: operation.id } });
            const strictNoChargeEvidence =
                operation.type === 'RENEW' &&
                operation.purpose !== 'INSTALLMENT' &&
                verification?.id === expected.verificationId &&
                verification.activeBaselineId === expected.baselineId &&
                verification.state === 'NO_MATCH' &&
                baseline?.id === expected.baselineId && !baseline.supersededAt &&
                baseline.operationId === operation.id && baseline.beinAccountId === operation.beinAccountId &&
                baseline.cardNumberSnapshot === operation.cardNumber &&
                latestAttempt?.id === expected.attemptId && latestAttempt.attemptNo === expected.attemptNo &&
                latestAttempt.baselineId === expected.baselineId && verification.attemptCount === expected.attemptNo &&
                !settlements.some(isRefundSettlementVeto) &&
                operation.providerMutationStartedAt instanceof Date &&
                operation.providerMutationStage === 'FINAL_OK' &&
                operation.providerPaymentState === 'NOT_CHARGED' &&
                (operation.fulfillmentState === 'VERIFYING' || operation.fulfillmentState === 'NOT_FOUND') &&
                !['MATCHED', 'PROOF_CONFLICT', 'REPORT_ONLY', 'CONTRACT_ONLY'].includes(operation.fulfillmentVerificationOutcome ?? '') &&
                operation.fulfillmentAuthority === 'NONE' &&
                operation.fulfillmentVerification?.lastOutcome === 'VALID_NO_MATCH' &&
                operation.fulfillmentVerification.nextCheckAt === null &&
                latestAttempt?.outcome === 'VALID_NO_MATCH' &&
                latestAttempt.completeScan === true &&
                latestAttempt.retryDueAt === null &&
                !operation.chargedBeinSpendLedger &&
                !operation.fulfillmentProof &&
                !operation.manualFulfillmentEvidence;
            if (!strictNoChargeEvidence) {
                return { status: 'EVIDENCE_CONFLICT', reason: 'STRICT_NO_CHARGE_EVIDENCE_REQUIRED' };
            }

            const existingRefund = operation.transactions.find((entry) => entry.type === 'REFUND');
            if (existingRefund) {
                const amount = operation.userId ? canonicalDeductionAmount(operation.transactions.filter(t => t.type === 'OPERATION_DEDUCT'), operation.userId) : null;
                return operation.status === 'FAILED' && amount !== null && existingRefund.userId === operation.userId && existingRefund.amount === amount
                    ? { status: 'ALREADY_FAILED_AND_REFUNDED', refundId: existingRefund.id }
                    : { status: 'EVIDENCE_CONFLICT', reason: 'REFUND_EXISTS_WITH_NONFAILED_STATUS' };
            }

            if (!operation.userId || operation.customerId) {
                return moveToSettlementReview(tx, {
                    operationId: operation.id,
                    currentStatus: operation.status,
                    responseData: input.responseData,
                    reason: 'Canonical customer settlement requires manual provider-aware refund review.',
                });
            }
            if (!['COMPLETING', 'REVIEW_REQUIRED'].includes(operation.status)) {
                return { status: 'EVIDENCE_CONFLICT', reason: 'NO_CHARGE_SETTLEMENT_TERMINAL_CONFLICT' };
            }
            const deductions = operation.transactions.filter((entry) => entry.type === 'OPERATION_DEDUCT');
            const refundAmount = canonicalDeductionAmount(deductions, operation.userId);
            if (!refundAmount) {
                return moveToSettlementReview(tx, {
                    operationId: operation.id,
                    currentStatus: operation.status,
                    responseData: input.responseData,
                    reason: 'Canonical reseller deduction ledger is missing or conflicting; manual review required.',
                });
            }

            const user = await tx.user.update({
                where: { id: operation.userId },
                data: { balance: { increment: refundAmount } },
                select: { id: true, balance: true },
            });
            const refund = await tx.transaction.create({
                data: {
                    userId: user.id,
                    operationId: operation.id,
                    type: 'REFUND',
                    amount: refundAmount,
                    balanceAfter: user.balance,
                    notes: `Auto-refund after strict no-charge fulfillment verification: ${input.refundReason}`,
                },
                select: { id: true },
            });

            const originalPointEntries = await tx.pointLedgerEntry.findMany({
                where: {
                    operationId: operation.id,
                    sourceType: 'OPERATION_SPEND',
                    points: { gt: 0 },
                },
                select: { ownerUserId: true, ownerRoleAtTime: true, points: true },
            });
            if (originalPointEntries.length > 0) {
                await tx.pointLedgerEntry.createMany({
                    data: originalPointEntries.map((entry) => ({
                        ownerUserId: entry.ownerUserId,
                        ownerRoleAtTime: entry.ownerRoleAtTime,
                        operationId: operation.id,
                        sourceType: 'POINT_REVERSAL' as const,
                        sourceId: `${operation.id}:${entry.ownerUserId}:refund`,
                        points: -entry.points,
                        status: 'REDEEMED' as const,
                        notes: `Point reversal for operation ${operation.id} because refund`,
                    })),
                    skipDuplicates: true,
                });
            }

            const completedAt = new Date();
            const updated = await tx.operation.updateMany({
                where: {
                    id: operation.id,
                    status: operation.status,
                    providerPaymentState: 'NOT_CHARGED',
                    providerMutationStage: 'FINAL_OK',
                },
                data: {
                    status: 'FAILED',
                    fulfillmentState: 'NOT_FOUND',
                    fulfillmentVerificationOutcome: 'VALID_NO_MATCH',
                    completedAt,
                    responseData: input.responseData,
                    responseMessage: input.responseMessage,
                    finalConfirmExpiry: null,
                    heartbeatExpiry: null,
                },
            });
            if (updated.count !== 1) throw new Error('NO_CHARGE_FINALIZATION_STATE_RACE');

            await Promise.all([
                tx.notification.create({
                    data: {
                        userId: user.id,
                        title: 'Amount refunded',
                        message: `Amount refunded: ${refundAmount}. Provider payment was explicitly rejected.`,
                        type: 'info',
                        link: '/dashboard/transactions',
                    },
                }),
                tx.operationIntegrityIssue.updateMany({
                    where: { operationId: operation.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
                    data: {
                        status: 'RESOLVED',
                        reviewedAt: completedAt,
                        reviewNote: `Resolved atomically by strict no-charge refund ${refund.id}.`,
                    },
                }),
                tx.cardLifecycleReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: { releasedAt: completedAt, releaseReason: `SAFE_TERMINAL:NO_CHARGE_REFUND:${refund.id}` },
                }),
                tx.providerAccountCausalReservation.updateMany({
                    where: { operationId: operation.id, releasedAt: null },
                    data: { releasedAt: completedAt, releaseReason: `SAFE_TERMINAL:NO_CHARGE_REFUND:${refund.id}` },
                }),
            ]);

            return { status: 'FAILED_AND_REFUNDED', refundId: refund.id };
        });
    } catch (error) {
        throw error;
    }
}
