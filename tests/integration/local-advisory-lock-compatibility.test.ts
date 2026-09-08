import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// Only transaction-scoped synthetic locks: no application rows or provider imports.
const enabled = process.env.RUN_LOCAL_LOCK_SMOKE === '1'
const sources = [
    'src/lib/operations/renewal-creation-guard.ts',
    'src/lib/operations/card-lifecycle-reservation.ts',
    'src/lib/renewal-payment-refund-finalization.ts',
    'worker/src/lib/provider-account-reservation.ts',
]

test('actual advisory SQL is Prisma-compatible and remains exclusive until transaction end', {
    skip: enabled ? false : 'Explicit local lock smoke opt-in required',
}, async () => {
    const url = new URL(process.env.DATABASE_URL || '')
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol))
    assert.equal(url.hostname, '127.0.0.1')
    assert.equal(url.port, '5433')
    assert.equal(url.pathname, '/deshpanel_work_20260907')
    assert.equal(url.search, '?schema=public')
    assert.equal(url.hash, '')
    const { PrismaClient, Prisma } = await import('@prisma/client')
    const { PrismaPg } = await import('@prisma/adapter-pg')
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href, max: 2 }) })
    try {
        for (const source of sources) {
            // Execute the source's real tagged SQL with a synthetic parameter.
            // A queryRaw mock would hide the reported void deserialization bug.
            const matches = [...readFileSync(source, 'utf8').matchAll(/\$queryRaw`(SELECT pg_advisory_xact_lock[^`]+)`/g)]
            assert.equal(matches.length, 1, source)
            const fragments = matches[0][1].split(/\$\{\w+\}/)
            assert.equal(fragments.length, 2, source)
            const key = `local-lock-smoke:${randomUUID()}`
            await client.$transaction(async (tx) => {
                await tx.$queryRaw(Prisma.sql(fragments, key))
                const held = await tx.$queryRaw<Array<{ held: boolean }>>`
                    SELECT EXISTS (SELECT 1 FROM pg_locks
                        WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted) AS held`
                assert.equal(held[0].held, true, source)
                await client.$transaction(async (other) => {
                    const result = await other.$queryRaw<Array<{ acquired: boolean }>>`
                        SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS acquired`
                    assert.equal(result[0].acquired, false, source)
                })
            })
            await client.$transaction(async (tx) => {
                const result = await tx.$queryRaw<Array<{ acquired: boolean }>>`
                    SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS acquired`
                assert.equal(result[0].acquired, true, source)
            })
        }
    } finally {
        await client.$disconnect()
    }
})
