import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'

const date = new Date('2026-09-08T00:00:00.000Z')
type Query = { where?: { managerId?: string; user?: { deletedAt?: null } }; select?: unknown }
function fixture(role = 'MANAGER', denial?: number) {
    const calls: { kind: string; query: Query }[] = []
    const user = { id: 'linked', username: 'Synthetic', email: 'synthetic@example.invalid', balance: 12, isActive: false,
        createdAt: date, lastLoginAt: null, _count: { operations: 7 } }
    const db = {
        managerUser: {
            findMany: async (query: Query) => { calls.push({ kind: 'users', query }); return [{ user, createdAt: date }] },
            count: async (query: Query) => { calls.push({ kind: 'userCount', query }); return 1 },
        },
        userAction: {
            findMany: async (query: Query) => { calls.push({ kind: 'actions', query }); return [{ id: 'action', actionType: 'CREATE_USER', createdAt: date, details: null, user: { username: 'Synthetic' } }] },
            count: async (query: Query) => { calls.push({ kind: 'actionCount', query }); return 1 },
            groupBy: async (query: Query) => { calls.push({ kind: 'actionGroups', query }); return [] },
        },
        user: { findUnique: async () => ({ balance: 30 }) },
    }
    const service = existsSync('src/lib/manager-dashboard.ts')
        ? loadIsolatedModule('src/lib/manager-dashboard.ts', { '@/lib/prisma': { default: db } }) : {}
    const route = loadIsolatedModule<{ GET: (request: Request) => Promise<Response> }>('src/app/api/manager/dashboard/route.ts', {
        '@/lib/prisma': { default: db }, '@/lib/manager-dashboard': service,
        'next/server': { NextResponse: { json: Response.json.bind(Response) } },
        '@/lib/auth-utils': { requireRoleAPIWithMobile: async () => denial ? { error: 'Forbidden', status: denial } : { user: { id: 'manager-a', role } } },
        '@/lib/rate-limiter': { withRateLimit: async () => ({ allowed: true }), RATE_LIMITS: { manager: {} } },
    })
    return { calls, route }
}

test('dashboard exposes the operation count consumed by the table and serializable dates', async () => {
    const { route } = fixture()
    const res = await route.GET(new Request('http://panel.invalid/api/manager/dashboard'))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.recentUsers[0].operationsCount, 7)
    assert.equal(body.recentUsers[0]._count.operations, 7)
    assert.equal(body.recentUsers[0].linkedAt, date.toISOString())
    assert.equal(body.recentUsers[0].isActive, false)
    assert.equal(body.stats.totalBalance, 12)
    assert.equal(body.stats.managerBalance, 30)
})
for (const role of ['MANAGER', 'ADMIN']) test(`${role}: exclude deleted linked users without hiding action history`, async () => {
    const { calls, route } = fixture(role)
    await route.GET(new Request('http://panel.invalid/api/manager/dashboard'))
    for (const { kind, query } of calls) {
        assert.equal(query.where?.managerId, role === 'MANAGER' ? 'manager-a' : undefined)
        if (kind === 'users' || kind === 'userCount') assert.equal(query.where?.user?.deletedAt, null)
        else assert.equal(query.where?.user, undefined)
    }
})
test('dashboard denies revoked or wrong-role users before querying data', async () => {
    const { calls, route } = fixture('USER', 403)
    assert.equal((await route.GET(new Request('http://panel.invalid'))).status, 403)
    assert.equal(calls.length, 0)
})
test('server page uses the authorized shared query without self HTTP or cookie forwarding', async () => {
    const actor = { id: 'manager-a', role: 'MANAGER' }, data = { stats: { usersCount: 1 } }
    let authorized = false, queries = 0
    const page = loadIsolatedModule<{ default: () => Promise<{ props: { data: unknown } }> }>('src/app/dashboard/manager/page.tsx', {
        '@/lib/auth-utils': { requireManager: async () => { authorized = true; return actor } },
        '@/lib/manager-dashboard': { getManagerDashboardData: async (user: unknown) => { assert.ok(authorized); assert.equal(user, actor); queries++; return data } },
        'next/headers': { headers: () => { throw new Error('SELF_HTTP_FORBIDDEN') } },
        '@/components/manager/ManagerPageContent': { ManagerPageContent: () => null },
        'react/jsx-runtime': { jsx: (_component: unknown, props: unknown) => ({ props }) },
    })
    assert.equal((await page.default()).props.data, data)
    assert.equal(queries, 1)
})
