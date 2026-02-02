/**
 * Session Keep-Alive Manager for beIN Accounts
 * 
 * Runs in the background to keep beIN sessions alive by sending
 * periodic lightweight requests. This prevents session expiry and
 * reduces login frequency.
 * 
 * Features:
 * - Periodic session refresh for all active accounts
 * - Lightweight GET request to Check page
 * - Automatic session invalidation on failure
 * - Configurable refresh interval
 * - Metrics tracking
 */

import { prisma } from '../lib/prisma';
import { HttpClientService } from '../http';
import { BeinAccount, Proxy } from '@prisma/client';
import { ProxyConfig } from '../types/proxy';
import {
    getSessionFromCache,
    saveSessionToCache,
    deleteSessionFromCache,
    getAllCachedSessionIds,
    refreshSessionExpiry,
    getSessionRemainingTime
} from '../lib/session-cache';

// Keep-alive configuration
const DEFAULT_KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;  // 10 minutes
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;              // 15 minutes
const REFRESH_THRESHOLD_MS = 3 * 60 * 1000;             // Refresh if < 3 min left

// Metrics
interface KeepAliveMetrics {
    totalRefreshAttempts: number;
    successfulRefreshes: number;
    failedRefreshes: number;
    lastRunTime: Date | null;
    lastRunDurationMs: number;
}

interface RefreshResult {
    accountId: string;
    username: string;
    success: boolean;
    error?: string;
    remainingTimeMs?: number;
}

export interface KeepAliveStatus {
    running: boolean;
    intervalMs: number;
    metrics: KeepAliveMetrics;
    accountsWithSession: number;
}

export class SessionKeepAlive {
    private interval: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private httpClients: Map<string, HttpClientService>;
    private metrics: KeepAliveMetrics = {
        totalRefreshAttempts: 0,
        successfulRefreshes: 0,
        failedRefreshes: 0,
        lastRunTime: null,
        lastRunDurationMs: 0
    };
    private intervalMs: number = DEFAULT_KEEPALIVE_INTERVAL_MS;

    constructor(httpClients: Map<string, HttpClientService>) {
        this.httpClients = httpClients;
    }

    /**
     * Start the keep-alive background loop
     * @param intervalMs - Refresh interval in milliseconds (default: 10 minutes)
     */
    start(intervalMs: number = DEFAULT_KEEPALIVE_INTERVAL_MS): void {
        if (this.isRunning) {
            console.log('[KeepAlive] Already running');
            return;
        }

        this.intervalMs = intervalMs;
        this.isRunning = true;

        console.log(`[KeepAlive] Starting session keep-alive (interval: ${Math.floor(intervalMs / 60000)} min)`);

        // Run immediately on start
        this.refreshAllSessions().catch(err => {
            console.error('[KeepAlive] Initial refresh failed:', err.message);
        });

        // Set up periodic refresh
        this.interval = setInterval(async () => {
            try {
                await this.refreshAllSessions();
            } catch (error: any) {
                console.error('[KeepAlive] Refresh cycle failed:', error.message);
            }
        }, intervalMs);

        console.log('[KeepAlive] Session keep-alive started');
    }

    /**
     * Stop the keep-alive background loop
     */
    stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        console.log('[KeepAlive] Session keep-alive stopped');
    }

    /**
     * Refresh all active beIN account sessions
     */
    async refreshAllSessions(): Promise<RefreshResult[]> {
        const startTime = Date.now();
        const results: RefreshResult[] = [];

        console.log('[KeepAlive] 🔄 Starting session refresh cycle...');

        try {
            // Get all active beIN accounts
            const accounts = await prisma.beinAccount.findMany({
                where: { isActive: true },
                include: { proxy: true }
            });

            if (accounts.length === 0) {
                console.log('[KeepAlive] No active accounts to refresh');
                return results;
            }

            console.log(`[KeepAlive] Found ${accounts.length} active accounts`);

            // Refresh each account's session
            for (const account of accounts) {
                const result = await this.refreshSession(account);
                results.push(result);
                this.metrics.totalRefreshAttempts++;

                if (result.success) {
                    this.metrics.successfulRefreshes++;
                } else {
                    this.metrics.failedRefreshes++;
                }

                // Small delay between accounts to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Log summary
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            const skipped = results.filter(r => r.error?.includes('No cached session')).length;

            console.log(`[KeepAlive] ✅ Refresh complete: ${successful} success, ${failed - skipped} failed, ${skipped} skipped (no session)`);

        } catch (error: any) {
            console.error('[KeepAlive] Error during refresh cycle:', error.message);
        }

        // Update metrics
        this.metrics.lastRunTime = new Date();
        this.metrics.lastRunDurationMs = Date.now() - startTime;

        return results;
    }

    /**
     * Refresh a single account's session
     */
    async refreshSession(account: BeinAccount & { proxy?: Proxy | null }): Promise<RefreshResult> {
        const result: RefreshResult = {
            accountId: account.id,
            username: account.username,
            success: false
        };

        try {
            // Check if session exists in cache
            const cachedSession = await getSessionFromCache(account.id);
            if (!cachedSession) {
                result.error = 'No cached session';
                console.log(`[KeepAlive] ⏭️ ${account.username}: No cached session, skipping`);
                return result;
            }

            // Check remaining time
            const remainingMs = await getSessionRemainingTime(account.id);
            result.remainingTimeMs = remainingMs;

            if (remainingMs < 0) {
                result.error = 'Session already expired';
                console.log(`[KeepAlive] ⏭️ ${account.username}: Session already expired`);
                await deleteSessionFromCache(account.id);
                return result;
            }

            const remainingMin = Math.floor(remainingMs / 60000);
            console.log(`[KeepAlive] 🔍 ${account.username}: ${remainingMin} min remaining`);

            // Get or create HTTP client
            const client = await this.getOrCreateClient(account);

            // Import the cached session
            await client.importSession(cachedSession);

            // Send lightweight keep-alive request (GET Check page)
            const isStillValid = await this.sendKeepAliveRequest(client);

            if (isStillValid) {
                // Session is still valid - refresh the expiry
                await refreshSessionExpiry(account.id, SESSION_TIMEOUT_MS);
                
                // Update in-memory client session too
                const now = Date.now();
                client.markSessionValidFromCache(now + SESSION_TIMEOUT_MS);

                result.success = true;
                result.remainingTimeMs = SESSION_TIMEOUT_MS;
                console.log(`[KeepAlive] ✅ ${account.username}: Session refreshed (15 min)`);
            } else {
                // Session expired on beIN side - delete from cache
                await deleteSessionFromCache(account.id);
                client.invalidateSession();
                
                result.error = 'Session expired on beIN portal';
                console.log(`[KeepAlive] ❌ ${account.username}: Session expired, will login next time`);
            }

        } catch (error: any) {
            result.error = error.message;
            console.error(`[KeepAlive] ❌ ${account.username}: ${error.message}`);

            // On error, invalidate the session to force fresh login
            await deleteSessionFromCache(account.id);
        }

        return result;
    }

    /**
     * Send a lightweight keep-alive request to beIN
     * Returns true if session is still valid
     */
    private async sendKeepAliveRequest(client: HttpClientService): Promise<boolean> {
        try {
            // Reload config to get latest URLs
            await client.reloadConfig();

            // Get the axios instance for direct requests
            const axiosInstance = (client as any).axios;
            const config = (client as any).config;

            if (!axiosInstance || !config) {
                console.error('[KeepAlive] Cannot access HTTP client internals');
                return false;
            }

            // Build Check page URL
            const checkUrl = config.checkUrl?.startsWith('http')
                ? config.checkUrl
                : new URL(config.checkUrl || '/Dealers/Pages/frmCheck.aspx', config.loginUrl).toString();

            console.log(`[KeepAlive] GET ${checkUrl}`);

            // Send GET request
            const response = await axiosInstance.get(checkUrl, {
                timeout: 15000,
                headers: {
                    'Referer': config.loginUrl
                }
            });

            // Check if still logged in (not redirected to login page)
            const html = response.data as string;
            const isLoginPage = this.isLoginPage(html);

            return !isLoginPage;

        } catch (error: any) {
            console.error(`[KeepAlive] Request failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if HTML response is a login page
     */
    private isLoginPage(html: string): boolean {
        // Check for login form elements
        const loginIndicators = [
            'Login1_UserName',
            'Login1_LoginButton',
            'Login1_Password',
            'ImageVerificationDealer'
        ];

        for (const indicator of loginIndicators) {
            if (html.includes(indicator)) {
                return true;
            }
        }

        // Check page title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
            const title = titleMatch[1].toLowerCase();
            if (title.includes('login') || title.includes('sign in')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get or create HTTP client for an account
     */
    private async getOrCreateClient(account: BeinAccount & { proxy?: Proxy | null }): Promise<HttpClientService> {
        const cacheKey = account.proxyId ? `${account.id}:${account.proxyId}` : account.id;
        let client = this.httpClients.get(cacheKey);

        if (!client) {
            // Build proxy config
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
            this.httpClients.set(cacheKey, client);
        }

        return client;
    }

    /**
     * Get current keep-alive status
     */
    getStatus(): KeepAliveStatus {
        return {
            running: this.isRunning,
            intervalMs: this.intervalMs,
            metrics: { ...this.metrics },
            accountsWithSession: this.httpClients.size
        };
    }

    /**
     * Check if keep-alive is running
     */
    isActive(): boolean {
        return this.isRunning;
    }

    /**
     * Force refresh a specific account's session
     */
    async forceRefresh(accountId: string): Promise<RefreshResult> {
        const account = await prisma.beinAccount.findUnique({
            where: { id: accountId },
            include: { proxy: true }
        });

        if (!account) {
            return {
                accountId,
                username: 'unknown',
                success: false,
                error: 'Account not found'
            };
        }

        return this.refreshSession(account);
    }

    /**
     * Pre-login an account (establish fresh session without cached one)
     */
    async preLogin(account: BeinAccount & { proxy?: Proxy | null }): Promise<boolean> {
        try {
            console.log(`[KeepAlive] 🔑 Pre-login for ${account.username}...`);

            const client = await this.getOrCreateClient(account);

            // Perform actual login
            const loginResult = await client.login(
                account.username,
                account.password,
                account.totpSecret || undefined
            );

            if (loginResult.success) {
                // Save session to cache
                const sessionData = await client.exportSession();
                await saveSessionToCache(account.id, sessionData, 16);
                console.log(`[KeepAlive] ✅ Pre-login successful for ${account.username}`);
                return true;
            } else if (loginResult.requiresCaptcha) {
                console.log(`[KeepAlive] ⚠️ Pre-login requires CAPTCHA for ${account.username}`);
                return false;
            } else {
                console.log(`[KeepAlive] ❌ Pre-login failed for ${account.username}: ${loginResult.error}`);
                return false;
            }

        } catch (error: any) {
            console.error(`[KeepAlive] ❌ Pre-login error for ${account.username}: ${error.message}`);
            return false;
        }
    }

    /**
     * Pre-login all active accounts (useful for worker startup)
     */
    async preLoginAllAccounts(): Promise<{ success: number; failed: number; captcha: number }> {
        const results = { success: 0, failed: 0, captcha: 0 };

        const accounts = await prisma.beinAccount.findMany({
            where: { isActive: true },
            include: { proxy: true }
        });

        console.log(`[KeepAlive] 🔑 Pre-logging in ${accounts.length} accounts...`);

        for (const account of accounts) {
            // Check if already has valid session
            const existingSession = await getSessionFromCache(account.id);
            if (existingSession) {
                const remaining = await getSessionRemainingTime(account.id);
                if (remaining > REFRESH_THRESHOLD_MS) {
                    console.log(`[KeepAlive] ⏭️ ${account.username}: Already has valid session`);
                    results.success++;
                    continue;
                }
            }

            const success = await this.preLogin(account);
            if (success) {
                results.success++;
            } else {
                results.failed++;
            }

            // Delay between logins
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(`[KeepAlive] 🔑 Pre-login complete: ${results.success} success, ${results.failed} failed`);
        return results;
    }
}
