import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildLegacySessionCacheKey,
    buildOperationSessionRouteMetadata,
    buildSessionCacheKey,
    isRouteAwareSessionKey,
    operationSessionRouteMatches,
} from '../src/lib/session-cache'

test('shared session cache keys include account and route', () => {
    assert.equal(
        buildSessionCacheKey('account-1', 'direct'),
        'bein:session:v2:account-1:direct'
    )
    assert.equal(
        buildSessionCacheKey('account-1', 'proxy:proxy-1'),
        'bein:session:v2:account-1:proxy:proxy-1'
    )
    assert.notEqual(
        buildSessionCacheKey('account-1', 'direct'),
        buildSessionCacheKey('account-1', 'proxy:proxy-1')
    )
})

test('legacy account-only keys are not route-aware', () => {
    assert.equal(buildLegacySessionCacheKey('account-1'), 'bein:session:account-1')
    assert.equal(isRouteAwareSessionKey('bein:session:account-1'), false)
    assert.equal(isRouteAwareSessionKey('bein:session:v2:account-1:direct'), true)
})

test('operation session route metadata must match before import', () => {
    const metadata = buildOperationSessionRouteMetadata({
        accountId: 'account-1',
        routeKey: 'proxy:proxy-1',
        mode: 'assigned_proxy',
    })

    assert.equal(operationSessionRouteMatches(metadata, {
        accountId: 'account-1',
        routeKey: 'proxy:proxy-1',
        mode: 'assigned_proxy',
    }), true)
    assert.equal(operationSessionRouteMatches(metadata, {
        accountId: 'account-1',
        routeKey: 'direct',
        mode: 'assigned_proxy',
    }), false)
    assert.equal(operationSessionRouteMatches(metadata, {
        accountId: 'account-2',
        routeKey: 'proxy:proxy-1',
        mode: 'assigned_proxy',
    }), false)
})

test('direct route operation session metadata distinguishes assigned proxy from server IP mode', () => {
    const metadata = buildOperationSessionRouteMetadata({
        accountId: 'account-1',
        routeKey: 'direct',
        mode: 'assigned_proxy',
    })

    assert.equal(operationSessionRouteMatches(metadata, {
        accountId: 'account-1',
        routeKey: 'direct',
        mode: 'assigned_proxy',
    }), true)
    assert.equal(operationSessionRouteMatches(metadata, {
        accountId: 'account-1',
        routeKey: 'direct',
        mode: 'server_ip',
    }), false)
})
