import test from 'node:test'
import assert from 'node:assert/strict'
import {
    BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
    BEIN_CONNECTION_MODE_SERVER_IP,
    DEFAULT_BEIN_CONNECTION_MODE,
    normalizeBeinConnectionMode,
    normalizeBeinConnectionSettingsForAdmin,
    validateBeinConnectionMode,
} from '@/lib/bein-connection-mode'

test('normalizes missing and invalid beIN connection mode to assigned proxy', () => {
    assert.equal(DEFAULT_BEIN_CONNECTION_MODE, BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
    assert.equal(normalizeBeinConnectionMode(undefined), BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
    assert.equal(normalizeBeinConnectionMode(null), BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
    assert.equal(normalizeBeinConnectionMode(''), BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
    assert.equal(normalizeBeinConnectionMode('bad-mode'), BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
})

test('accepts only assigned proxy and server IP mode values', () => {
    assert.equal(
        normalizeBeinConnectionMode(BEIN_CONNECTION_MODE_ASSIGNED_PROXY),
        BEIN_CONNECTION_MODE_ASSIGNED_PROXY
    )
    assert.equal(
        normalizeBeinConnectionMode(BEIN_CONNECTION_MODE_SERVER_IP),
        BEIN_CONNECTION_MODE_SERVER_IP
    )

    assert.deepEqual(validateBeinConnectionMode(BEIN_CONNECTION_MODE_ASSIGNED_PROXY), {
        value: BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
    })
    assert.deepEqual(validateBeinConnectionMode(BEIN_CONNECTION_MODE_SERVER_IP), {
        value: BEIN_CONNECTION_MODE_SERVER_IP,
    })
    assert.equal('error' in validateBeinConnectionMode('auto_fallback'), true)
})

test('admin settings read always exposes a safe beIN connection mode', () => {
    assert.equal(
        normalizeBeinConnectionSettingsForAdmin({ unrelated: 'kept' }).bein_connection_mode,
        BEIN_CONNECTION_MODE_ASSIGNED_PROXY
    )
    assert.equal(
        normalizeBeinConnectionSettingsForAdmin({ bein_connection_mode: BEIN_CONNECTION_MODE_SERVER_IP }).bein_connection_mode,
        BEIN_CONNECTION_MODE_SERVER_IP
    )
})
