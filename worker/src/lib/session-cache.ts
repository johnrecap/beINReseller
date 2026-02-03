/**
 * Redis Session Cache for beIN Accounts
 * 
 * Allows sharing authenticated sessions between workers
 * to reduce login frequency and improve performance.
 * 
 * Features:
 * - Session caching with TTL (auto-expire)
 * - Session expiry validation (loginTimestamp + expiresAt)
 * - Login locking to prevent race conditions
 * - Cache hit/miss metrics for monitoring
 * - Graceful degradation on Redis errors
 * - ViewState compression for large data (zlib gzip)
 */

import { getRedisConnection } from './redis';
import { SessionData, HiddenFields } from '../http/types';
import { gzipSync, gunzipSync } from 'zlib';

// Redis key prefixes
const SESSION_PREFIX = 'bein:session:';
const LOGIN_LOCK_PREFIX = 'bein:login-lock:';

// Lock settings
const LOGIN_LOCK_TTL_SECONDS = 60; // 60 seconds max for login

// Default session timeout (15 minutes = conservative approach)
const DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000;

// ViewState compression settings
const COMPRESSION_THRESHOLD = 1000; // Compress ViewState if > 1000 chars
const COMPRESSION_PREFIX = 'gz:';   // Prefix to identify compressed data

// Metrics
let cacheHits = 0;
let cacheMisses = 0;
let cacheExpired = 0;  // Track sessions that were in cache but expired
let lastMetricsLogTime = Date.now();
const METRICS_LOG_INTERVAL_MS = 5 * 60 * 1000; // Log every 5 minutes

/**
 * Log cache metrics periodically
 */
function maybeLogMetrics(): void {
    const now = Date.now();
    if (now - lastMetricsLogTime >= METRICS_LOG_INTERVAL_MS) {
        const total = cacheHits + cacheMisses + cacheExpired;
        const hitRate = total > 0 ? ((cacheHits / total) * 100).toFixed(1) : '0';
        console.log(`[Session Cache] 📊 Metrics: ${cacheHits} hits, ${cacheMisses} misses, ${cacheExpired} expired (${hitRate}% hit rate)`);
        lastMetricsLogTime = now;
    }
}

/**
 * Compress ViewState using gzip if it's large
 * @param viewState - The ViewState hidden fields object
 * @returns Compressed string or original JSON string
 */
function compressViewState(viewState: HiddenFields): string {
    const json = JSON.stringify(viewState);
    
    if (json.length < COMPRESSION_THRESHOLD) {
        return json;  // Don't compress small data
    }
    
    try {
        const compressed = gzipSync(json).toString('base64');
        const ratio = ((1 - compressed.length / json.length) * 100).toFixed(1);
        console.log(`[Session Cache] 🗜️ Compressed ViewState: ${json.length} -> ${compressed.length} chars (${ratio}% reduction)`);
        return COMPRESSION_PREFIX + compressed;
    } catch (error) {
        console.warn(`[Session Cache] ⚠️ Compression failed, using uncompressed`);
        return json;
    }
}

/**
 * Decompress ViewState if it was compressed
 * @param data - Compressed or uncompressed string
 * @returns HiddenFields object
 */
function decompressViewState(data: string): HiddenFields {
    if (data.startsWith(COMPRESSION_PREFIX)) {
        try {
            const compressed = Buffer.from(data.slice(COMPRESSION_PREFIX.length), 'base64');
            const json = gunzipSync(compressed).toString();
            return JSON.parse(json);
        } catch (error) {
            console.error(`[Session Cache] ❌ Decompression failed:`, error);
            throw error;
        }
    }
    
    return JSON.parse(data);
}

/**
 * Get session from Redis cache
 * Validates expiry time before returning - returns null if expired
 * Handles decompression of ViewState if compressed
 * @param accountId - beIN account ID
 * @returns SessionData or null if not found/expired
 */
export async function getSessionFromCache(accountId: string): Promise<SessionData | null> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        
        const data = await redis.get(key);
        if (!data) {
            cacheMisses++;
            console.log(`[Session Cache] ❌ MISS for account ${accountId.substring(0, 8)}...`);
            maybeLogMetrics();
            return null;
        }
        
        const rawSession = JSON.parse(data);
        const now = Date.now();
        
        // Decompress ViewState if it was compressed
        let viewState: HiddenFields | undefined;
        if (rawSession.viewStateCompressed) {
            try {
                viewState = decompressViewState(rawSession.viewStateCompressed);
            } catch (e) {
                console.error(`[Session Cache] ❌ Failed to decompress ViewState`);
                viewState = undefined;
            }
        } else if (rawSession.viewState) {
            // Legacy uncompressed format
            viewState = rawSession.viewState;
        }
        
        // Reconstruct SessionData
        const session: SessionData = {
            cookies: rawSession.cookies,
            viewState: viewState,
            lastLoginTime: rawSession.lastLoginTime,
            loginTimestamp: rawSession.loginTimestamp,
            expiresAt: rawSession.expiresAt,
            accountId: rawSession.accountId
        };
        
        // Validate session expiry using stored expiresAt
        if (session.expiresAt) {
            if (now >= session.expiresAt) {
                // Session expired according to our tracking
                const expiredAgoMs = now - session.expiresAt;
                const expiredAgoMin = Math.floor(expiredAgoMs / 60000);
                console.log(`[Session Cache] ⚠️ EXPIRED for account ${accountId.substring(0, 8)}... (expired ${expiredAgoMin} min ago)`);
                cacheExpired++;
                maybeLogMetrics();
                
                // Delete the expired session
                await redis.del(key);
                return null;
            }
            
            // Calculate remaining time
            const remainingMs = session.expiresAt - now;
            const remainingMin = Math.floor(remainingMs / 60000);
            const remainingSec = Math.floor((remainingMs % 60000) / 1000);
            
            cacheHits++;
            console.log(`[Session Cache] ✅ HIT for account ${accountId.substring(0, 8)}... (${remainingMin}m ${remainingSec}s remaining)`);
            maybeLogMetrics();
            return session;
        }
        
        // Fallback: If no expiresAt, use loginTimestamp with default timeout
        if (session.loginTimestamp) {
            const sessionAge = now - session.loginTimestamp;
            if (sessionAge >= DEFAULT_SESSION_TIMEOUT_MS) {
                const ageMin = Math.floor(sessionAge / 60000);
                console.log(`[Session Cache] ⚠️ EXPIRED (age-based) for account ${accountId.substring(0, 8)}... (${ageMin} min old)`);
                cacheExpired++;
                maybeLogMetrics();
                await redis.del(key);
                return null;
            }
            
            const remainingMs = DEFAULT_SESSION_TIMEOUT_MS - sessionAge;
            const remainingMin = Math.floor(remainingMs / 60000);
            
            cacheHits++;
            console.log(`[Session Cache] ✅ HIT for account ${accountId.substring(0, 8)}... (~${remainingMin} min remaining, age-based)`);
            maybeLogMetrics();
            return session;
        }
        
        // Legacy session without timestamps - use Redis TTL as indicator
        const ttl = await redis.ttl(key);
        const ttlMinutes = Math.floor(ttl / 60);
        
        cacheHits++;
        console.log(`[Session Cache] ✅ HIT (legacy) for account ${accountId.substring(0, 8)}... (TTL: ${ttlMinutes} min)`);
        maybeLogMetrics();
        
        return session;
    } catch (error) {
        console.error(`[Session Cache] Error reading session:`, error);
        cacheMisses++;
        return null;
    }
}

/**
 * Save session to Redis cache with proper timestamps
 * Automatically sets loginTimestamp and expiresAt if not present
 * Uses compression for large ViewState data
 * @param accountId - beIN account ID
 * @param session - Session data to cache
 * @param ttlMinutes - Time to live in minutes (default: 16 = slightly longer than session timeout)
 */
export async function saveSessionToCache(
    accountId: string, 
    session: SessionData, 
    ttlMinutes: number = 16
): Promise<void> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        const now = Date.now();
        
        // Compress ViewState if present and large
        let compressedViewState: string | undefined;
        if (session.viewState) {
            compressedViewState = compressViewState(session.viewState);
        }
        
        // Ensure session has proper timestamps
        // Store ViewState as compressed string separately
        const sessionToSave = {
            cookies: session.cookies,
            viewStateCompressed: compressedViewState,  // Compressed ViewState
            accountId: accountId,
            loginTimestamp: session.loginTimestamp || now,
            expiresAt: session.expiresAt || (now + DEFAULT_SESSION_TIMEOUT_MS),
            lastLoginTime: session.lastLoginTime || new Date().toISOString()
        };
        
        // Calculate Redis TTL: slightly longer than expiresAt to allow for clock drift
        // Add 60 seconds buffer
        const expiresInMs = sessionToSave.expiresAt - now;
        const redisTtlSeconds = Math.max(
            Math.ceil(expiresInMs / 1000) + 60,  // expiresAt + 60s buffer
            ttlMinutes * 60                       // Or provided TTL
        );
        
        await redis.setex(key, redisTtlSeconds, JSON.stringify(sessionToSave));
        
        const expiresInMin = Math.floor(expiresInMs / 60000);
        console.log(`[Session Cache] 💾 Saved session for account ${accountId.substring(0, 8)}... (expires in ${expiresInMin} min, Redis TTL: ${Math.floor(redisTtlSeconds / 60)} min)`);
    } catch (error) {
        console.error(`[Session Cache] Error saving session:`, error);
        // Don't throw - graceful degradation
    }
}

/**
 * Delete session from cache (on logout or error)
 * @param accountId - beIN account ID
 */
export async function deleteSessionFromCache(accountId: string): Promise<void> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        
        await redis.del(key);
        console.log(`[Session Cache] 🗑️ Deleted cached session for account ${accountId.substring(0, 8)}...`);
    } catch (error) {
        console.error(`[Session Cache] Error deleting session:`, error);
    }
}

/**
 * Check if a valid session exists in cache
 * @param accountId - beIN account ID
 * @returns true if session exists and not expired
 */
export async function hasValidSession(accountId: string): Promise<boolean> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        
        const ttl = await redis.ttl(key);
        return ttl > 0;
    } catch (error) {
        console.error(`[Session Cache] Error checking session:`, error);
        return false;
    }
}

/**
 * Get remaining TTL for a session
 * @param accountId - beIN account ID
 * @returns TTL in seconds, or -1 if not found
 */
export async function getSessionTTL(accountId: string): Promise<number> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        
        return await redis.ttl(key);
    } catch (error) {
        console.error(`[Session Cache] Error getting TTL:`, error);
        return -1;
    }
}

/**
 * Extend session TTL (refresh on activity)
 * @param accountId - beIN account ID
 * @param ttlMinutes - New TTL in minutes
 */
export async function extendSessionTTL(
    accountId: string, 
    ttlMinutes: number = 600
): Promise<void> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        const ttlSeconds = ttlMinutes * 60;
        
        // Only extend if key exists
        const exists = await redis.exists(key);
        if (exists) {
            await redis.expire(key, ttlSeconds);
            console.log(`[Session Cache] ⏰ Extended TTL for account ${accountId.substring(0, 8)}... to ${ttlMinutes} min`);
        }
    } catch (error) {
        console.error(`[Session Cache] Error extending TTL:`, error);
    }
}

// =============================================
// LOGIN LOCKING - Prevent race conditions
// =============================================

/**
 * Acquire lock before login to prevent race conditions
 * When multiple workers try to login the same account simultaneously,
 * only one will succeed, others will wait for the cached session.
 * 
 * @param accountId - beIN account ID
 * @param workerId - Worker identifier
 * @returns true if lock acquired, false if another worker is logging in
 */
export async function acquireLoginLock(accountId: string, workerId: string): Promise<boolean> {
    try {
        const redis = getRedisConnection();
        const key = `${LOGIN_LOCK_PREFIX}${accountId}`;
        
        // SET NX = only set if not exists (atomic operation)
        const result = await redis.set(key, workerId, 'EX', LOGIN_LOCK_TTL_SECONDS, 'NX');
        
        if (result === 'OK') {
            console.log(`[Session Cache] 🔒 Acquired login lock for account ${accountId.substring(0, 8)}... (worker: ${workerId})`);
            return true;
        } else {
            console.log(`[Session Cache] ⏳ Login lock busy for account ${accountId.substring(0, 8)}... (another worker is logging in)`);
            return false;
        }
    } catch (error) {
        console.error(`[Session Cache] Error acquiring login lock:`, error);
        return true; // Allow login on error (graceful degradation)
    }
}

/**
 * Release login lock after login completes
 * Only releases if the current worker owns the lock (prevents accidental releases)
 * 
 * @param accountId - beIN account ID
 * @param workerId - Worker identifier
 */
export async function releaseLoginLock(accountId: string, workerId: string): Promise<void> {
    try {
        const redis = getRedisConnection();
        const key = `${LOGIN_LOCK_PREFIX}${accountId}`;
        
        // Only release if we own the lock (Lua script for atomicity)
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        
        const result = await redis.eval(script, 1, key, workerId);
        if (result === 1) {
            console.log(`[Session Cache] 🔓 Released login lock for account ${accountId.substring(0, 8)}...`);
        }
    } catch (error) {
        console.error(`[Session Cache] Error releasing login lock:`, error);
    }
}

/**
 * Wait for existing login to complete (with timeout)
 * Used when another worker is already logging in
 * 
 * @param accountId - beIN account ID
 * @param timeoutMs - Maximum wait time in milliseconds
 * @returns true if login completed (lock released), false if timeout
 */
export async function waitForLoginComplete(accountId: string, timeoutMs: number = 30000): Promise<boolean> {
    try {
        const redis = getRedisConnection();
        const key = `${LOGIN_LOCK_PREFIX}${accountId}`;
        const startTime = Date.now();
        const pollIntervalMs = 500;
        
        console.log(`[Session Cache] ⏳ Waiting for login to complete for account ${accountId.substring(0, 8)}...`);
        
        while (Date.now() - startTime < timeoutMs) {
            const exists = await redis.exists(key);
            if (!exists) {
                console.log(`[Session Cache] ✅ Login completed by another worker`);
                return true; // Lock released, login completed
            }
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
        
        console.log(`[Session Cache] ⚠️ Timeout waiting for login (${timeoutMs}ms)`);
        return false; // Timeout
    } catch (error) {
        console.error(`[Session Cache] Error waiting for login:`, error);
        return true; // Allow proceeding on error
    }
}

/**
 * Get current cache metrics
 * @returns Object with hits, misses, and hit rate
 */
export function getCacheMetrics(): { hits: number; misses: number; hitRate: string } {
    const total = cacheHits + cacheMisses;
    const hitRate = total > 0 ? ((cacheHits / total) * 100).toFixed(1) : '0';
    return {
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: `${hitRate}%`
    };
}

/**
 * Reset cache metrics (for testing)
 */
export function resetCacheMetrics(): void {
    cacheHits = 0;
    cacheMisses = 0;
    cacheExpired = 0;
    lastMetricsLogTime = Date.now();
}

// =============================================
// SESSION KEEP-ALIVE HELPERS
// =============================================

/**
 * Get all cached session account IDs
 * Used by keep-alive to refresh all active sessions
 * @returns Array of account IDs with cached sessions
 */
export async function getAllCachedSessionIds(): Promise<string[]> {
    try {
        const redis = getRedisConnection();
        const pattern = `${SESSION_PREFIX}*`;
        
        const keys = await redis.keys(pattern);
        return keys.map(key => key.replace(SESSION_PREFIX, ''));
    } catch (error) {
        console.error(`[Session Cache] Error getting cached session IDs:`, error);
        return [];
    }
}

/**
 * Refresh session expiry (extend session after keep-alive)
 * Updates both expiresAt timestamp and Redis TTL
 * @param accountId - beIN account ID
 * @param sessionTimeoutMs - Session timeout in milliseconds (default: 15 min)
 */
export async function refreshSessionExpiry(
    accountId: string,
    sessionTimeoutMs: number = DEFAULT_SESSION_TIMEOUT_MS
): Promise<boolean> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        
        const data = await redis.get(key);
        if (!data) {
            console.log(`[Session Cache] ⚠️ Cannot refresh - no session for ${accountId.substring(0, 8)}...`);
            return false;
        }
        
        const session: SessionData = JSON.parse(data);
        const now = Date.now();
        
        // Update timestamps
        session.loginTimestamp = now;  // Treat keep-alive as new login
        session.expiresAt = now + sessionTimeoutMs;
        session.lastLoginTime = new Date().toISOString();
        
        // Calculate new Redis TTL (expiresAt + 60s buffer)
        const redisTtlSeconds = Math.ceil(sessionTimeoutMs / 1000) + 60;
        
        await redis.setex(key, redisTtlSeconds, JSON.stringify(session));
        
        const expiresInMin = Math.floor(sessionTimeoutMs / 60000);
        console.log(`[Session Cache] 🔄 Refreshed session for ${accountId.substring(0, 8)}... (expires in ${expiresInMin} min)`);
        
        return true;
    } catch (error) {
        console.error(`[Session Cache] Error refreshing session:`, error);
        return false;
    }
}

/**
 * Check if session needs refresh (expiring soon)
 * @param accountId - beIN account ID
 * @param thresholdMs - Threshold in milliseconds (default: 3 minutes)
 * @returns true if session exists and will expire within threshold
 */
export async function sessionNeedsRefresh(
    accountId: string,
    thresholdMs: number = 3 * 60 * 1000
): Promise<boolean> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        
        const data = await redis.get(key);
        if (!data) return false;
        
        const session: SessionData = JSON.parse(data);
        const now = Date.now();
        
        if (session.expiresAt) {
            const remainingMs = session.expiresAt - now;
            return remainingMs > 0 && remainingMs <= thresholdMs;
        }
        
        // Fallback to loginTimestamp
        if (session.loginTimestamp) {
            const sessionAge = now - session.loginTimestamp;
            const remainingMs = DEFAULT_SESSION_TIMEOUT_MS - sessionAge;
            return remainingMs > 0 && remainingMs <= thresholdMs;
        }
        
        return false;
    } catch (error) {
        console.error(`[Session Cache] Error checking session refresh:`, error);
        return false;
    }
}

/**
 * Get session remaining time in milliseconds
 * @param accountId - beIN account ID
 * @returns Remaining time in ms, or -1 if no session/expired
 */
export async function getSessionRemainingTime(accountId: string): Promise<number> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        
        const data = await redis.get(key);
        if (!data) return -1;
        
        const session: SessionData = JSON.parse(data);
        const now = Date.now();
        
        if (session.expiresAt) {
            const remaining = session.expiresAt - now;
            return remaining > 0 ? remaining : -1;
        }
        
        if (session.loginTimestamp) {
            const age = now - session.loginTimestamp;
            const remaining = DEFAULT_SESSION_TIMEOUT_MS - age;
            return remaining > 0 ? remaining : -1;
        }
        
        return -1;
    } catch (error) {
        console.error(`[Session Cache] Error getting session remaining time:`, error);
        return -1;
    }
}
