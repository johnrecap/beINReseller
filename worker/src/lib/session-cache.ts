/**
 * Redis Session Cache for beIN Accounts
 * 
 * Allows sharing authenticated sessions between workers
 * to reduce login frequency and improve performance.
 * 
 * Features:
 * - Session caching with TTL (auto-expire)
 * - Login locking to prevent race conditions
 * - Cache hit/miss metrics for monitoring
 * - Graceful degradation on Redis errors
 */

import { getRedisConnection } from './redis';
import { SessionData } from '../http/types';

// Redis key prefixes
const SESSION_PREFIX = 'bein:session:';
const LOGIN_LOCK_PREFIX = 'bein:login-lock:';

// Lock settings
const LOGIN_LOCK_TTL_SECONDS = 60; // 60 seconds max for login

// Metrics
let cacheHits = 0;
let cacheMisses = 0;
let lastMetricsLogTime = Date.now();
const METRICS_LOG_INTERVAL_MS = 5 * 60 * 1000; // Log every 5 minutes

/**
 * Log cache metrics periodically
 */
function maybeLogMetrics(): void {
    const now = Date.now();
    if (now - lastMetricsLogTime >= METRICS_LOG_INTERVAL_MS) {
        const total = cacheHits + cacheMisses;
        const hitRate = total > 0 ? ((cacheHits / total) * 100).toFixed(1) : '0';
        console.log(`[Session Cache] 📊 Metrics: ${cacheHits} hits, ${cacheMisses} misses (${hitRate}% hit rate)`);
        lastMetricsLogTime = now;
    }
}

/**
 * Get session from Redis cache
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
        
        const session: SessionData = JSON.parse(data);
        cacheHits++;
        
        // Log remaining TTL
        const ttl = await redis.ttl(key);
        const ttlMinutes = Math.floor(ttl / 60);
        console.log(`[Session Cache] ✅ HIT for account ${accountId.substring(0, 8)}... (TTL: ${ttlMinutes} min remaining)`);
        maybeLogMetrics();
        
        return session;
    } catch (error) {
        console.error(`[Session Cache] Error reading session:`, error);
        cacheMisses++;
        return null;
    }
}

/**
 * Save session to Redis cache
 * @param accountId - beIN account ID
 * @param session - Session data to cache
 * @param ttlMinutes - Time to live in minutes (default: 600)
 */
export async function saveSessionToCache(
    accountId: string, 
    session: SessionData, 
    ttlMinutes: number = 600
): Promise<void> {
    try {
        const redis = getRedisConnection();
        const key = `${SESSION_PREFIX}${accountId}`;
        const ttlSeconds = ttlMinutes * 60;
        
        await redis.setex(key, ttlSeconds, JSON.stringify(session));
        console.log(`[Session Cache] 💾 Saved session for account ${accountId.substring(0, 8)}... (TTL: ${ttlMinutes} min)`);
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
    lastMetricsLogTime = Date.now();
}
