import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'
import * as recovery from '../../src/lib/bein-account-recovery'

for (const action of ['reset', 'login-failures/reset']) {
    test(`${action} rejects a busy account without clearing another owner's lock`, async () => {
        const writes: unknown[] = [], deletes: string[] = []
        const db = {
            beinAccount: { findUnique: async () => ({ id: 'a', isActive: false }), update: async (input: unknown) => { writes.push(input) } },
            beinAccountSession: { updateMany: async (input: unknown) => { writes.push(input) } },
            $queryRaw: async () => [],
            $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
        }
        const redis = { eval: async () => 0, get: async () => 'another-owner', set: async () => null, del: async (key: string) => { deletes.push(key) }, disconnect: () => {} }
        const api = loadIsolatedModule<any>(`src/app/api/admin/bein-accounts/[id]/${action}/route.ts`, {
            'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: db },
            '@/lib/auth-utils': { requireRoleAPIWithMobile: async () => ({ user: { id: 'admin' } }) },
            '@/lib/bein-account-recovery': recovery,
            ioredis: { default: class { constructor() { return redis } } },
        })
        const result = await api.POST(new Request('http://localhost'), { params: Promise.resolve({ id: 'a' }) })
        assert.equal(result.status, 409)
        assert.deepEqual(writes, [])
        assert.deepEqual(deletes, [])
    })
}

for (const activate of [false, true]) test(`owned recovery keeps other accounts, operations and budgets intact (activate=${activate})`, async () => {
    let owner = '', sql = '', sqlValues: unknown[] = []
    const removed: string[] = [], invalidated: unknown[] = []
    const db: any = {
        $queryRaw: async () => [],
        beinAccount: { findUnique: async () => ({ id: 'a' }) },
        providerAccountCausalReservation: { findFirst: async () => null },
        beinAccountSession: { updateMany: async (value: unknown) => { invalidated.push(value) } },
        $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => { sql = parts.join('?'); sqlValues = values; return 1 },
        $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    }
    const redis: any = {
        get: async () => owner,
        scan: async () => ['0', ['bein:session:v2:a:direct', 'bein:session:v2:a:proxy:p', 'bein:session:v2:b:direct', 'bein:operation-session:op', 'bein:account:a:requests']],
        eval: async (_script: string, count: number, ...args: string[]) => {
            if (count === 2) { owner = args[2]; return 1 }
            if (count > 2) { removed.push(...args.slice(2, count)); return 1 }
            assert.equal(args[1], owner, 'release must compare the exact owner')
            return 1
        },
    }
    await recovery.recoverBeinAccount(db, redis, 'a', activate)
    assert.deepEqual(removed.sort(), ['bein:session:a', 'bein:session:v2:a:direct', 'bein:session:v2:a:proxy:p'].sort())
    assert.deepEqual(invalidated, [{ where: { accountId: 'a' }, data: { isValid: false } }])
    assert.match(sql, /"is_active" = CASE WHEN \? THEN true ELSE "is_active" END/)
    assert.equal(sqlValues[0], activate)
    assert.doesNotMatch(sql, /dealer_balance|invoice|operation|usage_count|last_used_at/)
    assert.match(sql, /"updated_at" \+ interval '1 millisecond'/)
})

for (const action of ['reset', 'login-failures/reset']) test(`${action} enforces ADMIN before any recovery`, async () => {
    const api = loadIsolatedModule<any>(`src/app/api/admin/bein-accounts/[id]/${action}/route.ts`, {
        'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: {} },
        '@/lib/auth-utils': { requireRoleAPIWithMobile: async () => ({ error: 'FORBIDDEN', status: 403 }) },
        '@/lib/bein-account-recovery': { ...recovery, recoverBeinAccount: () => { throw new Error('MUST_NOT_RUN') } },
        ioredis: {},
    })
    const result = await api.POST(new Request('http://localhost'), { params: Promise.resolve({ id: 'a' }) })
    assert.equal(result.status, 403)
})

test('failure list marks historical generic errors for review without claiming a password rejection', async () => {
    const accounts = [
        { id: 'a', consecutiveLoginFailures: 3, lastLoginFailureReason: 'Login failed - redirected to error page' },
        { id: 'b', consecutiveLoginFailures: 3, lastLoginFailureReason: 'Invalid username or password' },
    ]
    const api = loadIsolatedModule<any>('src/app/api/admin/bein-accounts/login-failures/route.ts', {
        'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma: { beinAccount: { findMany: async () => accounts } } },
        '@/lib/auth-utils': { requireRoleAPIWithMobile: async () => ({}) },
        '@/lib/get-bein-login-failure-threshold': { getBeinLoginFailureThreshold: async () => 3 },
    })
    const response = await api.GET(new Request('http://localhost'))
    const body = await response.json()
    assert.deepEqual(body.accounts.map((row: any) => row.needsPasswordUpdate), [false, true])
    assert.deepEqual(body.accounts.map((row: any) => row.requiresLoginReview), [true, true])
    assert.equal(accounts[0].lastLoginFailureReason, 'Login failed - redirected to error page')
})
