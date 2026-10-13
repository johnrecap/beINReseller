import test from 'node:test'
import assert from 'node:assert/strict'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'

const flush = () => new Promise<void>(resolve => setImmediate(resolve))
test('PM2 gives maintenance a bounded five-minute drain window', () => {
    const config = loadIsolatedModule<{ apps: { name: string; kill_timeout?: number }[] }>('ecosystem.config.js', {
        './deployment/panel-workers.cjs': { createPanelWorkers: () => [] },
    })
    assert.equal(config.apps.find(app => app.name === 'bein-maintenance')?.kill_timeout, 300000)
})
function fixture() {
    let tick: (() => void) | undefined, sequence = 0, owner: string | null = null
    let pending: Promise<void> | null = null, finish = () => {}, cycles = 0, failAcquire = false
    const tokens: string[] = [], events: string[] = [], signals: Record<string, () => Promise<void>> = {}
    const runner = loadIsolatedModule<{ startOperationMaintenanceRunner: (options?: { intervalMs?: number; leaderTtlMs?: number; once?: boolean }) => Promise<void> }>(
        'src/lib/maintenance/operation-maintenance-runner.ts', {
            'node:crypto': { default: { randomUUID: () => String(++sequence) } },
            '@/lib/prisma': { default: { operation: { findMany: async () => [] }, $disconnect: async () => { events.push('db-close') } } },
            '@/lib/redis': { default: {
                set: async (key: string, token: string) => {
                    if (key !== 'operation-maintenance:leader') return 'OK'
                    if (failAcquire) { failAcquire = false; throw new Error('synthetic connection failure') }
                    if (owner) return null
                    owner = token; tokens.push(token); return 'OK'
                },
                eval: async (_lua: string, _count: number, _key: string, token: string) => { events.push('release'); if (owner === token) owner = null },
                quit: async () => { events.push('redis-close') },
            } },
            '@/lib/operations/recovery': { recoverOperationIfNeeded: () => { throw new Error('UNEXPECTED_OPERATION') } },
            '@/lib/operation-dispatch': { runDispatchWatchdog: async () => { cycles++; if (pending) await pending; events.push('cycle-finished'); return { scanned: 0, recovered: 0, skipped: 0, retried: 0, review: 0, refunded: 0, errors: [] } } },
            '@/lib/maintenance/completion-effect-maintenance': { repairCompletionEffects: async () => ({ inspected: 0, delivered: 0, retryScheduled: 0, exhaustedCount: 0 }) },
            '@/lib/maintenance/provider-reservation-maintenance': { repairTerminalProviderReservations: async () => ({ inspected: 0, released: 0, held: 0, errors: [] }) },
            '@/lib/maintenance/renewal-hold-maintenance': { repairRenewalHolds: async () => ({ inspected: 0, repaired: 0, held: 0, errors: [] }) },
            '@/lib/maintenance/operation-spend-award-run-maintenance': { retryStaleCapturedOperationSpendAwardRuns: async () => ({ inspected: 0, awarded: 0, alreadyFinalized: 0, skipped: 0, notFound: 0, reviewRequired: 0, errors: [] }) },
            '@/lib/maintenance/renewal-fulfillment-verification-maintenance': { repairDueRenewalVerificationJobs: async () => ({ inspected: 0, enqueued: 0, alreadyQueued: 0, errors: [] }) },
        }, [], {}, {
            console: { log: () => {}, error: () => {} },
            process: { pid: 123, env: {}, on: (name: string, fn: () => Promise<void>) => { signals[name] = fn }, exit: () => { events.push('exit') } },
            setInterval: (fn: () => void) => { tick = fn; return 1 }, clearInterval: () => { tick = undefined; events.push('timer-stop') },
        })
    return { ...runner, tokens, events, signals, tick: () => tick?.(), expire: () => { owner = null }, cycles: () => cycles,
        block: () => { pending = new Promise<void>(resolve => { finish = resolve }) }, unblock: () => { pending = null; finish() },
        failNextAcquire: () => { failAcquire = true } }
}
test('one process never overlaps a long cycle even after leader TTL expires', async () => {
    const f = fixture(); await f.startOperationMaintenanceRunner({ intervalMs: 10, leaderTtlMs: 20 })
    f.block(); f.tick(); await flush(); f.expire(); f.tick(); await flush()
    assert.equal(f.cycles(), 2)
    f.unblock(); await flush(); await f.signals.SIGTERM()
})
test('each cycle has a distinct lease token', async () => {
    const f = fixture(); await f.startOperationMaintenanceRunner(); f.tick(); await flush()
    assert.equal(new Set(f.tokens).size, 2)
    await f.signals.SIGTERM()
})
test('shutdown drains active work before closing connections and is idempotent', async () => {
    const f = fixture(); await f.startOperationMaintenanceRunner(); f.events.length = 0
    f.block(); f.tick(); await flush(); const stopped = f.signals.SIGTERM()
    await flush(); assert.ok(!f.events.includes('redis-close'))
    f.unblock(); await stopped; await f.signals.SIGINT(); f.tick(); await flush()
    assert.deepEqual(f.events, ['timer-stop', 'cycle-finished', 'release', 'redis-close', 'db-close', 'exit'])
    assert.equal(f.cycles(), 2)
})
test('shutdown is registered during the first cycle and prevents a later interval', async () => {
    const f = fixture(); f.block(); const started = f.startOperationMaintenanceRunner(); await flush()
    assert.equal(typeof f.signals.SIGTERM, 'function')
    const stopped = f.signals.SIGTERM(); f.unblock(); await Promise.all([started, stopped]); f.tick(); await flush()
    assert.equal(f.cycles(), 1)
})
test('a failed leader acquisition recovers without releasing a foreign lease', async () => {
    const f = fixture(); f.failNextAcquire(); await f.startOperationMaintenanceRunner()
    assert.equal(f.cycles(), 0); assert.equal(f.events.length, 0)
    f.tick(); await flush(); assert.equal(f.cycles(), 1); await f.signals.SIGTERM()
})
test('once mode runs one cycle without timers or signal handlers', async () => {
    const f = fixture(); await f.startOperationMaintenanceRunner({ once: true }); f.tick()
    assert.equal(f.cycles(), 1); assert.deepEqual(Object.keys(f.signals), [])
    assert.deepEqual(f.events, ['cycle-finished', 'release'])
})
