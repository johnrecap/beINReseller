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
import { getRedisConnection } from './redis';
import { HttpClientService } from '../http/HttpClientService';
import { CaptchaSolver } from '../utils/captcha-solver';
import { 
    getSessionFromCache, 
    saveSessionToCache, 
    getSessionTTL,
    refreshSessionExpiry 
} from './session-cache';
import { isAccountLocked } from '../pool/account-locking';
import { checkAndNotifyLowBalance } from '../utils/notification';
import { BeinAccount, Proxy } from '@prisma/client';
import { ProxyConfig } from '../types/proxy';

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

// HTTP client cache (per account)
const httpClients = new Map<string, HttpClientService>();

/**
 * Get or create HTTP client for an account
 */
async function getHttpClient(account: BeinAccount & { proxy?: Proxy | null }): Promise<HttpClientService> {
    const cacheKey = account.proxyId ? `${account.id}:${account.proxyId}` : account.id;
    let client = httpClients.get(cacheKey);

    if (!client) {
        let proxyConfig: ProxyConfig | undefined;
        if (account.proxy) {
            proxyConfig = {
                host: account.proxy.host,
                port: account.proxy.port,
                username: account.proxy.username,
                password: account.proxy.password
            };
        }
        client = new HttpClientService(proxyConfig);
        await client.initialize();
        httpClients.set(cacheKey, client);
        console.log(`[KeepAlive] Created HTTP client for ${account.username}`);
    }

    // Try to restore session from Redis cache
    try {
        const cachedSession = await getSessionFromCache(account.id);
        if (cachedSession) {
            await client.importSession(cachedSession);
            client.markSessionValidFromCache();
        }
    } catch (error) {
        console.log(`[KeepAlive] Could not restore cached session for ${account.username}`);
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

    constructor(refreshIntervalMinutes: number = 19, staggerDelayMs: number = 10000) {
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
     * Start the keep-alive service with periodic refresh
     */
    start(): void {
        if (this.isRunning) {
            console.log('[KeepAlive] Service already running');
            return;
        }

        this.isRunning = true;
        console.log(`[KeepAlive] Starting periodic refresh (every ${this.refreshIntervalMs / 60000} minutes)`);

        this.intervalId = setInterval(async () => {
            console.log('[KeepAlive] Starting scheduled refresh cycle...');
            try {
                await this.loadConfig(); // Reload config in case it changed
                const result = await this.refreshAllSessions();
                console.log(`[KeepAlive] Cycle complete: ${result.success}/${result.total} accounts refreshed`);
            } catch (error) {
                console.error('[KeepAlive] Refresh cycle error:', error);
            }
        }, this.refreshIntervalMs);
    }

    /**
     * Stop the keep-alive service
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
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
            where: { isActive: true },
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

            } catch (error: any) {
                console.error(`[KeepAlive] Error refreshing ${account.username}:`, error.message);
                results.push({
                    accountId: account.id,
                    username: account.username,
                    status: 'failed',
                    error: error.message
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
    async refreshSession(account: BeinAccount & { proxy?: Proxy | null }): Promise<AccountRefreshResult> {
        const startTime = Date.now();
        const accountId = account.id;
        const username = account.username;

        console.log(`[KeepAlive] Processing: ${username}`);

        // 1. Check if account is locked (in use by an operation)
        const locked = await isAccountLocked(this.redis, accountId);
        if (locked) {
            console.log(`[KeepAlive] ${username}: Skipped - account locked (in use)`);
            return {
                accountId,
                username,
                status: 'skipped_locked',
                durationMs: Date.now() - startTime
            };
        }

        // 2. Check existing session TTL in Redis
        const ttl = await getSessionTTL(accountId);
        const ttlMinutes = ttl > 0 ? Math.floor(ttl / 60) : 0;

        // 3. Always validate with beIN server to keep the REAL session alive
        // Previously we skipped validation when TTL > 5 min, but that only extended
        // Redis TTL without touching the beIN server. The beIN server has its own
        // session timeout (~20 min) that expires independently of Redis.
        const client = await getHttpClient(account);
        await client.reloadConfig();

        if (ttl > 0) {
            // Session exists in Redis - validate it's still alive on beIN
            console.log(`[KeepAlive] ${username}: Redis TTL ${ttlMinutes} min, validating on beIN server...`);
            const sessionValid = await client.validateSession();

            if (sessionValid) {
                // Session is truly alive on beIN - extend Redis TTL
                const sessionData = await client.exportSession();
                const now = Date.now();
                sessionData.expiresAt = now + (15 * 60 * 1000);  // 15 min from now
                sessionData.loginTimestamp = now;
                await saveSessionToCache(accountId, sessionData, 16);
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
        console.log(`[KeepAlive] ${username}: Session expired on beIN, performing login...`);

        const loginResult = await client.login(username, account.password, account.totpSecret || undefined);

        // Handle CAPTCHA if required
        if (loginResult.requiresCaptcha && loginResult.captchaImage) {
            console.log(`[KeepAlive] ${username}: CAPTCHA required, auto-solving...`);

            const apiKey = await getCaptchaApiKey();
            if (!apiKey) {
                console.error(`[KeepAlive] ${username}: No 2Captcha API key configured`);
                return {
                    accountId,
                    username,
                    status: 'failed',
                    error: 'CAPTCHA required but no API key configured',
                    durationMs: Date.now() - startTime
                };
            }

            try {
                const solver = new CaptchaSolver(apiKey);
                const solution = await solver.solve(loginResult.captchaImage);

                const finalLogin = await client.submitLogin(
                    username,
                    account.password,
                    account.totpSecret || undefined,
                    solution
                );

                if (finalLogin.success) {
                    const sessionData = await client.exportSession();
                    // FIX: Update timestamps before saving
                    const now = Date.now();
                    sessionData.expiresAt = now + (15 * 60 * 1000);  // 15 min from now
                    sessionData.loginTimestamp = now;
                    await saveSessionToCache(accountId, sessionData, 16);
                    console.log(`[KeepAlive] ${username}: Login successful (CAPTCHA solved)`);
                    return {
                        accountId,
                        username,
                        status: 'logged_in',
                        captchaSolved: true,
                        durationMs: Date.now() - startTime
                    };
                } else {
                    return {
                        accountId,
                        username,
                        status: 'failed',
                        error: finalLogin.error || 'Login failed after CAPTCHA',
                        captchaSolved: true,
                        durationMs: Date.now() - startTime
                    };
                }
            } catch (captchaError: any) {
                console.error(`[KeepAlive] ${username}: CAPTCHA solve failed:`, captchaError.message);
                return {
                    accountId,
                    username,
                    status: 'failed',
                    error: `CAPTCHA solve failed: ${captchaError.message}`,
                    durationMs: Date.now() - startTime
                };
            }
        }

        // Login without CAPTCHA
        if (loginResult.success) {
            const sessionData = await client.exportSession();
            // FIX: Update timestamps before saving
            const now = Date.now();
            sessionData.expiresAt = now + (15 * 60 * 1000);  // 15 min from now
            sessionData.loginTimestamp = now;
            await saveSessionToCache(accountId, sessionData, 16);
            console.log(`[KeepAlive] ${username}: Login successful`);
            return {
                accountId,
                username,
                status: 'logged_in',
                durationMs: Date.now() - startTime
            };
        }

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
    console.log(`[KeepAlive] Closing ${httpClients.size} HTTP clients...`);
    httpClients.clear();
}
