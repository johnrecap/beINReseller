import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

export const INTEGRITY_EPSILON = 0.01;

type IntegrityIssueType =
    | 'NO_BEIN_BALANCE_CHANGE'
    | 'BEIN_DEBIT_NO_USER_DEDUCT'
    | 'BEIN_DEBIT_USER_UNDERDEDUCTED'
    | 'TELEMETRY_MISSING';

const ALL_INTEGRITY_ISSUE_TYPES: IntegrityIssueType[] = [
    'NO_BEIN_BALANCE_CHANGE',
    'BEIN_DEBIT_NO_USER_DEDUCT',
    'BEIN_DEBIT_USER_UNDERDEDUCTED',
    'TELEMETRY_MISSING'
];

interface IntegrityEvaluationInput {
    operationAmount: number;
    userDeductAmount: number;
    beinBalanceBefore: number | null;
    beinBalanceAfter: number | null;
    trackTelemetryMissing: boolean;
}

interface IntegritySnapshotInput {
    operationId: string;
    beinBalanceBefore?: number;
    beinBalanceAfter?: number;
    beinUsernameSnapshot?: string;
    userBalanceBefore?: number;
    userBalanceAfter?: number;
}

interface EvaluatedIssue {
    issueType: IntegrityIssueType;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    beinDelta: number | null;
    details: Record<string, unknown>;
}

function toNullableNumber(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    return value;
}

function resolveSnapshotsFromResponseData(responseData: unknown): {
    beinBalanceBefore: number | null;
    beinBalanceAfter: number | null;
    beinUsernameSnapshot: string | null;
    userBalanceBefore: number | null;
    userBalanceAfter: number | null;
    hasAuditSnapshot: boolean;
} {
    let parsed: Record<string, unknown> | null = null;
    if (typeof responseData === 'string') {
        try {
            parsed = JSON.parse(responseData) as Record<string, unknown>;
        } catch {
            parsed = null;
        }
    } else if (responseData && typeof responseData === 'object') {
        parsed = responseData as Record<string, unknown>;
    }

    const empty = {
        beinBalanceBefore: null,
        beinBalanceAfter: null,
        beinUsernameSnapshot: null,
        userBalanceBefore: null,
        userBalanceAfter: null,
        hasAuditSnapshot: false
    };

    if (!parsed || typeof parsed.auditSnapshot !== 'object' || !parsed.auditSnapshot) {
        return empty;
    }

    const auditSnapshot = parsed.auditSnapshot as Record<string, unknown>;
    return {
        beinBalanceBefore: toNullableNumber(auditSnapshot.beinBalanceBefore),
        beinBalanceAfter: toNullableNumber(auditSnapshot.beinBalanceAfter),
        beinUsernameSnapshot: typeof auditSnapshot.beinUsername === 'string' ? auditSnapshot.beinUsername : null,
        userBalanceBefore: toNullableNumber(auditSnapshot.userBalanceBefore),
        userBalanceAfter: toNullableNumber(auditSnapshot.userBalanceAfter),
        hasAuditSnapshot: true
    };
}

function evaluateIntegrityIssues(input: IntegrityEvaluationInput): EvaluatedIssue[] {
    const issues: EvaluatedIssue[] = [];
    const {
        operationAmount,
        userDeductAmount,
        beinBalanceBefore,
        beinBalanceAfter,
        trackTelemetryMissing
    } = input;

    if (operationAmount <= 0) {
        return issues;
    }

    if (beinBalanceBefore === null || beinBalanceAfter === null) {
        if (trackTelemetryMissing) {
            issues.push({
                issueType: 'TELEMETRY_MISSING',
                severity: 'HIGH',
                beinDelta: null,
                details: {
                    reason: 'Missing beIN balance snapshot for completed paid operation',
                    beinBalanceBefore,
                    beinBalanceAfter
                }
            });
        }
        return issues;
    }

    const beinDelta = beinBalanceBefore - beinBalanceAfter;

    if (beinDelta <= INTEGRITY_EPSILON) {
        issues.push({
            issueType: 'NO_BEIN_BALANCE_CHANGE',
            severity: 'HIGH',
            beinDelta,
            details: {
                reason: 'Paid operation completed without beIN balance reduction',
                beinDelta,
                epsilon: INTEGRITY_EPSILON
            }
        });
    }

    if (beinDelta > INTEGRITY_EPSILON && userDeductAmount <= INTEGRITY_EPSILON) {
        issues.push({
            issueType: 'BEIN_DEBIT_NO_USER_DEDUCT',
            severity: 'HIGH',
            beinDelta,
            details: {
                reason: 'beIN balance reduced but no user deduction transaction found',
                userDeductAmount,
                beinDelta,
                epsilon: INTEGRITY_EPSILON
            }
        });
    } else if (beinDelta > userDeductAmount + INTEGRITY_EPSILON) {
        issues.push({
            issueType: 'BEIN_DEBIT_USER_UNDERDEDUCTED',
            severity: 'HIGH',
            beinDelta,
            details: {
                reason: 'beIN balance reduced more than recorded user deduction',
                userDeductAmount,
                beinDelta,
                epsilon: INTEGRITY_EPSILON
            }
        });
    }

    return issues;
}

async function upsertIssue(params: {
    operationId: string;
    userId: string | null;
    beinAccountId: string | null;
    operationAmount: number;
    userDeductAmount: number;
    beinUsernameSnapshot: string | null;
    userBalanceBefore: number | null;
    userBalanceAfter: number | null;
    beinBalanceBefore: number | null;
    beinBalanceAfter: number | null;
    issue: EvaluatedIssue;
}): Promise<void> {
    const {
        operationId,
        userId,
        beinAccountId,
        operationAmount,
        userDeductAmount,
        beinUsernameSnapshot,
        userBalanceBefore,
        userBalanceAfter,
        beinBalanceBefore,
        beinBalanceAfter,
        issue
    } = params;

    const now = new Date();
    const issueWhere = {
        operationId_issueType: {
            operationId,
            issueType: issue.issueType
        }
    } as const;

    await prisma.$transaction(async (tx) => {
        await tx.operationIntegrityIssue.upsert({
            where: issueWhere,
            create: {
                operationId,
                userId,
                beinAccountId,
                issueType: issue.issueType,
                severity: issue.severity,
                status: 'OPEN',
                operationAmount,
                userDeductAmount,
                beinUsernameSnapshot,
                userBalanceBefore,
                userBalanceAfter,
                beinBalanceBefore,
                beinBalanceAfter,
                beinDelta: issue.beinDelta,
                details: issue.details as Prisma.InputJsonValue,
                detectedAt: now,
                lastSeenAt: now
            },
            update: {
                severity: issue.severity,
                operationAmount,
                userDeductAmount,
                beinUsernameSnapshot,
                userBalanceBefore,
                userBalanceAfter,
                beinBalanceBefore,
                beinBalanceAfter,
                beinDelta: issue.beinDelta,
                details: issue.details as Prisma.InputJsonValue,
                lastSeenAt: now
            }
        });

        await tx.operationIntegrityIssue.updateMany({
            where: {
                operationId,
                issueType: issue.issueType,
                status: 'RESOLVED'
            },
            data: { status: 'OPEN' }
        });
    });
}

function hasDirectSnapshotInput(input: IntegritySnapshotInput): boolean {
    return (
        input.beinBalanceBefore !== undefined ||
        input.beinBalanceAfter !== undefined ||
        input.beinUsernameSnapshot !== undefined ||
        input.userBalanceBefore !== undefined ||
        input.userBalanceAfter !== undefined
    );
}

async function resolveStaleIssues(operationId: string, detectedIssueTypes: IntegrityIssueType[]): Promise<void> {
    const staleIssueTypes = ALL_INTEGRITY_ISSUE_TYPES.filter(
        (issueType) => !detectedIssueTypes.includes(issueType)
    );
    if (staleIssueTypes.length === 0) return;

    await prisma.operationIntegrityIssue.updateMany({
        where: {
            operationId,
            issueType: { in: staleIssueTypes },
            status: { in: ['OPEN', 'ACKNOWLEDGED'] }
        },
        data: {
            status: 'RESOLVED',
            reviewNote: 'Auto-resolved by latest integrity re-check',
            lastSeenAt: new Date()
        }
    });
}

export async function detectAndRecordOperationIntegrity(
    input: IntegritySnapshotInput
): Promise<void> {
    try {
        const operation = await prisma.operation.findUnique({
            where: { id: input.operationId },
            select: {
                id: true,
                userId: true,
                beinAccountId: true,
                amount: true,
                status: true,
                responseData: true,
                beinAccount: {
                    select: { username: true }
                }
            }
        });

        if (!operation || operation.status !== 'COMPLETED') {
            return;
        }

        const operationAmount = operation.amount || 0;
        if (operationAmount <= 0) {
            return;
        }

        const deductionAgg = await prisma.transaction.aggregate({
            where: {
                operationId: input.operationId,
                type: 'OPERATION_DEDUCT'
            },
            _sum: { amount: true }
        });

        const userDeductAmount = Math.abs(deductionAgg._sum.amount || 0);
        const responseDataSnapshot = resolveSnapshotsFromResponseData(operation.responseData);
        const beinBalanceBefore = toNullableNumber(input.beinBalanceBefore ?? responseDataSnapshot.beinBalanceBefore);
        const beinBalanceAfter = toNullableNumber(input.beinBalanceAfter ?? responseDataSnapshot.beinBalanceAfter);
        const beinUsernameSnapshot =
            input.beinUsernameSnapshot ??
            responseDataSnapshot.beinUsernameSnapshot ??
            operation.beinAccount?.username ??
            null;
        const userBalanceBefore = toNullableNumber(input.userBalanceBefore ?? responseDataSnapshot.userBalanceBefore);
        const userBalanceAfter = toNullableNumber(input.userBalanceAfter ?? responseDataSnapshot.userBalanceAfter);
        const trackTelemetryMissing =
            hasDirectSnapshotInput(input) ||
            responseDataSnapshot.hasAuditSnapshot;

        const issues = evaluateIntegrityIssues({
            operationAmount,
            userDeductAmount,
            beinBalanceBefore,
            beinBalanceAfter,
            trackTelemetryMissing
        });

        for (const issue of issues) {
            await upsertIssue({
                operationId: input.operationId,
                userId: operation.userId || null,
                beinAccountId: operation.beinAccountId || null,
                operationAmount,
                userDeductAmount,
                beinUsernameSnapshot,
                userBalanceBefore,
                userBalanceAfter,
                beinBalanceBefore,
                beinBalanceAfter,
                issue
            });
        }

        await resolveStaleIssues(input.operationId, issues.map((issue) => issue.issueType));
    } catch (error) {
        console.error('[IntegrityDetector] Failed to detect integrity issues:', error);
    }
}
