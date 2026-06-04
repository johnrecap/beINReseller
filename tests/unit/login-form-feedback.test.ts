import test from 'node:test'
import assert from 'node:assert/strict'
import {
    formatCooldownClock,
    getLoginFeedbackMessage,
    mapAuthErrorToLoginFeedback,
} from '@/components/auth/loginFeedback'
import { ar } from '@/i18n/translations/ar'
import { en } from '@/i18n/translations/en'
import { bn } from '@/i18n/translations/bn'

test('AuthJS Configuration and CredentialsSignin never display raw error text', () => {
    const configuration = mapAuthErrorToLoginFeedback('Configuration')
    const credentials = mapAuthErrorToLoginFeedback('CredentialsSignin')

    assert.equal(configuration.status, 'invalid_credentials')
    assert.equal(credentials.status, 'invalid_credentials')
    assert.notEqual(getLoginFeedbackMessage(configuration, en.auth), 'Configuration')
    assert.notEqual(getLoginFeedbackMessage(credentials, en.auth), 'CredentialsSignin')
})

test('feedback messages include remaining attempts for first and second failures', () => {
    assert.equal(
        getLoginFeedbackMessage({ status: 'invalid_credentials', remainingAttempts: 2 }, en.auth),
        'Login name or password is not correct. 2 attempts remaining.'
    )
    assert.equal(
        getLoginFeedbackMessage({ status: 'invalid_credentials', remainingAttempts: 1 }, en.auth),
        'Login name or password is not correct. 1 attempt remaining.'
    )
})

test('cooldown feedback formats countdown as minutes and seconds', () => {
    assert.equal(formatCooldownClock(120), '02:00')
    assert.equal(formatCooldownClock(90), '01:30')
    assert.equal(formatCooldownClock(5), '00:05')
    assert.equal(
        getLoginFeedbackMessage({ status: 'cooldown_active', cooldownSeconds: 90 }, en.auth),
        'Too many unsuccessful attempts. Try again after 01:30.'
    )
})

test('login feedback translations exist for supported panel languages', () => {
    for (const auth of [ar.auth, en.auth, bn.auth]) {
        assert.equal(typeof auth.invalidLogin, 'string')
        assert.equal(typeof auth.invalidLoginAttemptsRemaining, 'string')
        assert.equal(typeof auth.loginCooldown, 'string')
        assert.equal(typeof auth.tryAgain, 'string')
    }
})
