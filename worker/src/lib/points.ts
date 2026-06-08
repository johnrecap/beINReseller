import type { PrismaClient } from '@prisma/client';
import {
    buildOperationSpendAwardEntries,
    resolveOperationPointRecipients,
    resolveOperationSpendAwardPolicy,
} from '../../../shared/points/operation-spend-policy';
import type {
    AwardableUser,
    OperationPointRecipient,
    RatedOperationPointRecipient,
} from '../../../shared/points/operation-spend-policy';

type PointsPrisma = Pick<
    PrismaClient,
    'operation' | 'pointProgramSettings' | 'pointRule' | 'pointLedgerEntry'
>;

type WorkerAwardableUser = {
    id: string;
    role: string;
    isActive: boolean;
    deletedAt: Date | string | null;
    createdBy?: WorkerAwardableUser | null;
};

async function activeRuleRate(
    prisma: PointsPrisma,
    ownerType: 'USER_GLOBAL' | 'MANAGER_OWNED_USER_DEFAULT' | 'AGENT_DEFAULT' | 'AGENT_OVERRIDE' | 'MANAGER_DEFAULT' | 'MANAGER_OVERRIDE',
    ownerUserId: string | null
): Promise<number | null> {
    const rule = await prisma.pointRule.findFirst({
        where: { ownerType, ownerUserId, isActive: true },
        orderBy: { updatedAt: 'desc' },
        select: { pointsPerThousand: true },
    });

    return rule?.pointsPerThousand ?? null;
}

async function spendRate(prisma: PointsPrisma, recipient: OperationPointRecipient): Promise<number> {
    if (recipient.ownerKind === 'USER') {
        return (await activeRuleRate(prisma, 'USER_GLOBAL', null)) ?? 0;
    }

    if (recipient.ownerKind === 'MANAGER_OWNED_USER') {
        return (await activeRuleRate(prisma, 'MANAGER_OWNED_USER_DEFAULT', null)) ?? 0;
    }

    if (recipient.ownerKind === 'AGENT') {
        const [defaultRate, overrideRate] = await Promise.all([
            activeRuleRate(prisma, 'AGENT_DEFAULT', null),
            activeRuleRate(prisma, 'AGENT_OVERRIDE', recipient.ownerUserId),
        ]);
        return Math.max(0, overrideRate ?? defaultRate ?? 0);
    }

    const [defaultRate, overrideRate] = await Promise.all([
        activeRuleRate(prisma, 'MANAGER_DEFAULT', null),
        activeRuleRate(prisma, 'MANAGER_OVERRIDE', recipient.ownerUserId),
    ]);
    return Math.max(0, overrideRate ?? defaultRate ?? 0);
}

export function resolveWorkerOperationPointRecipients(input: {
    operationUser: WorkerAwardableUser;
    manager: WorkerAwardableUser | null | undefined;
    agent: WorkerAwardableUser | null | undefined;
    managerOwnedUserPointsEnabled?: boolean;
}): OperationPointRecipient[] {
    return resolveOperationPointRecipients({
        operationUser: input.operationUser as AwardableUser,
        managerOwnership: input.manager ? { manager: input.manager as AwardableUser } : null,
        agentAssignment: input.agent ? { agent: input.agent as AwardableUser } : null,
        managerOwnedUserPointsEnabled: input.managerOwnedUserPointsEnabled,
    });
}

export function buildWorkerPointEntries(input: {
    operationId: string;
    amountUsd: number;
    recipients: RatedOperationPointRecipient[];
}) {
    return buildOperationSpendAwardEntries(input).map((entry) => ({
        ...entry,
        operationId: input.operationId,
    }));
}

export async function processCompletedOperationPoints(prisma: PointsPrisma, operationId: string): Promise<void> {
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            type: true,
            status: true,
            amount: true,
            completedAt: true,
            user: {
                select: {
                    id: true,
                    role: true,
                    isActive: true,
                    deletedAt: true,
                    createdBy: {
                        select: {
                            id: true,
                            role: true,
                            isActive: true,
                            deletedAt: true,
                        },
                    },
                    managerLink: {
                        take: 1,
                        orderBy: { createdAt: 'desc' },
                        select: {
                            manager: {
                                select: { id: true, role: true, isActive: true, deletedAt: true },
                            },
                        },
                    },
                    agentAssignmentAsUser: {
                        where: { isActive: true },
                        take: 1,
                        orderBy: { createdAt: 'desc' },
                        select: {
                            agent: {
                                select: { id: true, role: true, isActive: true, deletedAt: true },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!operation || !operation.user) {
        return;
    }

    const settings = await prisma.pointProgramSettings.findUnique({
        where: { id: 'default' },
        select: { pointsEnabled: true, pointsStartAt: true, managerOwnedUserPointsEnabled: true },
    });

    const policy = resolveOperationSpendAwardPolicy({
        status: operation.status,
        type: operation.type,
        amount: operation.amount,
        completedAt: operation.completedAt,
        settings: settings ?? {
            pointsEnabled: false,
            pointsStartAt: null,
            managerOwnedUserPointsEnabled: false,
        },
        operationUser: operation.user as AwardableUser,
        managerOwnership: operation.user.managerLink[0]?.manager
            ? { manager: operation.user.managerLink[0].manager as AwardableUser }
            : null,
        agentAssignment: operation.user.agentAssignmentAsUser[0]?.agent
            ? { agent: operation.user.agentAssignmentAsUser[0].agent as AwardableUser }
            : null,
    });

    if (!policy.eligible) return;

    const ratedRecipients: RatedOperationPointRecipient[] = [];
    for (const recipient of policy.recipients) {
        const rate = await spendRate(prisma, recipient);
        ratedRecipients.push({ ...recipient, ratePerThousand: rate });
    }

    const entries = buildWorkerPointEntries({
        operationId: operation.id,
        amountUsd: operation.amount,
        recipients: ratedRecipients,
    });

    if (entries.length === 0) return;

    await prisma.pointLedgerEntry.createMany({
        data: entries,
        skipDuplicates: true,
    });
}
