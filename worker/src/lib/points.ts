import type { PrismaClient, Role } from '@prisma/client';

type PointsPrisma = Pick<
    PrismaClient,
    'operation' | 'pointProgramSettings' | 'pointRule' | 'pointLedgerEntry'
>;

type RateKind = Extract<Role, 'USER' | 'AGENT' | 'MANAGER'> | 'MANAGER_OWNED_USER';

type Recipient = {
    ownerUserId: string;
    ownerRole: Extract<Role, 'USER' | 'AGENT' | 'MANAGER'>;
    ownerKind: RateKind;
};

type WorkerAwardableUser = {
    id: string;
    role: string;
    isActive: boolean;
    deletedAt: Date | string | null;
};

function roundPoints(value: number): number {
    return Math.round(value * 10000) / 10000;
}

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

async function spendRate(prisma: PointsPrisma, recipient: Recipient): Promise<number> {
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

function isReceivableUser(user: WorkerAwardableUser | null | undefined, role: 'USER' | 'AGENT' | 'MANAGER'): user is WorkerAwardableUser {
    return Boolean(user && user.role === role && user.isActive && !user.deletedAt);
}

export function resolveWorkerOperationPointRecipients(input: {
    operationUser: WorkerAwardableUser;
    manager: WorkerAwardableUser | null | undefined;
    agent: WorkerAwardableUser | null | undefined;
    managerOwnedUserPointsEnabled?: boolean;
}): Recipient[] {
    if (isReceivableUser(input.manager, 'MANAGER')) {
        const recipients: Recipient[] = [{
            ownerUserId: input.manager.id,
            ownerRole: 'MANAGER',
            ownerKind: 'MANAGER',
        }];

        if (input.managerOwnedUserPointsEnabled && isReceivableUser(input.operationUser, 'USER')) {
            recipients.push({
                ownerUserId: input.operationUser.id,
                ownerRole: 'USER',
                ownerKind: 'MANAGER_OWNED_USER',
            });
        }

        return recipients;
    }

    const recipients: Recipient[] = [];
    if (isReceivableUser(input.operationUser, 'USER')) {
        recipients.push({ ownerUserId: input.operationUser.id, ownerRole: 'USER', ownerKind: 'USER' });
    }
    if (isReceivableUser(input.agent, 'AGENT')) {
        recipients.push({ ownerUserId: input.agent.id, ownerRole: 'AGENT', ownerKind: 'AGENT' });
    }

    return recipients;
}

export function buildWorkerPointEntries(input: {
    operationId: string;
    amountUsd: number;
    recipients: Array<Recipient & { ratePerThousand: number }>;
}) {
    return input.recipients.flatMap((recipient) => {
        const rate = Math.max(0, recipient.ratePerThousand);
        const points = roundPoints((Math.max(0, input.amountUsd) / 1000) * rate);
        if (points <= 0) return [];

        return [{
            ownerUserId: recipient.ownerUserId,
            ownerRoleAtTime: recipient.ownerRole,
            sourceType: 'OPERATION_SPEND' as const,
            sourceId: input.operationId,
            operationId: input.operationId,
            points,
            status: 'AVAILABLE' as const,
            ratePerThousandSnapshot: rate,
            amountUsdSnapshot: Math.max(0, input.amountUsd),
            notes: `Spend points for completed operation ${input.operationId}`,
        }];
    });
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
                    managerLink: {
                        take: 1,
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

    if (
        !operation
        || operation.type !== 'RENEW'
        || operation.status !== 'COMPLETED'
        || operation.amount <= 0
        || !operation.completedAt
        || !operation.user
    ) {
        return;
    }

    const settings = await prisma.pointProgramSettings.findUnique({
        where: { id: 'default' },
        select: { pointsEnabled: true, pointsStartAt: true, managerOwnedUserPointsEnabled: true },
    });

    if (!settings?.pointsEnabled) return;
    if (settings.pointsStartAt && operation.completedAt < settings.pointsStartAt) return;

    const manager = operation.user.managerLink[0]?.manager;
    const agent = operation.user.agentAssignmentAsUser[0]?.agent;

    const recipients = resolveWorkerOperationPointRecipients({
        operationUser: operation.user,
        manager,
        agent,
        managerOwnedUserPointsEnabled: settings.managerOwnedUserPointsEnabled,
    });

    const ratedRecipients = [];
    for (const recipient of recipients) {
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
