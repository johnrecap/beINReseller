import { Prisma, type PrismaClient } from '@prisma/client';
import {
    buildOperationSpendAwardEntries,
    resolveOperationPointRecipients,
} from '../../../shared/points/operation-spend-policy';
import type {
    AwardableUser,
    OperationPointRecipient,
    RatedOperationPointRecipient,
} from '../../../shared/points/operation-spend-policy';
import {
    captureOperationSpendAwardRunInTransaction as captureAwardRun,
    finalizeOperationSpendAwardRunInDatabase,
    type AwardRunDatabase,
    type AwardRunTransaction,
    type OperationSpendAwardRunCreateData,
    type OperationSpendAwardRunUpdateData,
    type OperationSpendCaptureResult,
    type OperationSpendFinalizationResult,
    type OperationSpendLedgerCreateData,
} from '../../../shared/points/operation-spend-award-runs';

type WorkerAwardableUser = {
    id: string;
    role: string;
    isActive: boolean;
    deletedAt: Date | string | null;
    createdBy?: WorkerAwardableUser | null;
};

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

function runCreateData(
    data: OperationSpendAwardRunCreateData
): Prisma.OperationSpendAwardRunUncheckedCreateInput {
    return data;
}

function runUpdateData(
    data: OperationSpendAwardRunUpdateData
): Prisma.OperationSpendAwardRunUncheckedUpdateInput {
    return data;
}

function runUpdateManyData(
    data: OperationSpendAwardRunUpdateData
): Prisma.OperationSpendAwardRunUncheckedUpdateManyInput {
    return data;
}

function ledgerCreateData(
    data: OperationSpendLedgerCreateData[]
): Prisma.PointLedgerEntryCreateManyInput[] {
    return data;
}

function prismaAwardRunTransaction(transaction: Prisma.TransactionClient): AwardRunTransaction {
    return {
        $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> {
            return transaction.$queryRaw<T>(query);
        },
        operation: {
            findUnique: (args) => transaction.operation.findUnique(
                args as Prisma.OperationFindUniqueArgs
            ) as never,
        },
        pointProgramSettings: {
            findUnique: (args) => transaction.pointProgramSettings.findUnique(
                args as Prisma.PointProgramSettingsFindUniqueArgs
            ) as never,
        },
        pointRule: {
            findMany: (args) => transaction.pointRule.findMany(
                args as Prisma.PointRuleFindManyArgs
            ) as never,
        },
        operationSpendAwardRun: {
            findUnique: (args) => transaction.operationSpendAwardRun.findUnique(
                args as Prisma.OperationSpendAwardRunFindUniqueArgs
            ),
            create: ({ data }) => transaction.operationSpendAwardRun.create({
                data: runCreateData(data),
            }),
            upsert: ({ where, create, update }) => transaction.operationSpendAwardRun.upsert({
                where,
                create: runCreateData(create),
                update: runUpdateData(update),
            }),
            update: ({ where, data }) => transaction.operationSpendAwardRun.update({
                where,
                data: runUpdateData(data),
            }),
            updateMany: ({ where, data }) => transaction.operationSpendAwardRun.updateMany({
                where,
                data: runUpdateManyData(data),
            }),
        },
        pointLedgerEntry: {
            findFirst: (args) => transaction.pointLedgerEntry.findFirst(
                args as Prisma.PointLedgerEntryFindFirstArgs
            ),
            count: (args) => transaction.pointLedgerEntry.count(
                args as Prisma.PointLedgerEntryCountArgs
            ),
            createMany: ({ data }) => transaction.pointLedgerEntry.createMany({
                data: ledgerCreateData(data),
            }),
        },
    };
}

export async function captureOperationSpendAwardRunInTransaction(
    transaction: Prisma.TransactionClient,
    operationId: string,
    completionSource: string,
    completedAt: Date
): Promise<OperationSpendCaptureResult> {
    const capture = await captureAwardRun(
        prismaAwardRunTransaction(transaction),
        operationId,
        completionSource,
        completedAt
    );
    if (capture.outcome === 'CONFLICT') {
        throw new Error('AWARD_RUN_CONFLICT');
    }
    return capture;
}

export async function finalizeOperationSpendAwardRun(
    prismaClient: PrismaClient,
    operationId: string
): Promise<OperationSpendFinalizationResult> {
    const database: AwardRunDatabase = {
        $transaction<T>(work: (transaction: AwardRunTransaction) => Promise<T>): Promise<T> {
            return prismaClient.$transaction((transaction) => work(prismaAwardRunTransaction(transaction)));
        },
    };
    return finalizeOperationSpendAwardRunInDatabase(operationId, database);
}
