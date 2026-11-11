import test from 'node:test'
import assert from 'node:assert/strict'
import { HttpClientService } from '../src/http/HttpClientService'
import { decideLoginHealth } from '../../shared/bein/login-health'

const loginForm = '<input id="__VIEWSTATE" name="__VIEWSTATE" value="secret-state"><input id="Login1_UserName"><input id="Login1_Password" type="password">'
const authenticated = '<title>Check</title><a id="ctl00_LoginStatus1" href="logout">Logout</a><div id="ctl00_ContentPlaceHolder1">Dealer dashboard</div>'

function fixture(getResponse: unknown, postResponse: unknown = { status: 200, data: authenticated }) {
    const calls: string[] = []
    const client = Object.assign(Object.create(HttpClientService.prototype), {
        accountId: 'synthetic-a', reportReadScope: true, currentViewState: null,
        sessionValid: false, sessionExpiresAt: 0,
        captureLoginTrackingRevision: async () => {},
        config: { loginUrl: 'https://provider.invalid/login', selCaptchaImg: 'captcha', sessionTimeoutMinutes: 15 },
        axios: {
            get: async () => { calls.push('GET'); if (getResponse instanceof Error) throw getResponse; return getResponse },
            post: async () => { calls.push('POST'); if (postResponse instanceof Error) throw postResponse; return postResponse },
        },
    }) as HttpClientService
    return { client, calls }
}

for (const response of [Object.assign(new Error('synthetic timeout'), { code: 'ETIMEDOUT' }),
    { status: 429, data: '' }, { status: 503, data: '' }, { status: 200, data: '<html>temporary provider page</html>' }]) {
    test(`2026-11-11: unavailable validation preserves the session and never falls into a new login: ${response instanceof Error ? 'timeout' : response.status}`, async () => {
        const { client, calls } = fixture(response);
        Object.assign(client, { sessionValid: true, sessionExpiresAt: Date.now() + 600_000, lastLoginTime: new Date() });
        await assert.rejects(client.login('synthetic', 'private-password'), { code: 'PROVIDER_SESSION_UNAVAILABLE' });
        assert.equal(client.isSessionActive(), true);
        assert.deepEqual(calls, ['GET']);
        assert.equal(client.didAttemptLogin(), false);
    });
}

test('an explicit login page expires a cached session and permits a fresh authentication', async () => {
    const { client, calls } = fixture({ status: 200, data: loginForm });
    Object.assign(client, { sessionValid: true, sessionExpiresAt: Date.now() + 600_000, lastLoginTime: new Date() });
    assert.equal((await client.login('synthetic', 'private-password')).success, true);
    assert.deepEqual(calls, ['GET', 'GET', 'POST']);
});

for (const status of [402, 407, 429, 500, 502, 503]) {
    test(`GET ${status} blocks credential POST and classifies failure`, async () => {
        const { client, calls } = fixture({ status, data: loginForm })
        const result = await client.login('synthetic', 'private-password')
        assert.equal(result.success, false)
        assert.equal(client.didAttemptLogin(), true)
        assert.deepEqual(calls, ['GET'])
        assert.equal((result as any).httpStatus, status)
        assert.equal((result as any).failureCategory, status === 429 ? 'rate_limit' : 'transport')
        if (status < 500) assert.equal((result as any).retryable, false)
        assert.doesNotMatch(JSON.stringify(result), /private-password|secret-state/)
    })
    test(`POST ${status} never authenticates or asserts bad credentials`, async () => {
        const { client } = fixture({ status: 200, data: loginForm }, { status, data: authenticated })
        const result = await client.login('synthetic', 'private-password')
        assert.equal(result.success, false)
        assert.equal((result as any).httpStatus, status)
        assert.notEqual((result as any).failureCategory, 'credentials')
        assert.equal(client.isSessionActive(), false)
    })
}

test('local revision failure is not an actual provider login attempt', async () => {
    const { client, calls } = fixture({ status: 200, data: loginForm })
    Object.assign(client, { captureLoginTrackingRevision: async () => { throw new Error('local database unavailable') } })
    await client.login('synthetic', 'private-password')
    assert.equal(client.didAttemptLogin(), false)
    assert.deepEqual(calls, [])
})

for (const [message, code, status] of [
    ['CONNECT tunnel failed, response 402', undefined, 402],
    ['private-password in a transport error', 'ENOTFOUND', undefined],
    ['timeout secret-state', 'ETIMEDOUT', undefined],
] as const) {
    test(`transport exception ${code || status} is safe and typed`, async () => {
        const error = Object.assign(new Error(message), { code })
        const { client, calls } = fixture(error)
        const result = await client.login('synthetic', 'private-password')
        assert.equal((result as any).failureCategory, 'transport')
        assert.equal((result as any).httpStatus, status)
        assert.deepEqual(calls, ['GET'])
        assert.doesNotMatch(JSON.stringify(result), /private-password|secret-state/)
    })
}

for (const html of [
    '<title>Finance Dashboard</title><p>unexpected</p>',
    '<title>Finance</title>' + loginForm,
    '<title>Error</title><p>Something went wrong</p>',
    loginForm,
    '<title>Check</title><a id="ctl00_LoginStatus1">Sign In</a><div id="ContentPlaceHolder1">Welcome</div>',
]) {
    test(`ambiguous 200 does not create a session: ${html.slice(0, 30)}`, async () => {
        const { client } = fixture({ status: 200, data: loginForm }, { status: 200, data: html })
        const result = await client.login('synthetic', 'private-password')
        assert.equal(result.success, false)
        assert.equal((result as any).failureCategory, 'unknown')
        assert.equal(client.isSessionActive(), false)
    })
}

test('explicit credential rejection is distinct from CAPTCHA and unknown failure', async () => {
    for (const [text, category] of [['Invalid username or password', 'credentials'], ['Incorrect CAPTCHA', 'captcha'], ['Unexpected error', 'unknown']]) {
        const { client } = fixture({ status: 200, data: loginForm }, { status: 200, data: loginForm + `<span style="color:Red">${text}</span>` })
        const result = await client.login('synthetic', 'private-password')
        assert.equal((result as any).failureCategory, category)
    }
})

test('authenticated content succeeds and three account instances remain isolated', async () => {
    const a = fixture({ status: 402, data: '' })
    const b = fixture({ status: 200, data: loginForm })
    const c = fixture({ status: 200, data: loginForm })
    const results = await Promise.all([a, b, c].map(({ client }) => client.login('synthetic', 'private-password')))
    assert.deepEqual(results.map(r => r.success), [false, true, true])
    assert.equal(a.client.isSessionActive(), false)
})

test('ambiguous GET 200 does not send credentials; authenticated GET reuses verified session', async () => {
    for (const [html, success] of [['<title>Finance</title><p>unexpected</p>', false], [authenticated, true]] as const) {
        const { client, calls } = fixture({ status: 200, data: html })
        assert.equal((await client.login('synthetic', 'private-password')).success, success)
        assert.deepEqual(calls, ['GET'])
    }
})

test('CONNECT 402 while submitting credentials stops and redacts the raw exception', async () => {
    const { client, calls } = fixture({ status: 200, data: loginForm }, new Error('CONNECT tunnel failed 402 private-password'))
    const result = await client.login('synthetic', 'private-password')
    assert.equal(result.httpStatus, 402)
    assert.equal(result.retryable, false)
    assert.deepEqual(calls, ['GET', 'POST'])
    assert.doesNotMatch(JSON.stringify(result), /private-password/)
})

test('CAPTCHA image HTTP 402 remains a transport failure and prevents credential submission', async () => {
    const { client, calls } = fixture({})
    const internal = client as unknown as { reportReadScope: boolean; axios: { get: (url: string) => Promise<unknown> } }
    internal.reportReadScope = false
    internal.axios.get = async (url: string) => {
        calls.push(url)
        if (url.includes('ipify')) return { status: 200, data: { ip: '192.0.2.1' } }
        if (url.endsWith('/captcha')) return { status: 402, data: 'private-error-page' }
        return { status: 200, data: loginForm + '<img id="captcha" src="https://provider.invalid/captcha">' }
    }
    const result = await client.login('synthetic', 'private-password')
    assert.equal(result.failureCategory, 'transport')
    assert.equal(result.httpStatus, 402)
    assert.equal(result.retryable, false)
    assert.ok(!calls.includes('POST'))
    assert.doesNotMatch(JSON.stringify(result), /private-error-page|private-password/)
})

// 2026-11-09: a renewed challenge was reported as terminal unknown authentication.
for (const errorText of ['', 'Incorrect CAPTCHA']) test(`renewed CAPTCHA preserves fresh form state until successful resubmission (${errorText || 'no message'})`, async () => {
    const challenge = loginForm.replace('secret-state', 'new-state') + '<img id="captcha" src="data:image/png;base64,AA==">' +
        (errorText ? `<span style="color:Red">${errorText}</span>` : '')
    const { client } = fixture({ status: 200, data: loginForm }, { status: 200, data: challenge })
    const internal = client as unknown as { reportReadScope: boolean; axios: { post: (url: string, body: string) => Promise<unknown> } }
    internal.reportReadScope = false
    const submitted: string[] = []
    internal.axios.post = async (_url: string, body: string) => {
        submitted.push(body)
        return { status: 200, data: submitted.length === 1 ? challenge : authenticated }
    }
    const first = await client.login('synthetic', 'private-password')
    assert.equal(first.requiresCaptcha, true)
    assert.equal(first.failureCategory, 'captcha')
    assert.equal(first.captchaImage, 'AA==')
    assert.equal(first.retryable, true)
    assert.equal(client.isSessionActive(), false)
    assert.equal((await client.submitLogin('synthetic', 'private-password', undefined, 'solution')).success, true)
    assert.equal(new URLSearchParams(submitted[1]).get('__VIEWSTATE'), 'new-state')
})

for (const rejection of ['Invalid username or password', 'Invalid Username or Password']) test(`explicit rejection takes precedence over a returned CAPTCHA: ${rejection}`, async () => {
    const { client } = fixture({ status: 200, data: loginForm }, { status: 200, data: loginForm +
        `<span style="color:Red">${rejection}</span><img id="captcha" src="data:image/png;base64,AA==">` })
    assert.equal((await client.login('synthetic', 'private-password')).failureCategory, 'credentials')
})

for (const [code, message] of [
    ['ERR_TLS_CERT_ALTNAME_INVALID', "Hostname/IP does not match certificate's altnames"],
    ['CERT_HAS_EXPIRED', 'certificate has expired'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'unable to verify the first certificate'],
]) test(`TLS ${code} cannot quarantine a valid account`, async () => {
    const { client } = fixture(Object.assign(new Error(message), { code }))
    const failure = await client.login('synthetic', 'private-password')
    assert.equal(failure.failureCategory, 'transport')
    assert.equal(failure.retryable, false)
    assert.equal(decideLoginHealth(failure, { attempted: true, terminal: true }).disable, false)
})
