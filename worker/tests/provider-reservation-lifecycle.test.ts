import test from 'node:test'
import assert from 'node:assert/strict'
import { acquireProviderAccountCausalReservation, assertActiveProviderAccountReservation,
    renewProviderAccountCausalReservation, transferProviderAccountCausalReservation,
    type ProviderAccountReservationDb } from '../src/lib/provider-account-reservation'

function fixture(status: string | null, released = false) {
    let writes = 0
    const calls: string[] = []
    const row = { operationId: 'operation', beinAccountId: 'account', reservationGeneration: 1,
        releasedAt: released ? new Date() : null }
    const db = {
        $queryRaw: async (sql: TemplateStringsArray) => { calls.push(sql.join('?')); return status ? [{ status }] : [] },
        providerAccountCausalReservation: {
            findUnique: async () => row,
            findFirst: async ({ where }: { where: { operation?: unknown; beinAccountId?: string } }) => {
                if (released) return null
                if (where.beinAccountId === 'other') return null
                if (where.operation && ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status ?? '')) return null
                return row
            },
            update: async () => { writes++; return row },
            create: async () => { writes++; return row },
            updateMany: async ({ where }: { where: { operation?: unknown } }) => {
                if (where.operation && ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status ?? '')) return { count: 0 }
                writes++; return { count: 1 }
            },
        },
    } as unknown as ProviderAccountReservationDb
    return { db, calls, writes: () => writes }
}
const input = { operationId: 'operation', beinAccountId: 'account', automaticWindowEndsAt: new Date(Date.now() + 60000) }

for (const status of ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', null]) {
    test(`late acquisition cannot reserve an ended/missing operation: ${status}`, async () => {
        const f = fixture(status, true)
        const result = await acquireProviderAccountCausalReservation(f.db, input)
        assert.notEqual(result.status, 'ACQUIRED')
        assert.notEqual(result.status, 'ALREADY_HELD')
        assert.equal(f.writes(), 0)
    })
}
test('active and review operations serialize the state read before reserving', async () => {
    for (const status of ['PROCESSING', 'COMPLETING', 'REVIEW_REQUIRED']) {
        const f = fixture(status)
        assert.equal((await acquireProviderAccountCausalReservation(f.db, input)).status, 'ALREADY_HELD')
        assert.match(f.calls[0], /FROM "operations".*FOR UPDATE/)
    }
})
test('terminal operation cannot renew, use or transfer a leftover account reservation', async () => {
    const f = fixture('COMPLETED')
    const owner = { ...input, reservationGeneration: 1 }
    assert.equal(await renewProviderAccountCausalReservation(f.db, owner), false)
    assert.equal(await assertActiveProviderAccountReservation(f.db, owner), false)
    assert.equal((await transferProviderAccountCausalReservation(f.db, {
        ...owner, fromBeinAccountId: 'account', toBeinAccountId: 'other',
    })).status, 'STALE_OWNER')
    assert.equal(f.writes(), 0)
})
