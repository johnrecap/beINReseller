import { OperationStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';

const BALANCE_EPSILON = 0.01;

export type BeinSpendLedgerResult =
    | { status: 'created'; ledgerId: string; spendAmount: number }
    | { status: 'already_recorded'; ledgerId: string; spendAmount: number }
    | { status: 'missing_balance_delta'; reason: string }
    | { status: 'conflict_review_required'; ledgerId: string; reason: string };

export interface RecordConfirmedBeinSpendInput {
    operationId: string;
    userId: string;
    beinAccountId: string;
    dealerBalanceBefore: number | null;
    dealerBalanceAfter: number | null;
    evidenceSource: 'BALANCE_DELTA' | 'CONTRACT_VERIFIED';
    confirmedSpendAmount?: number | null;
    balanceBeforeSource?: 'final_pay_ok_page' | 'package_load_diagnostic' | 'missing';
    balanceAfterSource?: 'final_pay_result_page' | 'final_pay_balance_check' | 'missing';
    chargedAt?: Date;
}

function toPositiveSpendAmount(before: number | null, after: number | null): number | null {
    if (before === null || after === null) return null;

    const spendAmount = Number((before - after).toFixed(4));
    if (spendAmount <= 0 || spendAmount < BALANCE_EPSILON) return null;

    return spendAmount;
}

function selectedPackageText(value: unknown, key: 'name' | 'package' | 'title'): string | null {
    if (!value || typeof value !== 'object') return null;
    const entry = (value as Record<string, unknown>)[key];
    return typeof entry === 'string' && entry.trim() ? entry.trim() : null;
}

function selectedPackagePrice(value: unknown): number | null {
    if (!value || typeof value !== 'object') return null;

    const raw = (value as Record<string, unknown>).price ?? (value as Record<string, unknown>).dealerPrice;
    const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;

    return Number.isFinite(numeric) ? numeric : null;
}

function sameLedgerInput(
    existing: {
        beinAccountId: string;
        spendAmount: number;
        dealerBalanceBefore: number | null;
        dealerBalanceAfter: number | null;
        evidenceSource: string;
    },
    input: {
        beinAccountId: string;
        spendAmount: number;
        dealerBalanceBefore: number | null;
        dealerBalanceAfter: number | null;
        evidenceSource: string;
    }
): boolean {
    return existing.beinAccountId === input.beinAccountId &&
        Math.abs(existing.spendAmount - input.spendAmount) < BALANCE_EPSILON &&
        existing.evidenceSource === input.evidenceSource &&
        nullableMoneyMatches(existing.dealerBalanceBefore, input.dealerBalanceBefore) &&
        nullableMoneyMatches(existing.dealerBalanceAfter, input.dealerBalanceAfter);
}

function nullableMoneyMatches(left: number | null, right: number | null): boolean {
    if (left === null || right === null) return left === right;
    return Math.abs(left - right) < BALANCE_EPSILON;
}

function toPositiveExplicitSpendAmount(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const spendAmount = Number(value.toFixed(4));
    return spendAmount > BALANCE_EPSILON ? spendAmount : null;
}

async function flagOperationAccountConflict(operationId: string): Promise<void> {
    await prisma.operation.updateMany({
        where: {
            id: operationId,
            status: { notIn: [OperationStatus.COMPLETED, OperationStatus.CANCELLED, OperationStatus.FAILED, OperationStatus.EXPIRED] },
        },
        data: {
            status: OperationStatus.REVIEW_REQUIRED,
            responseMessage: 'Confirmed beIN spend account conflicts with operation account. Manual review required.',
        },
    });
}

export async function recordConfirmedBeinSpend(
    input: RecordConfirmedBeinSpendInput
): Promise<BeinSpendLedgerResult> {
    if (input.evidenceSource === 'BALANCE_DELTA' && (
        (input.balanceBeforeSource !== undefined || input.balanceAfterSource !== undefined) &&
        (input.balanceBeforeSource !== 'final_pay_ok_page' ||
            (input.balanceAfterSource !== 'final_pay_result_page' && input.balanceAfterSource !== 'final_pay_balance_check'))
    )) {
        return {
            status: 'missing_balance_delta',
            reason: 'Confirmed ledger requires final-payment balance sources.',
        };
    }

    const spendAmount = input.evidenceSource === 'CONTRACT_VERIFIED'
        ? toPositiveExplicitSpendAmount(input.confirmedSpendAmount)
        : toPositiveSpendAmount(input.dealerBalanceBefore, input.dealerBalanceAfter);
    if (spendAmount === null) {
        return {
            status: 'missing_balance_delta',
            reason: input.evidenceSource === 'CONTRACT_VERIFIED'
                ? 'Contract verified ledger requires a positive spend amount.'
                : 'Confirmed ledger requires a positive beIN dealer balance decrease.',
        };
    }
    const dealerBalanceBefore = input.dealerBalanceBefore;
    const dealerBalanceAfter = input.dealerBalanceAfter;
    if (input.evidenceSource === 'BALANCE_DELTA' && (dealerBalanceBefore === null || dealerBalanceAfter === null)) {
        return {
            status: 'missing_balance_delta',
            reason: 'Confirmed ledger requires both beIN balance values.',
        };
    }

    const existing = await prisma.beinAccountSpendLedger.findUnique({
        where: { operationId: input.operationId },
        select: {
            id: true,
            beinAccountId: true,
            spendAmount: true,
            dealerBalanceBefore: true,
            dealerBalanceAfter: true,
            evidenceSource: true,
        },
    });

    if (existing) {
        const duplicateMatches = sameLedgerInput(existing, {
            beinAccountId: input.beinAccountId,
            spendAmount,
            dealerBalanceBefore,
            dealerBalanceAfter,
            evidenceSource: input.evidenceSource,
        });
        const duplicateConflicts = existing.beinAccountId !== input.beinAccountId || !duplicateMatches;

        if (!duplicateConflicts) {
            return { status: 'already_recorded', ledgerId: existing.id, spendAmount: existing.spendAmount };
        }

        await prisma.operation.updateMany({
            where: {
                id: input.operationId,
                status: { notIn: [OperationStatus.COMPLETED, OperationStatus.CANCELLED, OperationStatus.FAILED, OperationStatus.EXPIRED] },
            },
            data: {
                status: OperationStatus.REVIEW_REQUIRED,
                responseMessage: 'Conflicting beIN spend ledger input. Manual review required.',
            },
        });

        return {
            status: 'conflict_review_required',
            ledgerId: existing.id,
            reason: 'Existing confirmed ledger row conflicts with new beIN account or spend amount.',
        };
    }

    const [operation, account] = await Promise.all([
        prisma.operation.findUnique({
            where: { id: input.operationId },
            select: {
                type: true,
                status: true,
                cardNumber: true,
                beinAccountId: true,
                selectedPackage: true,
            },
        }),
        prisma.beinAccount.findUnique({
            where: { id: input.beinAccountId },
            select: {
                username: true,
                label: true,
                proxyId: true,
                proxy: { select: { label: true, host: true } },
            },
        }),
    ]);

    if (!operation || !account) {
        return {
            status: 'missing_balance_delta',
            reason: 'Operation or charged beIN account was not found.',
        };
    }

    const accountConflict = Boolean(operation.beinAccountId && operation.beinAccountId !== input.beinAccountId);

    try {
        if (!operation.beinAccountId) {
            await prisma.operation.updateMany({
                where: {
                    id: input.operationId,
                    beinAccountId: null,
                },
                data: {
                    beinAccountId: input.beinAccountId,
                },
            });
        }

        const packageName =
            selectedPackageText(operation.selectedPackage, 'name') ??
            selectedPackageText(operation.selectedPackage, 'package') ??
            selectedPackageText(operation.selectedPackage, 'title');

        const row = await prisma.beinAccountSpendLedger.create({
            data: {
                operationId: input.operationId,
                userId: input.userId,
                beinAccountId: input.beinAccountId,
                proxyId: account.proxyId,
                operationType: operation.type,
                operationStatusAtRecord: operation.status,
                cardNumberSnapshot: operation.cardNumber,
                selectedPackageName: packageName,
                selectedPackagePrice: selectedPackagePrice(operation.selectedPackage),
                currency: 'USD',
                dealerBalanceBefore,
                dealerBalanceAfter,
                spendAmount,
                evidenceSource: input.evidenceSource,
                evidenceConfidence: input.evidenceSource === 'CONTRACT_VERIFIED'
                    ? 'CONTRACT_VERIFIED'
                    : input.balanceBeforeSource ? 'CONFIRMED_FINAL_PAY' : 'CONFIRMED',
                beinUsernameSnapshot: account.username,
                beinLabelSnapshot: account.label,
                proxyLabelSnapshot: account.proxy?.label || account.proxy?.host || null,
                chargedAt: input.chargedAt ?? new Date(),
            },
        });

        if (accountConflict) {
            await flagOperationAccountConflict(input.operationId);
            return {
                status: 'conflict_review_required',
                ledgerId: row.id,
                reason: 'Operation beIN account differs from confirmed spend account.',
            };
        }

        return { status: 'created', ledgerId: row.id, spendAmount: row.spendAmount };
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const duplicate = await prisma.beinAccountSpendLedger.findUnique({
                where: { operationId: input.operationId },
                select: { id: true, spendAmount: true },
            });

            if (duplicate) {
                return { status: 'already_recorded', ledgerId: duplicate.id, spendAmount: duplicate.spendAmount };
            }
        }

        throw error;
    }
}
