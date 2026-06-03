import { ProxyConfig } from '../types/proxy'

export const BEIN_CONNECTION_MODE_ASSIGNED_PROXY = 'assigned_proxy'
export const BEIN_CONNECTION_MODE_SERVER_IP = 'server_ip'

export const BEIN_CONNECTION_MODE_SETTING_KEY = 'bein_connection_mode'
export const DEFAULT_BEIN_CONNECTION_MODE = BEIN_CONNECTION_MODE_ASSIGNED_PROXY

export type BeinConnectionMode =
    | typeof BEIN_CONNECTION_MODE_ASSIGNED_PROXY
    | typeof BEIN_CONNECTION_MODE_SERVER_IP

export interface BeinRouteProxy {
    id: string
    host: string
    port: number
    username?: string | null
    password?: string | null
    label?: string | null
    proxyType?: ProxyConfig['proxyType'] | null
}

export interface BeinRouteAccount {
    id: string
    username: string
    label?: string | null
    proxyId?: string | null
    proxy?: BeinRouteProxy | null
}

export interface OperationRouteSnapshot {
    mode: BeinConnectionMode
    routeKey: string
    accountId: string
    proxyId?: string
    proxyLabel?: string
    createdAt: string
}

export interface EffectiveBeinRoute {
    mode: BeinConnectionMode
    routeKey: string
    accountId: string
    proxyId?: string
    proxyLabel?: string
    proxyConfig?: ProxyConfig
}

export function normalizeBeinConnectionMode(value: unknown): BeinConnectionMode {
    return value === BEIN_CONNECTION_MODE_SERVER_IP || value === BEIN_CONNECTION_MODE_ASSIGNED_PROXY
        ? value
        : DEFAULT_BEIN_CONNECTION_MODE
}

function proxyRouteKey(proxyId: string): string {
    return `proxy:${proxyId}`
}

function buildProxyConfig(proxy: BeinRouteProxy): ProxyConfig {
    return {
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        password: proxy.password,
        ...(proxy.proxyType ? { proxyType: proxy.proxyType } : {}),
    }
}

function routeFromAssignedProxy(account: BeinRouteAccount): EffectiveBeinRoute {
    if (account.proxy?.id) {
        return {
            mode: BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
            routeKey: proxyRouteKey(account.proxy.id),
            accountId: account.id,
            proxyId: account.proxy.id,
            proxyLabel: account.proxy.label || account.proxy.host,
            proxyConfig: buildProxyConfig(account.proxy),
        }
    }

    return {
        mode: BEIN_CONNECTION_MODE_ASSIGNED_PROXY,
        routeKey: 'direct',
        accountId: account.id,
    }
}

function routeFromServerIp(account: BeinRouteAccount): EffectiveBeinRoute {
    return {
        mode: BEIN_CONNECTION_MODE_SERVER_IP,
        routeKey: 'direct',
        accountId: account.id,
    }
}

function routeFromSnapshot(
    account: BeinRouteAccount,
    snapshot: OperationRouteSnapshot
): EffectiveBeinRoute {
    if (snapshot.routeKey.startsWith('proxy:')) {
        const proxy = account.proxy?.id === snapshot.proxyId ? account.proxy : null
        if (!proxy) {
            throw new Error('Stored beIN proxy route is no longer available for this account')
        }

        return {
            mode: snapshot.mode,
            routeKey: snapshot.routeKey,
            accountId: account.id,
            proxyId: snapshot.proxyId,
            proxyLabel: snapshot.proxyLabel,
            proxyConfig: buildProxyConfig(proxy),
        }
    }

    return {
        mode: snapshot.mode,
        routeKey: snapshot.routeKey,
        accountId: account.id,
    }
}

export function operationRouteSnapshotMatchesAccount(
    snapshot: OperationRouteSnapshot | null | undefined,
    accountId: string
): snapshot is OperationRouteSnapshot {
    return !!snapshot && snapshot.accountId === accountId
}

export function resolveBeinRoute(
    account: BeinRouteAccount,
    options: {
        mode: unknown
        operationId?: string
        snapshot?: OperationRouteSnapshot | null
        legacyFallback?: boolean
    }
): EffectiveBeinRoute {
    if (operationRouteSnapshotMatchesAccount(options.snapshot, account.id)) {
        return routeFromSnapshot(account, options.snapshot)
    }

    if (options.legacyFallback) {
        return routeFromAssignedProxy(account)
    }

    return normalizeBeinConnectionMode(options.mode) === BEIN_CONNECTION_MODE_SERVER_IP
        ? routeFromServerIp(account)
        : routeFromAssignedProxy(account)
}

export function resolveRetryAccountRoute(
    account: BeinRouteAccount,
    options: {
        previousResponseData?: unknown
        currentMode?: unknown
    }
): EffectiveBeinRoute {
    const previousSnapshot = getOperationRouteSnapshot(options.previousResponseData)
    const retryMode = previousSnapshot?.mode || BEIN_CONNECTION_MODE_ASSIGNED_PROXY

    return resolveBeinRoute(account, {
        mode: retryMode,
    })
}

export function buildOperationRouteSnapshot(
    route: EffectiveBeinRoute,
    now: Date = new Date()
): OperationRouteSnapshot {
    return {
        mode: route.mode,
        routeKey: route.routeKey,
        accountId: route.accountId,
        ...(route.proxyId ? { proxyId: route.proxyId } : {}),
        ...(route.proxyLabel ? { proxyLabel: route.proxyLabel } : {}),
        createdAt: now.toISOString(),
    }
}

export function parseResponseDataObject(responseData: unknown): Record<string, unknown> {
    if (!responseData) return {}
    if (typeof responseData === 'string') {
        try {
            const parsed = JSON.parse(responseData)
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : {}
        } catch {
            return {}
        }
    }

    return typeof responseData === 'object' && !Array.isArray(responseData)
        ? responseData as Record<string, unknown>
        : {}
}

function isOperationRouteSnapshot(value: unknown): value is OperationRouteSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const route = value as Record<string, unknown>
    return (
        (route.mode === BEIN_CONNECTION_MODE_ASSIGNED_PROXY || route.mode === BEIN_CONNECTION_MODE_SERVER_IP) &&
        typeof route.routeKey === 'string' &&
        typeof route.accountId === 'string' &&
        typeof route.createdAt === 'string'
    )
}

export function getOperationRouteSnapshot(responseData: unknown): OperationRouteSnapshot | null {
    const data = parseResponseDataObject(responseData)
    return isOperationRouteSnapshot(data.beinRoute) ? data.beinRoute : null
}

export function mergeOperationRouteSnapshot(
    responseData: unknown,
    snapshot: OperationRouteSnapshot
): Record<string, unknown> {
    return {
        ...parseResponseDataObject(responseData),
        beinRoute: snapshot,
    }
}

export function prepareRetryAccountResponseData(
    responseData: unknown,
    route: EffectiveBeinRoute,
    now: Date = new Date()
): Record<string, unknown> {
    const data = parseResponseDataObject(responseData)
    const retryData: Record<string, unknown> = {
        ...data,
        beinRoute: buildOperationRouteSnapshot(route, now),
        requiresFreshPackageLoad: true,
        accountRetrySelectedAt: now.toISOString(),
    }

    delete retryData.savedAt
    delete retryData.dealerBalance
    delete retryData.dealerBalanceBefore
    delete retryData.dealerBalanceAfter
    delete retryData.sessionData
    delete retryData.packages
    delete retryData.operationPhase

    return retryData
}
