import test from 'node:test'
import assert from 'node:assert/strict'
import {
    MAX_LOGIN_FAILURES,
    LOGIN_COOLDOWN_SECONDS,
    InMemoryLoginAttemptStore,
    buildLoginAttemptKey,
    clearLoginAttemptWindow,
    getLoginAttemptStatus,
    normalizeSubmittedLoginName,
    recordFailedLoginAttempt,
} from '@/lib/auth/login-attempts'

const baseInput = {
    loginName: 'Mobarak2030',
    ip: '203.0.113.10',
    userAgent: 'unit-test-browser',
}

test('login attempt constants match the requested three tries and two minute wait', () => {
    assert.equal(MAX_LOGIN_FAILURES, 3)
    assert.equal(LOGIN_COOLDOWN_SECONDS, 120)
})

test('attempt keys preserve login name case and punctuation', () => {
    const upperCaseKey = buildLoginAttemptKey({
        loginName: 'Mobarak2030',
        ip: baseInput.ip,
        userAgent: baseInput.userAgent,
    })
    const lowerCaseKey = buildLoginAttemptKey({
        loginName: 'mobarak2030',
        ip: baseInput.ip,
        userAgent: baseInput.userAgent,
    })
    const dashedKey = buildLoginAttemptKey({
        loginName: 'khaled-20200',
        ip: baseInput.ip,
        userAgent: baseInput.userAgent,
    })
    const noDashKey = buildLoginAttemptKey({
        loginName: 'khaled20200',
        ip: baseInput.ip,
        userAgent: baseInput.userAgent,
    })

    assert.notEqual(upperCaseKey, lowerCaseKey)
    assert.notEqual(dashedKey, noDashKey)
})

test('submitted login names trim only outer spaces and keep letter case', () => {
    assert.equal(normalizeSubmittedLoginName('  Mobarak2030  '), 'Mobarak2030')
    assert.equal(normalizeSubmittedLoginName('mobarak2030'), 'mobarak2030')
    assert.equal(normalizeSubmittedLoginName(' khaled-20200 '), 'khaled-20200')
})

test('first and second failed attempts report remaining attempts without cooldown', async () => {
    let now = 1_000
    const store = new InMemoryLoginAttemptStore(() => now)

    const first = await recordFailedLoginAttempt(baseInput, 'wrong_password', { store, now: () => now })
    assert.equal(first.status, 'failed')
    assert.equal(first.remainingAttempts, 2)
    assert.equal(first.cooldownSeconds, 0)
    assert.equal(first.canRetry, true)

    now += 1_000
    const second = await recordFailedLoginAttempt(baseInput, 'wrong_password', { store, now: () => now })
    assert.equal(second.status, 'failed')
    assert.equal(second.remainingAttempts, 1)
    assert.equal(second.cooldownSeconds, 0)
    assert.equal(second.canRetry, true)
})

test('third failed attempt starts cooldown and repeated clicks do not extend it', async () => {
    let now = 10_000
    const store = new InMemoryLoginAttemptStore(() => now)

    await recordFailedLoginAttempt(baseInput, 'wrong_password', { store, now: () => now })
    now += 1_000
    await recordFailedLoginAttempt(baseInput, 'wrong_password', { store, now: () => now })
    now += 1_000

    const third = await recordFailedLoginAttempt(baseInput, 'wrong_password', { store, now: () => now })
    assert.equal(third.status, 'cooldown_active')
    assert.equal(third.remainingAttempts, 0)
    assert.equal(third.cooldownSeconds, LOGIN_COOLDOWN_SECONDS)
    assert.equal(third.canRetry, false)

    now += 30_000
    const repeatedClick = await recordFailedLoginAttempt(baseInput, 'cooldown_active', { store, now: () => now })
    assert.equal(repeatedClick.status, 'cooldown_active')
    assert.equal(repeatedClick.cooldownSeconds, 90)

    now += 90_000
    const afterWait = await getLoginAttemptStatus(baseInput, { store, now: () => now })
    assert.equal(afterWait.status, 'allowed')
    assert.equal(afterWait.remainingAttempts, 3)
    assert.equal(afterWait.canRetry, true)
})

test('successful login can clear the normal mistake counter', async () => {
    const now = 5_000
    const store = new InMemoryLoginAttemptStore(() => now)

    await recordFailedLoginAttempt(baseInput, 'wrong_password', { store, now: () => now })
    await clearLoginAttemptWindow(baseInput, { store })

    const status = await getLoginAttemptStatus(baseInput, { store, now: () => now })
    assert.equal(status.status, 'allowed')
    assert.equal(status.remainingAttempts, 3)
})
