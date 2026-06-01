import test from 'node:test'
import assert from 'node:assert/strict'
import { redactActivityLogDetails } from '@/lib/activity-log-redaction'

test('redacts secrets and beIN account usernames from activity log details', () => {
    const redacted = redactActivityLogDetails({
        username: 'normal-panel-user',
        accountUsername: 'dealer@example.test',
        password: 'secret-password',
        nested: {
            telegramBotToken: 'bot-token',
            safe: 'kept',
        },
    }) as Record<string, unknown>

    assert.equal(redacted.username, 'normal-panel-user')
    assert.equal(redacted.accountUsername, '[redacted]')
    assert.equal(redacted.password, '[redacted]')
    assert.deepEqual(redacted.nested, {
        telegramBotToken: '[redacted]',
        safe: 'kept',
    })
})

test('redacts JSON string and plain text activity log details before browser display', () => {
    const jsonString = redactActivityLogDetails(JSON.stringify({
        beinUsername: 'dealer@example.test',
        token: 'abc123',
        message: 'ok',
    })) as string

    assert.deepEqual(JSON.parse(jsonString), {
        beinUsername: '[redacted]',
        token: '[redacted]',
        message: 'ok',
    })

    assert.equal(
        redactActivityLogDetails('password=secret accountUsername: dealer@example.test done'),
        'password=[redacted] accountUsername=[redacted] done'
    )
})
