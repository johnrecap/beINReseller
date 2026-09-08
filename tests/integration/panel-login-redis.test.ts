import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import * as crypto from 'node:crypto'
import Redis from 'ioredis'
import { loadIsolatedModule } from '../helpers/promo-dispatch-harness'

test('isolated Redis atomically counts simultaneous login failures and preserves cooldown TTL', {
    skip: !process.env.PANEL_TEST_REDIS_BINARY, timeout: 30_000,
}, async () => {
    // Own a new loopback-only process: never connect to interactive or restored services.
    const portProbe = createServer()
    await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve))
    const port = (portProbe.address() as { port: number }).port
    await new Promise<void>(resolve => portProbe.close(() => resolve()))
    const directory = await mkdtemp(join(tmpdir(), 'panel-login-redis-'))
    const config = join(directory, 'synthetic.conf')
    const logfile = join(directory, 'synthetic.log')
    await writeFile(config, `bind 127.0.0.1\nport ${port}\nsave ""\nappendonly no\ndir "${directory.replaceAll('\\', '/')}"\nlogfile "${logfile.replaceAll('\\', '/')}"\n`)
    const processHandle = spawn(process.env.PANEL_TEST_REDIS_BINARY!, [config], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const exited = once(processHandle, 'exit')
    let spawnError: Error | undefined
    processHandle.once('error', error => { spawnError = error })
    const redis = new Redis({ host: '127.0.0.1', port, lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: n => n < 30 ? 100 : null })
    redis.on('error', () => {})
    try {
        let output = ''
        for (let attempt = 0; attempt < 100; attempt++) {
            output = await readFile(logfile, 'utf8').catch(() => '')
            if (/ready to accept/i.test(output)) break
            if (spawnError || processHandle.exitCode !== null) throw spawnError ?? new Error(output.slice(-2000))
            await new Promise(resolveWait => setTimeout(resolveWait, 100))
        }
        assert.match(output, /ready to accept/i, 'Isolated process did not become ready: ' + output.slice(-2000))
        await redis.connect()
        const api = loadIsolatedModule<typeof import('../../src/lib/auth/login-attempts')>('src/lib/auth/login-attempts.ts', {
            'node:crypto': crypto, '@/lib/redis': { redis },
        })
        const input = { loginName: 'SYNTHETIC_ONLY', ip: '127.0.0.1', userAgent: 'isolated-race' }
        const results = await Promise.all(Array.from({ length: 30 }, () => api.recordFailedLoginAttempt(input, 'wrong_password')))
        assert.equal(results.filter(r => r.failedCount === 1).length, 1)
        assert.equal(results.filter(r => r.failedCount === 2).length, 1)
        assert.equal(results.filter(r => r.status === 'cooldown_active').length, 28)
        const key = api.buildLoginAttemptKey(input)
        const before = await redis.pttl(key)
        const raw = await redis.get(key)
        await api.recordFailedLoginAttempt(input, 'wrong_password')
        assert.equal(await redis.get(key), raw)
        assert.ok(await redis.pttl(key) <= before)
        await api.clearLoginAttemptWindow(input)
        assert.equal(await redis.exists(key), 0)
    } finally {
        redis.disconnect()
        processHandle.kill()
        await exited
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
        await rm(directory, { recursive: true, force: true })
    }
})
