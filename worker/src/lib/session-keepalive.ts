/**
 * Session Keep-Alive Service
 * 
 * Proactively refreshes beIN account sessions to ensure users never wait for login.
 * Runs as a separate PM2 process (bein-keepalive).
 * 
 * Features:
 * - Periodic refresh for all active accounts (configurable interval)
 * - Automatic CAPTCHA solving via 2Captcha
 * - Staggered refresh to avoid rate limiting (10 sec between accounts)
 * - Skips accounts that are currently locked (in use by operations)
 * - Redis-based session storage
 * - Metrics and logging
 */

import { prisma } from './prisma';
import { randomUUID } from 'node:crypto';
import { getRedisConnection } from './redis';
import { HttpClientService } from '../http/HttpClientService';
import type { LoginResult } from '../http/types';
import { CaptchaSolver } from '../utils/captcha-solver';
import { completeLoginChallenge } from './login-challenge';
import {
    getSessionFromCache,
    saveSessionToCache,
    getSessionTTL,
} from './session-cache';
import {
    recordLoginHealthFailure,
    recordLoginSuccess,
} from './bein-login-tracking';
import {
    extendLock,
    isAccountExecutionLeaseActive,
    lockAccount,
    unlockAccount,
} from '../pool/account-locking';
import {
    decideProviderAccountConsumerAccess,
    findActiveProviderAccountReservationForAccount,
    isProviderAccountAutomationEligible,
} from './provider-account-reservation';
import { checkAndNotifyLowBalance } from '../utils/notification';
import { BeinAccount, Proxy } from '@prisma/client';
import { decryptAccountPassword } from './crypto';
import {
    BEIN_CONNECTION_MODE_SETTING_KEY,
    DEFAULT_BEIN_CONNECTION_MODE,
    resolveBeinRoute,
    type EffectiveBeinRoute,
} from './bein-connection-mode';

// Types
interface AccountRefreshResult {
    accountId: string;
    username: string;
    status: 'extended' | 'refreshed' | 'logged_in' | 'skipped_locked' | 'skipped_inactive' | 'failed';
    captchaSolved?: boolean;
    error?: string;
    durationMs?: number;
}

interface RefreshCycleResult {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    results: AccountRefreshResult[];
    durationMs: number;
}

interface KeepAliveStats {
    totalCycles: number;
    lastCycleAt: Date | null;
    lastCycleResult: RefreshCycleResult | null;
    accountStats: Record<string, {
        refreshCount: number;
        lastRefreshAt: Date | null;
        lastStatus: string;
    }>;
}

const KEEPALIVE_ACCOUNT_GUARD_TTL_SECONDS = 120;
const KEEPALIVE_ACCOUNT_GUARD_HEARTBEAT_MS = 30_000;

async function getCurrentBeinConnectionMode(): Promise<string> {
    try {
        const setting = await prisma.setting.findUnique({
            where: { key: BEIN_CONNECTION_MODE_SETTING_KEY },
            select: { value: true }
        });
        return setting?.value || DEFAULT_BEIN_CONNECTION_MODE;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[KeepAlive] Failed to load beIN connection mode, using default: ${message}`);
        return DEFAULT_BEIN_CONNECTION_MODE;
    }
}

function safeRouteLogSuffix(route: EffectiveBeinRoute): string {
    if (route.proxyId) {
        return `mode=${route.mode} routeKey=${route.routeKey} using assigned proxy=${route.proxyLabel || route.proxyId}`;
    }

    if (route.mode === 'server_ip') {
        return `mode=${route.mode} routeKey=${route.routeKey} using emergency server IP; assigned proxy ignored`;
    }

    return `mode=${route.mode} routeKey=${route.routeKey} using direct server IP; no assigned proxy`;
}

async function resolveKeepAliveRoute(account: BeinAccount & { proxy?: Proxy | null }): Promise<EffectiveBeinRoute> {
    const mode = await getCurrentBeinConnectionMode();
    const route = resolveBeinRoute(account, { mode });
    console.log(`[KeepAlive] beIN route for ${account.username}: ${safeRouteLogSuffix(route)}`);
    return route;
}

/**
 * Get or create HTTP client for an account
 */
async function getHttpClient(
    account: BeinAccount & { proxy?: Proxy | null },
    route: EffectiveBeinRoute
): Promise<HttpClientService> {
    // Redis is authoritative for reusable sessions. Do not resurrect an in-memory
    // client after manual recovery invalidates this account's shared cookies.
    const client = new HttpClientService(route.proxyConfig, account.id);
    await client.initialize();
    if (!client.isSessionActive()) {
        try {
            const cachedSession = await getSessionFromCache(account.id, route.routeKey);
            if (cachedSession) {
                delete cachedSession.viewState;
                delete cachedSession.renewalSelection;
                delete cachedSession.preparedRenewal;
                await client.importSession(cachedSession);
                client.markSessionValidFromCache(cachedSession.expiresAt);
            }
        } catch (error) {
            console.log(`[KeepAlive] Could not restore cached session for ${account.username}`);
            throw error;
        }
    }

    return client;
}

/**
 * Get 2Captcha API key from database settings
 */
async function getCaptchaApiKey(): Promise<string | null> {
    try {
        const setting = await prisma.setting.findUnique({
            where: { key: 'captcha_2captcha_key' }
        });
        return setting?.value || null;
    } catch (error) {
        console.error('[KeepAlive] Failed to get CAPTCHA API key:', error);
        return null;
    }
}

export class SessionKeepAliveService {
    private refreshIntervalMs: number;
    private staggerDelayMs: number;
    private isRunning: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private stats: KeepAliveStats;
    private redis: ReturnType<typeof getRedisConnection>;

    constructor(refreshIntervalMinutes: number = 10, staggerDelayMs: number = 3000) {
        this.refreshIntervalMs = refreshIntervalMinutes * 60 * 1000;
        this.staggerDelayMs = staggerDelayMs;
        this.redis = getRedisConnection();
        this.stats = {
            totalCycles: 0,
            lastCycleAt: null,
            lastCycleResult: null,
            accountStats: {}
        };
    }

    /**
     * Load refresh interval from database settings
     */
    async loadConfig(): Promise<void> {
        try {
            const setting = await prisma.setting.findUnique({
                where: { key: 'keepalive_interval_minutes' }
            });
            if (setting?.value) {
                const minutes = parseInt(setting.value);
                if (minutes > 0) {
                    this.refreshIntervalMs = minutes * 60 * 1000;
                    console.log(`[KeepAlive] Loaded interval from settings: ${minutes} minutes`);
                }
            }
        } catch (error) {
            console.error('[KeepAlive] Failed to load config:', error);
        }
    }

    /**
     * Start the keep-alive service with periodic refresh.
     * Uses recursive setTimeout (not setInterval) so the interval
     * respects DB config changes between cycles.
     */
    start(): void {
        if (this.isRunning) {
            console.log('[KeepAlive] Service already running');
            return;
        }

        this.isRunning = true;
        console.log(`[KeepAlive] Starting periodic refresh (initial: ${this.refreshIntervalMs / 60000} minutes)`);

        const scheduleNext = (delayMs = this.refreshIntervalMs) => {
            this.intervalId = setTimeout(async () => {
                const cycleStartedAt = Date.now();
                console.log('[KeepAlive] Starting scheduled refresh cycle...');
                try {
                    await this.loadConfig(); // Reload — interval may have changed
                    const result = await this.refreshAllSessions();
                    console.log(`[KeepAlive] Cycle complete: ${result.success}/${result.total} accounts refreshed`);
                } catch (error) {
                    console.error('[KeepAlive] Refresh cycle error:', error);
                }
                // Start-to-start cadence, without overlapping cycles or adding a full
                // interval to the time already spent validating accounts.
                if (this.isRunning) scheduleNext(Math.max(0, this.refreshIntervalMs - (Date.now() - cycleStartedAt)));
            }, delayMs);
        };

        scheduleNext();
    }

    /**
     * Stop the keep-alive service
     */
    stop(): void {
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[KeepAlive] Service stopped');
    }

    /**
     * Refresh all active account sessions
     */
    async refreshAllSessions(): Promise<RefreshCycleResult> {
        const startTime = Date.now();
        const results: AccountRefreshResult[] = [];

        // Get all active accounts
        const accounts = await prisma.beinAccount.findMany({
            where: { isActive: true, automationExclusive: true },
            include: { proxy: true },
            orderBy: { priority: 'desc' }
        });

        console.log(`[KeepAlive] Refreshing ${accounts.length} active accounts...`);

        let success = 0;
        let failed = 0;
        let skipped = 0;

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];

            // Add stagger delay between accounts (except first)
            if (i > 0) {
                await this.delay(this.staggerDelayMs);
            }

            try {
                const result = await this.refreshSession(account);
                results.push(result);

                // Update stats
                this.stats.accountStats[account.id] = {
                    refreshCount: (this.stats.accountStats[account.id]?.refreshCount || 0) + 1,
                    lastRefreshAt: new Date(),
                    lastStatus: result.status
                };

                if (result.status === 'skipped_locked' || result.status === 'skipped_inactive') {
                    skipped++;
                } else if (result.status === 'failed') {
                    failed++;
                } else {
                    success++;

                    // Proactive balance monitoring: Check if account has low balance
                    // Uses stored balance from database (updated during package loading)
                    if (account.dealerBalance !== null) {
                        await checkAndNotifyLowBalance(
                            account.id,
                            account.label || account.username,
                            account.dealerBalance
                        );
                    }
                }

            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[KeepAlive] Error refreshing ${account.username}:`, errorMessage);
                results.push({
                    accountId: account.id,
                    username: account.username,
                    status: 'failed',
                    error: errorMessage
                });
                failed++;
            }
        }

        const cycleResult: RefreshCycleResult = {
            total: accounts.length,
            success,
            failed,
            skipped,
            results,
            durationMs: Date.now() - startTime
        };

        // Update stats
        this.stats.totalCycles++;
        this.stats.lastCycleAt = new Date();
        this.stats.lastCycleResult = cycleResult;

        // Store metrics in Redis for API access
        await this.saveMetricsToRedis();

        return cycleResult;
    }

    /**
     * Refresh a single account's session
     * - Skips if account is locked (in use by operation)
     * - Extends TTL if session has > 5 min remaining
     * - Validates session on beIN server
     * - Performs full login if session expired
     */
    async refreshSession(rawAccount: BeinAccount & { proxy?: Proxy | null }): Promise<AccountRefreshResult> {
        const startTime = Date.now();
        const accountId = rawAccount.id;
        const username = rawAccount.username;
        if (!isProviderAccountAutomationEligible(rawAccount)) {
            return {
                accountId,
                username,
                status: 'skipped_inactive',
                durationMs: Date.now() - startTime,
            };
        }

        const reservationBeforeGuard = await findActiveProviderAccountReservationForAccount(
            prisma,
            accountId
        );
        const accessBeforeGuard = decideProviderAccountConsumerAccess({
            consumer: 'KEEPALIVE',
            activeReservation: reservationBeforeGuard
                ? {
                    operationId: reservationBeforeGuard.operationId,
                    reservationGeneration: reservationBeforeGuard.reservationGeneration,
                }
                : null,
            requester: null,
        });
        if (!accessBeforeGuard.allowed || await isAccountExecutionLeaseActive(this.redis, accountId)) {
            return {
                accountId,
                username,
                status: 'skipped_locked',
                durationMs: Date.now() - startTime,
            };
        }

        const guardOwner = `keepalive-${process.pid}-${randomUUID()}`;
        const guardAcquired = await lockAccount(
            this.redis,
            accountId,
            guardOwner,
            KEEPALIVE_ACCOUNT_GUARD_TTL_SECONDS
        );
        if (!guardAcquired) {
            return {
                accountId,
                username,
                status: 'skipped_locked',
                durationMs: Date.now() - startTime,
            };
        }

        const heartbeat = setInterval(() => {
            void extendLock(
                this.redis,
                accountId,
                guardOwner,
                KEEPALIVE_ACCOUNT_GUARD_TTL_SECONDS
            ).catch(() => false);
        }, KEEPALIVE_ACCOUNT_GUARD_HEARTBEAT_MS);
        heartbeat.unref();

        try {
            // Recheck after acquiring Redis guard to close the DB/Redis race.
            const reservationAfterGuard = await findActiveProviderAccountReservationForAccount(
                prisma,
                accountId
            );
            const accessAfterGuard = decideProviderAccountConsumerAccess({
                consumer: 'KEEPALIVE',
                activeReservation: reservationAfterGuard
                    ? {
                        operationId: reservationAfterGuard.operationId,
                        reservationGeneration: reservationAfterGuard.reservationGeneration,
                    }
                    : null,
                requester: null,
            });
            if (!accessAfterGuard.allowed || await isAccountExecutionLeaseActive(this.redis, accountId)) {
                return {
                    accountId,
                    username,
                    status: 'skipped_locked',
                    durationMs: Date.now() - startTime,
                };
            }
            return await this.refreshSessionWithGuard(rawAccount, guardOwner);
        } finally {
            clearInterval(heartbeat);
            await unlockAccount(this.redis, accountId, guardOwner).catch(() => false);
        }
    }

    private async refreshSessionWithGuard(rawAccount: BeinAccount & { proxy?: Proxy | null }, guardOwner: string): Promise<AccountRefreshResult> {
        // SECURITY: Decrypt encrypted password from DB
        const account = decryptAccountPassword(rawAccount);
        const startTime = Date.now();
        const accountId = account.id;
        const cacheGuard = { key: `bein:account:lock:${accountId}`, owner: guardOwner };
        const assertGuard = async () => {
            if (await this.redis.get(cacheGuard.key) !== guardOwner) throw new Error('KEEPALIVE_ACCOUNT_GUARD_LOST');
        };
        const username = account.username;
        const route = await resolveKeepAliveRoute(account);

        console.log(`[KeepAlive] Processing: ${username}`);

        // Account access is already guarded by refreshSession.
        // Check existing session TTL in Redis.
        const ttl = await getSessionTTL(accountId, route.routeKey);
        const ttlMinutes = ttl > 0 ? Math.floor(ttl / 60) : 0;

        // 3. Always validate with beIN server to keep the REAL session alive
        // Previously we skipped validation when TTL > 5 min, but that only extended
        // Redis TTL without touching the beIN server. The beIN server has its own
        // session timeout (~20 min) that expires independently of Redis.
        const client = await getHttpClient(account, route);
        await client.reloadConfig();

        if (ttl > 0) {
            // Session exists in Redis - validate it's still alive on beIN
            console.log(`[KeepAlive] ${username}: Redis TTL ${ttlMinutes} min, validating on beIN server...`);
            await assertGuard();
            const sessionValid = await client.validateSession();
            await assertGuard();

            if (sessionValid) {
                // Session is truly alive on beIN - extend Redis TTL
                const sessionData = await client.exportSession();
                const now = Date.now();
                sessionData.expiresAt = now + client.getSessionTimeout() * 60_000;
                sessionData.loginTimestamp = now;
                await assertGuard();
                await saveSessionToCache(accountId, route.routeKey, sessionData, client.getSessionTimeout(), cacheGuard);
                console.log(`[KeepAlive] ${username}: Session validated on beIN and extended`);
                return {
                    accountId,
                    username,
                    status: 'refreshed',
                    durationMs: Date.now() - startTime
                };
            }

            // Session expired on beIN despite Redis having it - fall through to login
            console.log(`[KeepAlive] ${username}: Session expired on beIN server (Redis had ${ttlMinutes} min left)`);
        } else {
            console.log(`[KeepAlive] ${username}: No session in Redis, need login...`);
        }
        // 5. Session expired on beIN - need full login
        // CRITICAL FIX: Clear old cookies before re-login!
        // Without this, the old ASP.NET_SessionId persists and beIN recycles it
        // with a shorter timeout, causing sessions to die every cycle.
        client.resetSession();
        console.log(`[KeepAlive] ${username}: Session expired on beIN, performing fresh login...`);

        await assertGuard();
        const initialLogin = await client.login(username, account.password, account.totpSecret || undefined);
        await assertGuard();
        const completion = await completeLoginChallenge(initialLogin, {
            assertCurrent: assertGuard,
            getApiKey: getCaptchaApiKey,
            solve: (key, image) => new CaptchaSolver(key).solve(image),
            submit: solution => client.submitLogin(username, account.password, account.totpSecret || undefined, solution),
            attempted: client.didAttemptLogin(),
        });
        const loginResult = completion.result;
        const recordTerminal = async (result: LoginResult) => {
            if (!completion.context.terminal) return;
            await assertGuard();
            if (!await recordLoginHealthFailure(accountId, result, client.getLoginTrackingRevision(),
                completion.context)) throw new Error('LOGIN_HEALTH_STALE');
        };

        // Publish only after authentication and ownership have both been verified.
        if (loginResult.success) {
            await assertGuard();
            await recordLoginSuccess(accountId, client.getLoginTrackingRevision());
            const sessionData = await client.exportSession();
            // FIX: Update timestamps before saving
            const now = Date.now();
            sessionData.expiresAt = now + client.getSessionTimeout() * 60_000;
            sessionData.loginTimestamp = now;
            await assertGuard();
            await saveSessionToCache(accountId, route.routeKey, sessionData, client.getSessionTimeout(), cacheGuard);
            console.log(`[KeepAlive] ${username}: Login successful`);
            return {
                accountId,
                username,
                status: 'logged_in',
                captchaSolved: (completion.context.captchaSubmissions ?? 0) > 0,
                durationMs: Date.now() - startTime
            };
        }

        await recordTerminal(loginResult);

        return {
            accountId,
            username,
            status: 'failed',
            error: loginResult.error || 'Login failed',
            durationMs: Date.now() - startTime
        };
    }

    /**
     * Get current statistics
     */
    getStats(): KeepAliveStats {
        return { ...this.stats };
    }

    /**
     * Save metrics to Redis for API access
     */
    private async saveMetricsToRedis(): Promise<void> {
        try {
            const metricsKey = 'bein:keepalive:metrics';
            const metrics = {
                ...this.stats,
                updatedAt: new Date().toISOString()
            };
            await this.redis.setex(metricsKey, 3600, JSON.stringify(metrics)); // 1 hour TTL
        } catch (error) {
            console.error('[KeepAlive] Failed to save metrics to Redis:', error);
        }
    }

    /**
     * Helper: delay for staggering
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if service is running
     */
    isActive(): boolean {
        return this.isRunning;
    }

    /**
     * Get refresh interval in minutes
     */
    getIntervalMinutes(): number {
        return this.refreshIntervalMs / 60000;
    }
}

/**
 * Close all HTTP clients (cleanup)
 */
export function closeAllKeepAliveClients(): void {
    // Clients are cycle-local; no reusable in-memory sessions survive a recovery.
    console.log('[KeepAlive] HTTP clients are released after each refresh');
}
