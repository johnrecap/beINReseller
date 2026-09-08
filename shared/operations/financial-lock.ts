import type { Prisma } from '@prisma/client'

// Admission and refund paths take these advisory keys before locking the operation.
export async function lockFinancialOperation(tx: Prisma.TransactionClient, operationId: string) {
    const initial = await tx.operation.findUnique({ where: { id: operationId }, select: { cardNumber: true } })
    if (!initial) return false
    for (const key of [`card-reservation:operation:${operationId}`, `card-reservation:card:${initial.cardNumber}`]) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`
    }
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "operations" WHERE "id" = ${operationId} FOR UPDATE`
    return locked.length === 1
}
