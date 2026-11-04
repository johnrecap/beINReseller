import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideLoginHealth, decodeLoginHealthReason } from '../../shared/bein/login-health'

test('first final authentication failures quarantine; only credentials increment the counter', () => {
    for (const [failureCategory, failureCode, reason, increment] of [
        ['credentials', 'LOGIN_CREDENTIALS_REJECTED', 'CREDENTIALS_REJECTED', 1],
        ['captcha', 'LOGIN_CAPTCHA_REQUIRED', 'CAPTCHA_EXHAUSTED', 0],
        ['unknown', 'LOGIN_REVIEW_REQUIRED', 'AUTH_REVIEW_REQUIRED', 0],
    ] as const) {
        assert.deepEqual(decideLoginHealth({ failureCategory, failureCode }, { attempted: true, terminal: true }),
            { record: true, disable: true, credentialIncrement: increment, reason: `LOGIN_HEALTH_V1:${reason}` })
    }
})

test('transport, 429 and local failures never become password rejection', () => {
    for (const [failureCategory, reason] of [['transport', 'CONNECTION_FAILED'], ['rate_limit', 'RATE_LIMITED']] as const) {
        const decision = decideLoginHealth({ failureCategory }, { attempted: true, terminal: true })
        assert.equal(decision.disable, false)
        assert.equal(decision.credentialIncrement, 0)
        assert.equal(decision.reason, `LOGIN_HEALTH_V1:${reason}`)
    }
    assert.deepEqual(decideLoginHealth({ failureCategory: 'unknown' }, { attempted: false, terminal: true }),
        { record: true, disable: false, credentialIncrement: 0, reason: 'LOGIN_HEALTH_V1:SYSTEM_ERROR' })
})

test('intermediate CAPTCHA is not persisted as a terminal health failure', () => {
    assert.equal(decideLoginHealth({ failureCategory: 'captcha' }, { attempted: true, terminal: false }).record, false)
})

test('safe reason decoding supports legacy credentials but never returns arbitrary stored text', () => {
    assert.equal(decodeLoginHealthReason('Invalid username or password'), 'CREDENTIALS_REJECTED')
    assert.equal(decodeLoginHealthReason('LOGIN_HEALTH_V1:RATE_LIMITED'), 'RATE_LIMITED')
    assert.equal(decodeLoginHealthReason('<html>secret token</html>'), 'AUTH_REVIEW_REQUIRED')
    assert.equal(decodeLoginHealthReason(null), null)
})
