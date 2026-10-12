import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// Prisma's pinned dependency supplies an in-memory PostgreSQL engine. No URL,
// existing database, worker, Redis, credential or provider connection is used.
test('actual cooldown migration stamps every attempt outcome once using the database UTC clock', async () => {
    const db = new PGlite()
    try {
        await db.exec(`CREATE TYPE "OperationType" AS ENUM ('RENEW', 'CHECK_BALANCE', 'SIGNAL_REFRESH');
            CREATE TYPE "OperationPurpose" AS ENUM ('RENEWAL', 'INSTALLMENT', 'LEGACY_UNKNOWN');
            CREATE TYPE "OperationStatus" AS ENUM ('PENDING','PROCESSING','COMPLETING','COMPLETED','FAILED','CANCELLED','EXPIRED','REVIEW_REQUIRED');
            CREATE TABLE operations (id text PRIMARY KEY, card_number text NOT NULL, type "OperationType" NOT NULL,
                purpose "OperationPurpose", status "OperationStatus" NOT NULL, response_message text);
            INSERT INTO operations VALUES ('historical', '7000000001', 'RENEW', NULL, 'FAILED', NULL);`)
        await db.exec(readFileSync('prisma/migrations/20261012120000_renewal_card_cooldown/migration.sql', 'utf8'))
        await db.exec(`SET TIME ZONE 'Africa/Cairo'`)
        const deadline = async (id: string) => (await db.query<{ value: string | null }>(
            `SELECT renewal_cooldown_until::text AS value FROM operations WHERE id=$1`, [id])).rows[0].value
        assert.equal(await deadline('historical'), null, 'migration must not invent the end of an old attempt')
        await db.query(`UPDATE operations SET response_message='heartbeat' WHERE id='historical'`)
        assert.equal(await deadline('historical'), null)

        for (const status of ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REVIEW_REQUIRED']) {
            await db.query(`INSERT INTO operations(id,card_number,type,status) VALUES ($1,'7000000001','RENEW','PENDING')`, [status])
            assert.equal(await deadline(status), null, 'starting is not the cooldown anchor')
            await db.query(`UPDATE operations SET status=$2::"OperationStatus" WHERE id=$1`, [status, status])
            const original = await deadline(status)
            assert.ok(original)
            const remaining = (await db.query<{ seconds: number }>(`SELECT EXTRACT(EPOCH FROM
                (renewal_cooldown_until - (statement_timestamp() AT TIME ZONE 'UTC')))::float8 AS seconds
                FROM operations WHERE id=$1`, [status])).rows[0].seconds
            assert.ok(remaining > 295 && remaining <= 300, `${status}: ${remaining}`)
            await db.query(`UPDATE operations SET response_message='late Reports', renewal_cooldown_until=NULL WHERE id=$1`, [status])
            await db.query(`UPDATE operations SET status='COMPLETED', renewal_cooldown_until='2099-01-01' WHERE id=$1`, [status])
            assert.equal(await deadline(status), original, 'follow-up success or edits cannot extend the window')
        }
        await db.exec(`INSERT INTO operations(id,card_number,type,purpose,status) VALUES
            ('check','7000000001','CHECK_BALANCE',NULL,'COMPLETED'),
            ('signal','7000000001','SIGNAL_REFRESH',NULL,'FAILED'),
            ('installment','7000000001','RENEW','INSTALLMENT','FAILED'),
            ('second-attempt','7000000001','RENEW',NULL,'PENDING');`)
        for (const id of ['check', 'signal', 'installment', 'second-attempt']) assert.equal(await deadline(id), null)
        await db.query(`UPDATE operations SET status='FAILED' WHERE id='second-attempt'`)
        assert.ok(await deadline('second-attempt'), 'a different ended attempt receives its own deadline')
        await db.exec(`INSERT INTO operations(id,card_number,type,status) VALUES ('direct-failure','7000000002','RENEW','FAILED'),
            ('rollback','7000000003','RENEW','PENDING');`)
        assert.ok(await deadline('direct-failure'))
        await db.exec(`BEGIN; UPDATE operations SET status='FAILED' WHERE id='rollback';`)
        assert.ok(await deadline('rollback'))
        await db.exec('ROLLBACK;')
        assert.equal(await deadline('rollback'), null)
    } finally { await db.close() }
})
