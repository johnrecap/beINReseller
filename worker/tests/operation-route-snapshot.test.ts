import test from 'node:test'
import assert from 'node:assert/strict'
import {
    BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
    BEIN_CONNECTION_MODE_SERVER_IP,
    buildOperationRouteSnapshot,
    getOperationRouteSnapshot,
    mergeOperationRouteSnapshot,
    operationRouteSnapshotMatchesAccount,
    prepareRetryAccountResponseData,
    resolveBeinRoute,
    resolveRetryAccountRoute,
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

test('route snapshot stores only non-secret route metadata', () => {
    const route = resolveBeinRoute(accountWithProxy, {
        mode: BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
    })
    const snapshot = buildOperationRouteSnapshot(route, new Date('2026-06-03T12:00:00.000Z'))

    assert.deepEqual(Object.keys(snapshot).sort(), [
        'accountId',
        'createdAt',
        'mode',
        'proxyId',
        'proxyLabel',
        'routeKey',
    ])
    assert.equal(JSON.stringify(snapshot).includes('proxy-password'), false)
    assert.equal(JSON.stringify(snapshot).includes('proxy-user'), false)
})

test('merge route snapshot preserves existing response data fields', () => {
    const snapshot = {
        mode: BEIN_CONNECTION_MODE_SERVER_IP,
        routeKey: 'direct',
        accountId: 'account-1',
        createdAt: '2026-06-03T12:00:00.000Z',
    }

    const merged = mergeOperationRouteSnapshot(
        JSON.stringify({ packages: [{ name: 'Premium' }], operationPhase: 'PACKAGE_SELECTION' }),
        snapshot
    )

    assert.deepEqual(merged.packages, [{ name: 'Premium' }])
    assert.equal(merged.operationPhase, 'PACKAGE_SELECTION')
    assert.deepEqual(merged.beinRoute, snapshot)
})

test('operation route snapshot is usable only for the same account', () => {
    const snapshot = {
        mode: BEIN_CONNECTION_MODE_SERVER_IP,
        routeKey: 'direct',
        accountId: 'account-1',
        createdAt: '2026-06-03T12:00:00.000Z',
    }

    assert.equal(operationRouteSnapshotMatchesAccount(snapshot, 'account-1'), true)
    assert.equal(operationRouteSnapshotMatchesAccount(snapshot, 'account-2'), false)
})

test('route snapshot can be read from object or JSON response data', () => {
    const snapshot = {
        mode: BEIN_CONNECTION_MODE_SERVER_IP,
        routeKey: 'direct',
        accountId: 'account-1',
        createdAt: '2026-06-03T12:00:00.000Z',
    }

    assert.deepEqual(getOperationRouteSnapshot({ beinRoute: snapshot }), snapshot)
    assert.deepEqual(getOperationRouteSnapshot(JSON.stringify({ beinRoute: snapshot })), snapshot)
    assert.equal(getOperationRouteSnapshot('{bad json'), null)
})

test('retry account route keeps original server IP mode and clears stale preparation evidence', () => {
    const originalSnapshot = {
        mode: BEIN_CONNECTION_MODE_SERVER_IP,
        routeKey: 'direct',
        accountId: 'account-1',
        createdAt: '2026-06-03T12:00:00.000Z',
    }
    const responseData = {
        beinRoute: originalSnapshot,
        savedAt: '2026-06-03T12:01:00.000Z',
        dealerBalance: 1,
        dealerBalanceBefore: 1,
        packages: [{ name: 'Old package' }],
        sessionData: { cookie: 'old-session' },
        smartcardType: 'CISCO',
        finalPaySubmitted: false,
    }

    const route = resolveRetryAccountRoute(accountWithProxy, {
        previousResponseData: responseData,
        currentMode: BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
    })
    const prepared = prepareRetryAccountResponseData(
        responseData,
        route,
        new Date('2026-06-03T12:02:00.000Z')
    )

    assert.equal(route.mode, BEIN_CONNECTION_MODE_SERVER_IP)
    assert.equal(route.routeKey, 'direct')
    assert.equal(route.proxyConfig, undefined)
    assert.equal(prepared.requiresFreshPackageLoad, true)
    assert.equal(prepared.savedAt, undefined)
    assert.equal(prepared.dealerBalance, undefined)
    assert.equal(prepared.dealerBalanceBefore, undefined)
    assert.equal(prepared.packages, undefined)
    assert.equal(prepared.sessionData, undefined)
    assert.equal(prepared.smartcardType, 'CISCO')
    assert.deepEqual(prepared.beinRoute, buildOperationRouteSnapshot(route, new Date('2026-06-03T12:02:00.000Z')))
})

test('retry account route keeps legacy assigned-proxy behavior for old operations', () => {
    const responseData = {
        savedAt: '2026-06-03T12:01:00.000Z',
        dealerBalance: 1,
        smartcardType: 'CISCO',
    }

    const route = resolveRetryAccountRoute(accountWithProxy, {
        previousResponseData: responseData,
        currentMode: BEIN_CONNECTION_MODE_SERVER_IP,
    })
    const prepared = prepareRetryAccountResponseData(
        responseData,
        route,
        new Date('2026-06-03T12:02:00.000Z')
    )

    assert.equal(route.mode, BEIN_CONNECTION_MODE_ASSIGNED_PROXY)
    assert.equal(route.routeKey, 'proxy:proxy-1')
    assert.equal(route.proxyConfig?.host, '45.38.219.132')
    assert.equal(prepared.requiresFreshPackageLoad, true)
    assert.equal(prepared.savedAt, undefined)
    assert.equal(prepared.dealerBalance, undefined)
})
