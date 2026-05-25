import type { PrismaClient, Role } from '@prisma/client';

type PointsPrisma = Pick<
    PrismaClient,
    'operation' | 'pointProgramSettings' | 'pointRule' | 'pointLedgerEntry'
>;

type Recipient = {
    ownerUserId: string;
    ownerRole: Extract<Role, 'USER' | 'AGENT' | 'MANAGER'>;
    ownerKind: Extract<Role, 'USER' | 'AGENT' | 'MANAGER'>;
};

function roundPoints(value: number): number {
    return Math.round(value * 10000) / 10000;
}

async function activeRuleRate(
    prisma: PointsPrisma,
    ownerType: 'USER_GLOBAL' | 'AGENT_DEFAULT' | 'AGENT_OVERRIDE' | 'MANAGER_DEFAULT' | 'MANAGER_OVERRIDE',
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
        select: { pointsEnabled: true, pointsStartAt: true },
    });

    if (!settings?.pointsEnabled) return;
    if (settings.pointsStartAt && operation.completedAt < settings.pointsStartAt) return;

    const recipients: Recipient[] = [];
    const manager = operation.user.managerLink[0]?.manager;
    const agent = operation.user.agentAssignmentAsUser[0]?.agent;

    if (manager?.role === 'MANAGER' && manager.isActive && !manager.deletedAt) {
        recipients.push({ ownerUserId: manager.id, ownerRole: 'MANAGER', ownerKind: 'MANAGER' });
    } else {
        if (operation.user.role === 'USER' && operation.user.isActive && !operation.user.deletedAt) {
            recipients.push({ ownerUserId: operation.user.id, ownerRole: 'USER', ownerKind: 'USER' });
        }
        if (agent?.role === 'AGENT' && agent.isActive && !agent.deletedAt) {
            recipients.push({ ownerUserId: agent.id, ownerRole: 'AGENT', ownerKind: 'AGENT' });
        }
    }

    const entries = [];
    for (const recipient of recipients) {
        const rate = await spendRate(prisma, recipient);
        const points = roundPoints((operation.amount / 1000) * Math.max(0, rate));
        if (points <= 0) continue;

        entries.push({
            ownerUserId: recipient.ownerUserId,
            ownerRoleAtTime: recipient.ownerRole,
            sourceType: 'OPERATION_SPEND' as const,
            sourceId: operation.id,
            operationId: operation.id,
            points,
            status: 'AVAILABLE' as const,
            ratePerThousandSnapshot: rate,
            amountUsdSnapshot: operation.amount,
            notes: `Spend points for completed operation ${operation.id}`,
        });
    }

    if (entries.length === 0) return;

    await prisma.pointLedgerEntry.createMany({
        data: entries,
        skipDuplicates: true,
    });
}
