import test from 'node:test'
import assert from 'node:assert/strict'
import {
    BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
    BEIN_CONNECTION_MODE_SERVER_IP,
    buildOperationRouteSnapshot,
    resolveBeinRoute,
} from '../src/lib/bein-connection-mode'

const accountWithProxy = {
    id: 'account-1',
    username: 'Bn-Xtr-001',
    label: 'Bot 1',
    proxyId: 'proxy-1',
    proxy: {
        id: 'proxy-1',
        host: '45.38.219.132',
        port: 6310,
        username: 'proxy-user',
        password: 'proxy-password',
        label: 'Main proxy',
    },
}

const accountWithoutProxy = {
    id: 'account-2',
    username: 'Bn-Xtr-002',
    label: 'Bot 2',
    proxyId: null,
    proxy: null,
}

test('assigned proxy mode uses account proxy when present', () => {
    const route = resolveBeinRoute(accountWithProxy, {
        mode: BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
        operationId: 'operation-1',
    })

    assert.equal(route.mode, BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
    assert.equal(route.routeKey, 'proxy:proxy-1')
    assert.equal(route.proxyId, 'proxy-1')
    assert.equal(route.proxyLabel, 'Main proxy')
    assert.deepEqual(route.proxyConfig, {
        host: '45.38.219.132',
        port: 6310,
        username: 'proxy-user',
        password: 'proxy-password',
    })
})

test('assigned proxy mode keeps direct behavior for accounts without proxy', () => {
    const route = resolveBeinRoute(accountWithoutProxy, {
        mode: BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
        operationId: 'operation-2',
    })

    assert.equal(route.mode, BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
    assert.equal(route.routeKey, 'direct')
    assert.equal(route.proxyConfig, undefined)
})

test('server IP mode ignores assigned proxy without mutating account data', () => {
    const route = resolveBeinRoute(accountWithProxy, {
        mode: BEIN_CONNECTION_MODE_SERVER_IP,
        operationId: 'operation-3',
    })

    assert.equal(route.mode, BEIN_CONNECTION_MODE_SERVER_IP)
    assert.equal(route.routeKey, 'direct')
    assert.equal(route.proxyConfig, undefined)
    assert.equal(accountWithProxy.proxyId, 'proxy-1')
})

test('valid same-account snapshot overrides current global mode', () => {
    const originalRoute = resolveBeinRoute(accountWithProxy, {
        mode: BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
    })
    const snapshot = buildOperationRouteSnapshot(originalRoute, new Date('2026-06-03T12:00:00.000Z'))

    const route = resolveBeinRoute(accountWithProxy, {
        mode: BEIN_CONNECTION_MODE_SERVER_IP,
        snapshot,
    })

    assert.equal(route.mode, BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
    assert.equal(route.routeKey, 'proxy:proxy-1')
    assert.equal(route.proxyConfig?.host, '45.38.219.132')
})

test('mismatched snapshot falls back to legacy assigned proxy behavior', () => {
    const snapshot = {
        mode: BEIN_CONNECTION_MODE_SERVER_IP,
        routeKey: 'direct',
        accountId: 'different-account',
        createdAt: '2026-06-03T12:00:00.000Z',
    }

    const route = resolveBeinRoute(accountWithProxy, {
        mode: BEIN_CONNECTION_MODE_SERVER_IP,
        snapshot,
        legacyFallback: true,
    })

    assert.equal(route.mode, BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
    assert.equal(route.routeKey, 'proxy:proxy-1')
})

test('same-account proxy snapshot fails instead of silently switching route when proxy is missing', () => {
    const snapshot = {
        mode: BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
        routeKey: 'proxy:proxy-1',
        accountId: accountWithoutProxy.id,
        proxyId: 'proxy-1',
        proxyLabel: 'Main proxy',
        createdAt: '2026-06-03T12:00:00.000Z',
    }

    assert.throws(
        () => resolveBeinRoute(accountWithoutProxy, {
            mode: BEIN_CONNECTION_MODE_SERVER_IP,
            snapshot,
        }),
        /Stored beIN proxy route is no longer available/
    )
})
