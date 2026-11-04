import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'

export class BeinAccountRecoveryError extends Error {
    constructor(readonly code: 'BEIN_ACCOUNT_BUSY' | 'BEIN_ACCOUNT_NOT_FOUND') { super(code) }
}

type RecoveryRedis = Pick<Redis, 'eval' | 'get' | 'scan'>

/** Manual, single-account recovery. Never remove rate keys, execution leases or operation sessions. */
export async function recoverBeinAccount(db: PrismaClient, redis: RecoveryRedis, id: string, activate: boolean,
    edit?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
    const lockKey = `bein:account:lock:${id}`
    const executionKey = `bein:account:execution-lease:${id}`
    const owner = `admin-recovery-${randomUUID()}`
    let acquired = false
    try {
        await db.$transaction(async tx => {
            const reservationKey = `provider-reservation:account:${id}`
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reservationKey}, 0))::text`
            const account = await tx.beinAccount.findUnique({ where: { id }, select: { id: true } })
            if (!account) throw new BeinAccountRecoveryError('BEIN_ACCOUNT_NOT_FOUND')
            acquired = await redis.eval(`
                if redis.call("exists", KEYS[1]) == 1 or redis.call("exists", KEYS[2]) == 1 then return 0 end
                redis.call("set", KEYS[1], ARGV[1], "EX", 30)
                return 1
            `, 2, lockKey, executionKey, owner) === 1
            if (!acquired) throw new BeinAccountRecoveryError('BEIN_ACCOUNT_BUSY')
            if (await tx.providerAccountCausalReservation.findFirst({ where: { beinAccountId: id, releasedAt: null }, select: { id: true } }))
                throw new BeinAccountRecoveryError('BEIN_ACCOUNT_BUSY')

            const prefix = `bein:session:v2:${id}:`
            const pattern = prefix.replace(/[?*\[\]\\]/g, '\\$&') + '*'
            const keys = new Set([`bein:session:${id}`])
            let cursor = '0'
            do {
                const page = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
                cursor = page[0]
                for (const key of page[1]) if (key.startsWith(prefix)) keys.add(key)
            } while (cursor !== '0')
            const cleared = await redis.eval(`
                if redis.call("get", KEYS[1]) ~= ARGV[1] or redis.call("exists", KEYS[2]) == 1 then return 0 end
                for i = 3, #KEYS do redis.call("del", KEYS[i]) end
                return 1
            `, keys.size + 2, lockKey, executionKey, ...keys, owner)
            if (cleared !== 1) throw new BeinAccountRecoveryError('BEIN_ACCOUNT_BUSY')

            // Keep a row lock across combined edits and health reset. Preserve the old
            // revision even when Prisma's application-clock updatedAt is behind it.
            const revisions = await tx.$queryRaw<Array<{ updated_at: Date }>>`SELECT "updated_at" FROM "bein_accounts" WHERE "id" = ${id} FOR UPDATE`
            const previousRevision = revisions[0]?.updated_at
            if (edit) await edit(tx)
            if (previousRevision) await tx.$executeRaw`UPDATE "bein_accounts" SET "updated_at" = GREATEST("updated_at", ${previousRevision}) WHERE "id" = ${id}`

            // Atomic revision advance fences any old login result that outlived its Redis guard.
            await tx.$executeRaw`UPDATE "bein_accounts" SET
                "consecutive_login_failures" = 0, "last_login_attempt_at" = NULL,
                "last_login_failure_at" = NULL, "last_login_failure_reason" = NULL,
                "is_active" = CASE WHEN ${activate} THEN true ELSE "is_active" END,
                "consecutive_failures" = CASE WHEN ${activate} THEN 0 ELSE "consecutive_failures" END,
                "last_error" = CASE WHEN ${activate} THEN NULL ELSE "last_error" END,
                "last_error_at" = CASE WHEN ${activate} THEN NULL ELSE "last_error_at" END,
                "cooldown_until" = CASE WHEN ${activate} THEN NULL ELSE "cooldown_until" END,
                "updated_at" = GREATEST(clock_timestamp() AT TIME ZONE 'UTC', "updated_at" + interval '1 millisecond')
                WHERE "id" = ${id}`
            await tx.beinAccountSession.updateMany({ where: { accountId: id }, data: { isValid: false } })
            if (await redis.get(lockKey) !== owner) throw new BeinAccountRecoveryError('BEIN_ACCOUNT_BUSY')
        }, { timeout: 20_000, maxWait: 5_000 })
    } finally {
        if (acquired) await redis.eval(`
            if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end
            return 0
        `, 1, lockKey, owner).catch(() => undefined)
    }
}
