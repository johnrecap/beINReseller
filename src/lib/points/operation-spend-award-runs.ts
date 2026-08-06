import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
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
} from '../../../shared/points/operation-spend-award-runs'

export * from '../../../shared/points/operation-spend-award-runs'

function runCreateData(
    data: OperationSpendAwardRunCreateData
): Prisma.OperationSpendAwardRunUncheckedCreateInput {
    return data
}

function runUpdateData(
    data: OperationSpendAwardRunUpdateData
): Prisma.OperationSpendAwardRunUncheckedUpdateInput {
    return data
}

function runUpdateManyData(
    data: OperationSpendAwardRunUpdateData
): Prisma.OperationSpendAwardRunUncheckedUpdateManyInput {
    return data
}

function ledgerCreateData(
    data: OperationSpendLedgerCreateData[]
): Prisma.PointLedgerEntryCreateManyInput[] {
    return data
}

function prismaAwardRunTransaction(transaction: Prisma.TransactionClient): AwardRunTransaction {
    return {
        $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> {
            return transaction.$queryRaw<T>(query)
        },
        operation: {
            findUnique: (args) => transaction.operation.findUnique(args) as never,
        },
        pointProgramSettings: {
            findUnique: (args) => transaction.pointProgramSettings.findUnique(args),
        },
        pointRule: {
            findMany: (args) => transaction.pointRule.findMany(args),
        },
        operationSpendAwardRun: {
            findUnique: (args) => transaction.operationSpendAwardRun.findUnique(args),
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
            findFirst: (args) => transaction.pointLedgerEntry.findFirst(args),
            count: (args) => transaction.pointLedgerEntry.count(args),
            createMany: ({ data }) => transaction.pointLedgerEntry.createMany({
                data: ledgerCreateData(data),
            }),
        },
    }
}

const defaultAwardRunDatabase: AwardRunDatabase = {
    $transaction<T>(work: (transaction: AwardRunTransaction) => Promise<T>): Promise<T> {
        return prisma.$transaction((transaction) => work(prismaAwardRunTransaction(transaction)))
    },
}

export async function captureOperationSpendAwardRunInTransaction(
    transaction: Prisma.TransactionClient,
    operationId: string,
    completionSource: string,
    completedAt: Date
): Promise<OperationSpendCaptureResult> {
    return captureAwardRun(
        prismaAwardRunTransaction(transaction),
        operationId,
        completionSource,
        completedAt
    )
}

export async function finalizeOperationSpendAwardRun(
    operationId: string,
    database: AwardRunDatabase = defaultAwardRunDatabase
): Promise<OperationSpendFinalizationResult> {
    return finalizeOperationSpendAwardRunInDatabase(operationId, database)
}
