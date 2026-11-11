/* eslint-disable @typescript-eslint/no-require-imports -- Isolated integration runner, invoked with node --import tsx. */
const assert = require('node:assert/strict')
const http = require('node:http')
const { randomUUID } = require('node:crypto')
const { openPglitePrisma } = require('../helpers/pglite-prisma.ts')
const { recoverBeinAccount } = require('../../src/lib/bein-account-recovery.ts')
const { loginMessageFailure, loginExceptionFailure } = require('../../shared/bein/login-failure.ts')
const store = require('../../shared/bein/balance-refresh-store.ts')

async function main() {
    assert.equal(process.env.BALANCE_REFRESH_TEST_REDIS_URL, 'redis://127.0.0.1:16379/15')
    process.env.REDIS_URL = process.env.BALANCE_REFRESH_TEST_REDIS_URL
    process.env.BEIN_ALLOW_PLAINTEXT_CREDENTIALS = 'true'
    const database = await openPglitePrisma()
    const { db } = database
    const prismaPath = require.resolve('../../worker/src/lib/prisma.ts')
    require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: db } }
    const { getRedisConnection, closeRedisConnection } = require('../../worker/src/lib/redis.ts')
    const redis = getRedisConnection()
    const tracking = require('../../worker/src/lib/bein-login-tracking.ts')
    const { processOperationHttp } = require('../../worker/src/http-queue-processor.ts')
    const id = 'qa-login-' + randomUUID(), requestId = id + '-read', lockKey = `bein:account:lock:${id}`
    let gets = 0, posts = 0
    const server = http.createServer((request, response) => {
        if (request.method === 'POST') posts++; else gets++
        response.setHeader('Content-Type', 'text/html')
        response.end('<input id="__VIEWSTATE" name="__VIEWSTATE" value="synthetic-state"><input id="Login1_UserName"><img id="Login1_ImageVerificationDealer_Image" src="data:image/png;base64,AA==">')
    })
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
        const origin = `http://127.0.0.1:${server.address().port}`
        for (const [key, value] of Object.entries({ bein_login_url: origin + '/login', bein_renew_url: '/renew', bein_connection_mode: 'server_ip' }))
            await db.setting.create({ data: { key, value } })
        await db.beinAccount.create({ data: { id, username: id, password: 'synthetic', automationExclusive: true, dealerBalance: 7 } })
        const read = () => db.beinAccount.findUniqueOrThrow({ where: { id } })

        await store.admitBalanceRefresh(redis, id, requestId)
        await assert.rejects(processOperationHttp({ id: requestId, data: { type: 'CHECK_ACCOUNT_BALANCE', accountId: id, balanceRequestId: requestId } },
            { getRedis: () => redis, getWorkerId: () => 'synthetic-worker' }), /CAPTCHA_REQUIRED/)
        assert.equal((await store.readBalanceRefresh(redis, requestId)).errorCode, 'CAPTCHA_REQUIRED')
        let row = await read()
        assert.equal(row.isActive, true)
        assert.equal(row.lastLoginFailureReason, null)
        assert.equal(Number(row.dealerBalance), 7)
        assert.equal(gets, 1)
        assert.equal(posts, 0)
        assert.equal(await redis.get(lockKey), null)
        console.log('PASS real balance dispatcher + HTTP + Redis + Prisma: pending CAPTCHA does not quarantine')
        await verifyCookieChallenge(db, id)

        const oldRevision = row.updatedAt
        await recoverBeinAccount(db, redis, id, true)
        assert.equal(await tracking.recordLoginHealthFailure(id, loginMessageFailure(), oldRevision, { attempted: true, terminal: true }), false)
        await assert.rejects(tracking.recordLoginHealthSuccess(id, oldRevision), /LOGIN_HEALTH_STALE/)
        row = await read()
        assert.equal(row.isActive, true)
        assert.equal(row.lastLoginFailureReason, null)
        const results = await Promise.all([1, 2].map(() => tracking.recordLoginHealthFailure(id,
            loginMessageFailure('CAPTCHA'), row.updatedAt, { attempted: true, terminal: true, captchaSubmissions: 3 })))
        assert.equal(results.filter(Boolean).length, 1)
        row = await read()
        assert.equal(row.isActive, false)
        assert.equal(row.consecutiveLoginFailures, 0)
        await assert.rejects(tracking.recordLoginHealthSuccess(id, row.updatedAt), /LOGIN_HEALTH_STALE/)
        await recoverBeinAccount(db, redis, id, false)
        assert.equal((await read()).isActive, false)
        await recoverBeinAccount(db, redis, id, true)
        row = await read()
        await tracking.recordLoginHealthFailure(id, loginExceptionFailure({ code: 'CERT_HAS_EXPIRED' }), row.updatedAt, { attempted: true, terminal: true })
        assert.equal((await read()).isActive, true)
        assert.equal((await read()).lastLoginFailureReason, 'LOGIN_HEALTH_V1:CONNECTION_FAILED')
        console.log('PASS actual SQL revision fencing, one terminal write, inactive-success denial and transport warning')

        await redis.set(lockKey, 'foreign-owner', 'EX', 30)
        await assert.rejects(recoverBeinAccount(db, redis, id, true), /BEIN_ACCOUNT_BUSY/)
        assert.equal(await redis.get(lockKey), 'foreign-owner')
        assert.equal(Number((await read()).dealerBalance), 7)
        console.log('PASS foreign account lock and dealer balance remain unchanged')
    } finally {
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
        let cursor = '0'
        do {
            const page = await redis.scan(cursor, 'MATCH', `*${id}*`, 'COUNT', 100)
            cursor = page[0]
            if (page[1].length) await redis.del(...page[1])
        } while (cursor !== '0')
        await closeRedisConnection()
        await database.close()
    }
}

async function verifyCookieChallenge(db, accountId) {
    const { HttpClientService } = require('../../worker/src/http/HttpClientService.ts')
    const { completeLoginChallenge } = require('../../worker/src/lib/login-challenge.ts')
    const cookieErrors = [], submitted = [], images = []
    const form = step => `<title>Dealer Login</title><input id="__VIEWSTATE" name="__VIEWSTATE" value="state-${step}"><input id="Login1_UserName"><input name="Login1$Password"><img id="Login1_ImageVerificationDealer_Image" src="/image?step=${step}">`
    const valid = `<title>Check Card</title><a href="/logout">Logout</a><input name="__VIEWSTATE" id="__VIEWSTATE" value="${'a'.repeat(256)}"><div>${'verified page '.repeat(400)}</div>`
    let checkUnavailable = false, loginGets = 0
    const server = http.createServer(async (request, response) => {
        const cookie = request.headers.cookie || ''
        response.setHeader('Content-Type', 'text/html')
        if (request.url.startsWith('/image')) {
            const step = new URL(request.url, 'http://localhost').searchParams.get('step')
            images.push(step)
            if (!cookie.includes(`challenge=${step}`)) cookieErrors.push('image cookie mismatch')
            response.setHeader('Content-Type', 'image/png')
            return response.end(Buffer.from('iVBORw0KGgo=', 'base64'))
        }
        if (request.url === '/check' || request.url === '/home') {
            if (!cookie.includes('auth=verified')) cookieErrors.push('auth cookie missing')
            if (checkUnavailable) { response.statusCode = 503; return response.end('Unavailable') }
            return response.end(valid)
        }
        if (request.method === 'GET' && request.url === '/login') {
            loginGets++
            response.setHeader('Set-Cookie', 'challenge=1; Path=/; HttpOnly')
            return response.end(form(1))
        }
        if (request.method === 'POST' && request.url === '/login') {
            let body = ''
            for await (const chunk of request) body += chunk
            const fields = new URLSearchParams(body), step = submitted.length + 1
            submitted.push(fields)
            if (!cookie.includes(`challenge=${step}`)) cookieErrors.push('submission cookie mismatch')
            if (fields.get('__VIEWSTATE') !== `state-${step}`) cookieErrors.push('hidden state mismatch')
            if (fields.get('Login1$ImageVerificationDealer$txtContent') !== `solution-${step}`) cookieErrors.push('answer mismatch')
            if (step === 1) {
                response.setHeader('Set-Cookie', 'challenge=2; Path=/; HttpOnly')
                return response.end(form(2))
            }
            response.statusCode = 302
            response.setHeader('Set-Cookie', 'auth=verified; Path=/; HttpOnly')
            response.setHeader('Location', '/home')
            return response.end()
        }
        response.statusCode = 404
        response.end()
    })
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
        const origin = `http://127.0.0.1:${server.address().port}`
        await db.setting.update({ where: { key: 'bein_login_url' }, data: { value: origin + '/login' } })
        await db.setting.create({ data: { key: 'bein_check_url', value: '/check' } })
        const client = new HttpClientService(undefined, accountId)
        await client.initialize()
        client.axios.interceptors.request.use(config => {
            if (new URL(config.url).origin !== origin) throw new Error('TEST_EXTERNAL_NETWORK_DENIED')
            return config
        })
        let solves = 0
        const outcome = await completeLoginChallenge(await client.login('synthetic', 'synthetic'), {
            assertCurrent: async () => {}, attempted: true, getApiKey: async () => 'synthetic',
            solve: async () => `solution-${++solves}`,
            submit: answer => client.submitLogin('synthetic', 'synthetic', undefined, answer),
        })
        assert.equal(outcome.result.success, true)
        assert.equal(outcome.context.captchaSubmissions, 2)
        const restored = new HttpClientService(undefined, accountId)
        await restored.initialize()
        const cachedSession = await client.exportSession()
        await restored.importSession(cachedSession)
        restored.markSessionValidFromCache(cachedSession.expiresAt)
        assert.equal(await restored.validateSession(), true)
        checkUnavailable = true
        await assert.rejects(restored.validateSession(), error => error.code === 'PROVIDER_SESSION_UNAVAILABLE')
        assert.equal(restored.isSessionActive(), true)
        checkUnavailable = false
        assert.equal(await restored.validateSession(), true)
        assert.equal(loginGets, 1)
        assert.equal(submitted.length, 2)
        assert.deepEqual(images, ['1', '2'])
        assert.deepEqual(cookieErrors, [])
        console.log('PASS native HTTP image cookies, renewed state, redirect auth, cross-client session and transient-probe preservation')
    } finally {
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
