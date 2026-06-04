import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildLoginDiagnosticEvent,
    redactLoginDiagnosticInput,
} from '@/lib/auth/login-diagnostics'

test('login diagnostic event keeps safe context and drops secrets', () => {
    const event = buildLoginDiagnosticEvent({
        reasonCategory: 'wrong_password',
        exactLoginName: 'Mobarak2030',
        matchedUserId: 'user-1',
        contextFingerprint: 'ctx-1',
        failedCount: 2,
        cooldownUntil: null,
        password: 'secret-password',
        passwordHash: '$2a$hash',
        token: 'token-value',
        cookie: 'cookie-value',
        session: 'session-value',
    })

    assert.equal(event.reasonCategory, 'wrong_password')
    assert.equal(event.exactLoginName, 'Mobarak2030')
    assert.equal(event.matchedUserId, 'user-1')
    assert.equal(event.failedCount, 2)

    const serialized = JSON.stringify(event)
    assert.equal(serialized.includes('secret-password'), false)
    assert.equal(serialized.includes('$2a$hash'), false)
    assert.equal(serialized.includes('token-value'), false)
    assert.equal(serialized.includes('cookie-value'), false)
    assert.equal(serialized.includes('session-value'), false)
})

test('redaction removes forbidden direct fields from diagnostic input', () => {
    const redacted = redactLoginDiagnosticInput({
        reasonCategory: 'unknown_login',
        exactLoginName: 'khaled-20200',
        password: 'plain',
        hash: 'hash',
        authorization: 'bearer',
        safe: 'kept',
    })

    assert.equal(redacted.reasonCategory, 'unknown_login')
    assert.equal(redacted.exactLoginName, 'khaled-20200')
    assert.equal(redacted.safe, 'kept')
    assert.equal('password' in redacted, false)
    assert.equal('hash' in redacted, false)
    assert.equal('authorization' in redacted, false)
})
