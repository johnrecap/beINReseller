import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import * as zlib from 'node:zlib'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { recoverBeinAccount } from '../../src/lib/bein-account-recovery'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'

// Never fall back to application credentials or .env. These services must be disposable.
const databaseUrl = process.env.BEIN_LOGIN_TEST_DATABASE_URL
const redisUrl = process.env.BEIN_LOGIN_TEST_REDIS_URL
for (const value of [databaseUrl, redisUrl].filter(Boolean)) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value!).hostname)) throw new Error('Loopback test services required')
}
if (databaseUrl && new URL(databaseUrl).pathname !== '/bein_login_recovery_test') throw new Error('Dedicated test database required')
if (redisUrl && new URL(redisUrl).pathname !== '/15') throw new Error('Dedicated Redis database 15 required')

test('native PostgreSQL + Redis: recovery fences two stale workers and preserves ownership and unrelated state', {
    skip: !databaseUrl || !redisUrl, timeout: 30_000,
}, async () => {
    const suffix = randomUUID().replaceAll('-', '')
    const schema = `qa_login_${suffix}`
    const admin = new Pool({ connectionString: databaseUrl })
    const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` })
    const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) })
    const redis = new Redis(redisUrl!, { maxRetriesPerRequest: 1, connectTimeout: 2000 })
    const ids = ['a', 'b', 'c'].map(id => `qa-${suffix}-${id}`)
    const id = ids[0], lock = `bein:account:lock:${id}`
    const keys = [lock, `bein:account:execution-lease:${id}`, `bein:session:v2:${id}:direct`, `bein:session:${id}`,
        `bein:session:v2:${ids[1]}:direct`, `bein:operation-session:qa-${suffix}`, `bein:account:${id}:requests`]
    try {
        await admin.query(`CREATE SCHEMA "${schema}"`)
        await pool.query(`CREATE TABLE bein_accounts (
            id text PRIMARY KEY, is_active boolean NOT NULL DEFAULT true,
            consecutive_login_failures integer NOT NULL DEFAULT 0, last_login_attempt_at timestamp(3),
            last_login_failure_at timestamp(3), last_login_failure_reason text, last_successful_login_at timestamp(3),
            consecutive_failures integer NOT NULL DEFAULT 0, last_error text, last_error_at timestamp(3),
            updated_at timestamp(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'), dealer_balance numeric NOT NULL DEFAULT 100);
            CREATE TABLE bein_account_sessions (id text PRIMARY KEY, account_id text, is_valid boolean, updated_at timestamp(3));
            CREATE TABLE provider_account_causal_reservations (id text PRIMARY KEY, bein_account_id text, released_at timestamp(3));`)
        for (const account of ids) await pool.query('INSERT INTO bein_accounts(id) VALUES($1)', [account])
        await pool.query('INSERT INTO bein_account_sessions VALUES($1,$2,true,now())', ['session', id])
        const tracking = loadIsolatedModule<any>('worker/src/lib/bein-login-tracking.ts', {
            './prisma': { prisma: { $executeRaw: db.$executeRaw.bind(db), setting: { findUnique: async () => ({ value: '3' }) } } },
        })
        const state = async () => (await pool.query('SELECT * FROM bein_accounts WHERE id=$1', [id])).rows[0]
        // Match HttpClientService's Prisma Date decoding, not pg's local-time timestamp parser.
        const revisionNow = async () => (await db.beinAccount.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt
        const oldRevision = await revisionNow()
        await recoverBeinAccount(db, redis, id, true)
        await Promise.all([1, 2].map(() => tracking.recordLoginFailure(id, 'Invalid username or password', oldRevision)))
        assert.equal((await state()).consecutive_login_failures, 0)
        assert.equal((await state()).is_active, true)
        for (let round = 0; round < 5; round++) {
            const revision = await revisionNow()
            await Promise.all([recoverBeinAccount(db, redis, id, true),
                tracking.recordLoginFailure(id, 'Invalid username or password', revision),
                tracking.recordLoginFailure(id, 'Invalid username or password', revision)])
            assert.equal((await state()).consecutive_login_failures, 0)
            assert.equal((await state()).is_active, true)
        }
        for (let i = 0; i < 3; i++) await tracking.recordLoginFailure(id, 'Invalid username or password', await revisionNow())
        assert.equal((await state()).consecutive_login_failures, 3)
        assert.equal((await state()).is_active, false)
        await recoverBeinAccount(db, redis, id, false)
        assert.equal((await state()).is_active, false, 'counter-only reset must not activate')

        await redis.set(lock, 'foreign-owner', 'EX', 20)
        await assert.rejects(recoverBeinAccount(db, redis, id, true), /BEIN_ACCOUNT_BUSY/)
        assert.equal(await redis.get(lock), 'foreign-owner')
        await redis.del(lock)
        await pool.query('INSERT INTO provider_account_causal_reservations VALUES($1,$2,NULL)', ['reservation', id])
        await assert.rejects(recoverBeinAccount(db, redis, id, true), /BEIN_ACCOUNT_BUSY/)
        await pool.query('UPDATE provider_account_causal_reservations SET released_at=now()')
        for (const key of keys.slice(2)) await redis.set(key, 'retained', 'EX', 60)
        await recoverBeinAccount(db, redis, id, true)
        assert.equal(await redis.get(keys[2]), null)
        assert.equal(await redis.get(keys[3]), null)
        for (const key of keys.slice(4)) assert.equal(await redis.get(key), 'retained')
        assert.equal((await state()).dealer_balance, '100')
        const others = (await pool.query('SELECT is_active, consecutive_login_failures FROM bein_accounts WHERE id=ANY($1)', [ids.slice(1)])).rows
        assert.ok(others.every(row => row.is_active && row.consecutive_login_failures === 0))
        assert.equal((await pool.query('SELECT is_valid FROM bein_account_sessions')).rows[0].is_valid, false)

        const cache = loadIsolatedModule<any>('worker/src/lib/session-cache.ts', { './redis': { getRedisConnection: () => redis },
            '../pool/account-locking': {}, zlib })
        await redis.set(lock, 'new-owner', 'EX', 20)
        await assert.rejects(cache.saveSessionToCache(id, 'direct', { cookies: [] }, 15, { key: lock, owner: 'old-owner' }), /GUARD_LOST/)
        assert.equal(await redis.get(keys[2]), null, 'late cache write must be fenced atomically')
        await redis.set(keys[2], JSON.stringify({ accountId: ids[1], cookies: 'wrong-account', expiresAt: Date.now() + 60_000 }))
        assert.equal(await cache.getSessionFromCache(id, 'direct'), null, 'mismatched account cookies cannot be imported')
    } finally {
        await redis.del(...keys).catch(() => undefined)
        redis.disconnect()
        await db.$disconnect()
        await pool.end()
        // Only the uniquely generated schema in the explicitly named disposable database.
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        await admin.end()
    }
})
