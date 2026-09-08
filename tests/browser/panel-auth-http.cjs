/* eslint-disable @typescript-eslint/no-require-imports -- Standalone isolated HTTP/browser acceptance harness. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { createServer } = require('node:net')
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')
const ts = require('typescript')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function freePort() {
    const server = createServer()
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    await new Promise(resolve => server.close(resolve))
    return port
}
async function stop(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    child.kill()
    await exited
}

async function main() {
    const dbUrl = process.env.PANEL_AUTH_TEST_DATABASE_URL
    assert.ok(dbUrl && process.env.PANEL_AUTH_BUILD_DIR && process.env.PANEL_TEST_REDIS_BINARY,
        'Explicit synthetic database, isolated build and Redis binary are required')
    const target = new URL(dbUrl)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.equal(target.pathname, '/deshpanel_audit_test_20260907_v2')
    assert.equal(target.port, '5433')
    const repo = process.cwd()
    const build = fs.realpathSync(process.env.PANEL_AUTH_BUILD_DIR)
    assert.notEqual(build, fs.realpathSync(repo), 'Never serve tests from the interactive checkout')
    for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
        assert.ok(!fs.existsSync(path.join(build, name)), 'Build fixture must not load business environment files')
    }
    // The current login/auth implementation must be the one compiled in the fixture.
    for (const name of ['src/lib/auth.ts', 'src/lib/auth.config.ts', 'src/lib/auth-utils.ts', 'src/lib/auth/login-attempts.ts',
        'src/app/login/page.tsx', 'src/components/auth/LoginPageClient.tsx', 'src/components/auth/LoginForm.tsx', 'src/components/providers/Providers.tsx', 'src/middleware.ts']) {
        const runtimeHash = root => crypto.createHash('sha256').update(ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, removeComments: true }, fileName: name,
        }).outputText).digest('hex')
        assert.equal(runtimeHash(repo), runtimeHash(build), 'Stale auth build: ' + name)
    }
    assert.ok(fs.existsSync(path.join(build, '.next/BUILD_ID')))
    const db = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 3000 })
    const identity = await db.query('SELECT current_database() AS db, rolsuper FROM pg_roles WHERE rolname = current_user')
    assert.equal(identity.rows[0].db, target.pathname.slice(1))
    assert.equal(identity.rows[0].rolsuper, false, 'Use the restricted synthetic test role')

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-auth-http-'))
    const prefix = 'web11-' + crypto.randomUUID()
    const password = crypto.randomBytes(24).toString('base64url')
    const hash = await bcrypt.hash(password, 10)
    const secret = crypto.randomBytes(48).toString('base64url')
    const redisPort = await freePort()
    const appPort = await freePort()
    const base = `http://127.0.0.1:${appPort}`
    let redis, app, browser
    let logs = ''
    const results = []
    const record = name => { results.push(name); console.log('PASS ' + name) }
    const config = path.join(directory, 'redis.conf')
    const redisLog = path.join(directory, 'redis.log')
    fs.writeFileSync(config, `bind 127.0.0.1\nport ${redisPort}\nsave ""\nappendonly no\ndir "${directory.replaceAll('\\', '/')}"\nlogfile "${redisLog.replaceAll('\\', '/')}"\n`)
    const startApp = async connection => {
        app = spawn(process.execPath, [path.join(repo, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(appPort)], {
            cwd: build, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, DATABASE_URL: connection, REDIS_URL: `redis://127.0.0.1:${redisPort}`,
                AUTH_SECRET: secret, NEXTAUTH_SECRET: secret, AUTH_URL: base, NEXTAUTH_URL: base, AUTH_TRUST_HOST: 'true',
                NODE_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_synthetic', ENCRYPTION_KEY: '1'.repeat(64),
                NODE_OPTIONS: `--require "${path.join(repo, 'tests/helpers/panel-http-network-guard.cjs').replaceAll('\\', '/')}"`,
                PANEL_HTTP_ALLOWED_PORTS: [5433, redisPort, appPort, 9].join(',') },
        })
        app.stdout.on('data', b => { logs = (logs + b).slice(-20000) })
        app.stderr.on('data', b => { logs = (logs + b).slice(-20000) })
        app.on('error', () => {})
        const deadline = Date.now() + 60_000
        while (Date.now() < deadline) {
            if (app.exitCode !== null) throw new Error('Isolated Next exited before readiness')
            try { if ((await fetch(base + '/api/auth/csrf', { signal: AbortSignal.timeout(1000) })).ok) return } catch { /* wait for own process */ }
            await delay(100)
        }
        throw new Error('Isolated Next readiness timed out')
    }
    try {
        redis = spawn(process.env.PANEL_TEST_REDIS_BINARY, [config], { windowsHide: true, stdio: 'ignore' })
        redis.on('error', () => {})
        for (let i = 0; i < 100; i++) {
            if (fs.existsSync(redisLog) && /ready to accept/i.test(fs.readFileSync(redisLog, 'utf8'))) break
            await delay(100)
        }
        assert.match(fs.readFileSync(redisLog, 'utf8'), /ready to accept/i)
        await startApp(dbUrl)
        browser = await chromium.launch({ channel: 'chrome', headless: true })
        const createContext = async () => {
            const context = await browser.newContext()
            await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
            return context
        }
        const login = async (context, username) => {
            const csrf = await (await context.request.get(base + '/api/auth/csrf')).json()
            const response = await context.request.post(base + '/api/auth/callback/credentials', {
                headers: { 'X-Auth-Return-Redirect': '1' },
                form: { csrfToken: csrf.csrfToken, username, password, callbackUrl: base + '/dashboard' },
            })
            assert.ok(response.ok(), 'Credentials callback failed')
            const result = await response.json()
            assert.ok(!new URL(result.url).searchParams.has('error'), 'Credentials were not accepted')
            const session = await (await context.request.get(base + '/api/auth/session')).json()
            assert.equal(session.user.username, username)
            assert.ok((await context.cookies()).some(c => c.name.includes('session-token')))
        }
        for (const scenario of ['logout', 'inactive', 'password', 'deleted']) {
            const id = prefix + '-' + scenario
            await db.query('INSERT INTO users (id,username,email,password_hash,role,updated_at) VALUES ($1,$1,$2,$3,\'USER\',now())', [id, id + '@example.invalid', hash])
            const context = await createContext()
            try {
                await login(context, id)
                const publicAsset = await context.request.head(base + '/videos/promo.webm')
                assert.ok(!publicAsset.headers()['set-cookie'], 'Public login media must not renew session cookies')
                assert.equal((await context.request.get(base + '/api/transactions')).status(), 200)
                const redirect = await context.request.get(base + '/login', { maxRedirects: 0 })
                assert.ok([302, 303, 307, 308].includes(redirect.status()))
                if (scenario === 'logout') {
                    const csrf = await (await context.request.get(base + '/api/auth/csrf')).json()
                    await context.request.post(base + '/api/auth/signout', { headers: { 'X-Auth-Return-Redirect': '1' }, form: { csrfToken: csrf.csrfToken, callbackUrl: base + '/login' } })
                } else {
                    const field = scenario === 'inactive' ? 'is_active = false' : scenario === 'password' ? 'password_changed_at = now()' : 'deleted_at = now()'
                    await db.query('UPDATE users SET ' + field + ' WHERE id = $1', [id])
                    assert.equal((await context.request.get(base + '/api/transactions')).status(), 401)
                    const page = await context.newPage()
                    const authEvents = []
                    page.on('response', response => {
                        if (new URL(response.url()).pathname.startsWith('/api/auth/')) authEvents.push(new URL(response.url()).pathname + ':' + response.status())
                    })
                    await page.goto(base + '/login')
                    await page.locator('#username').waitFor({ timeout: 20000 })
                    if ((await context.cookies()).some(c => c.name.includes('session-token'))) {
                        console.log('Auth response order (' + scenario + '): ' + authEvents.join(', '))
                    }
                }
                assert.ok(!(await context.cookies()).some(c => c.name.includes('session-token')))
                assert.equal((await context.request.get(base + '/api/transactions')).status(), 401)
                record('real AuthJS cookie / protected API / ' + scenario)
            } finally { await context.close() }
        }
        const id = prefix + '-outage'
        await db.query('INSERT INTO users (id,username,email,password_hash,role,updated_at) VALUES ($1,$1,$2,$3,\'USER\',now())', [id, id + '@example.invalid', hash])
        const context = await createContext()
        try {
            await login(context, id)
            await stop(app)
            const unavailable = new URL(dbUrl); unavailable.port = '9'
            await startApp(unavailable.toString())
            const page = await context.newPage()
            await page.goto(base + '/login')
            await page.getByRole('alert').filter({ has: page.getByRole('button') }).waitFor({ timeout: 20000 })
            assert.equal(await page.locator('form').count(), 0)
            record('real server database outage recovery; no redirect loop or false login form')
        } finally { await context.close() }
        const output = process.env.PANEL_QA_OUTPUT
        if (output) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'panel-auth-http.json'), JSON.stringify({ passed: results, buildId: fs.readFileSync(path.join(build, '.next/BUILD_ID'), 'utf8').trim() }, null, 2)) }
    } catch (error) {
        // Retain useful diagnostics without exposing connection strings or credentials.
        console.error(logs.replaceAll(dbUrl, '[TEST_DATABASE]').replaceAll(decodeURIComponent(target.password), '[REDACTED]').replaceAll(password, '[SYNTHETIC_PASSWORD]'))
        throw error
    } finally {
        if (browser) await browser.close()
        await stop(app)
        await stop(redis)
        await db.query('DELETE FROM activity_logs WHERE user_id LIKE $1', [prefix + '%'])
        await db.query('DELETE FROM users WHERE id LIKE $1', [prefix + '%'])
        await db.end()
        const actual = fs.realpathSync(directory)
        assert.equal(path.dirname(actual), fs.realpathSync(os.tmpdir()))
        assert.ok(path.basename(actual).startsWith('panel-auth-http-'))
        fs.rmSync(actual, { recursive: true })
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
