/**
 * Package and STB Cache for beIN Operations
 * 
 * Caches package lists and STB numbers per card to reduce HTTP requests.
 * - Packages: 10 minute TTL (packages can change with purchases)
 * - STB: 1 hour TTL (STB rarely changes)
 * 
 * Performance Impact:
 * - Repeat package checks for same card: ~97% faster (skip all HTTP requests)
 * - STB cached: Skip checkCard() entirely, save ~600ms per operation
 */

import { getRedisConnection } from './redis';
import type { AvailablePackage } from '../http/types';

// Cache configuration
const PACKAGE_CACHE_TTL_MIN = 10;  // 10 minutes
const STB_CACHE_TTL_MIN = 60;       // 1 hour

// Redis key prefixes
const PACKAGE_KEY_PREFIX = 'bein:packages:';
const STB_KEY_PREFIX = 'bein:stb:';

/**
 * Cached package data structure
 */
export interface CachedPackageData {
    packages: AvailablePackage[];
    stbNumber: string | null;
    dealerBalance: number | null;
    cachedAt: number;  // Unix timestamp ms
}

// Metrics tracking
let cacheMetrics = {
    packageHits: 0,
    packageMisses: 0,
    stbHits: 0,
    stbMisses: 0
};

/**
 * Cache packages for a card number
 * @param cardNumber - The smart card serial number
 * @param packages - List of available packages
 * @param stbNumber - STB number (if known)
 * @param dealerBalance - Dealer's current balance
 */
export async function cachePackages(
    cardNumber: string,
    packages: AvailablePackage[],
    stbNumber: string | null,
    dealerBalance: number | null
): Promise<void> {
    try {
        const redis = getRedisConnection();
        const key = PACKAGE_KEY_PREFIX + cardNumber;
        
        const data: CachedPackageData = {
            packages,
            stbNumber,
            dealerBalance,
            cachedAt: Date.now()
        };
        
        await redis.setex(key, PACKAGE_CACHE_TTL_MIN * 60, JSON.stringify(data));
        
        // Also cache STB separately for longer TTL
        if (stbNumber) {
            await cacheSTB(cardNumber, stbNumber);
        }
        
        const maskedCard = cardNumber.slice(0, 4) + '****';
        console.log(`[PackageCache] 💾 Cached ${packages.length} packages for ${maskedCard} (TTL: ${PACKAGE_CACHE_TTL_MIN} min)`);
    } catch (error: any) {
        console.error(`[PackageCache] ⚠️ Failed to cache packages:`, error.message);
    }
}

/**
 * Get cached packages for a card number
 * @param cardNumber - The smart card serial number
 * @returns Cached package data or null if not cached/expired
 */
export async function getCachedPackages(cardNumber: string): Promise<CachedPackageData | null> {
    try {
        const redis = getRedisConnection();
        const key = PACKAGE_KEY_PREFIX + cardNumber;
        
        const cached = await redis.get(key);
        if (!cached) {
            cacheMetrics.packageMisses++;
            return null;
        }
        
        const data = JSON.parse(cached) as CachedPackageData;
        const ageMs = Date.now() - data.cachedAt;
        const ageMin = Math.floor(ageMs / 60000);
        const remainingMin = PACKAGE_CACHE_TTL_MIN - ageMin;
        
        cacheMetrics.packageHits++;
        const maskedCard = cardNumber.slice(0, 4) + '****';
        console.log(`[PackageCache] ✅ HIT for ${maskedCard} (${ageMin} min old, ${remainingMin} min remaining, ${data.packages.length} packages)`);
        
        return data;
    } catch (error: any) {
        console.error(`[PackageCache] ⚠️ Failed to get cached packages:`, error.message);
        cacheMetrics.packageMisses++;
        return null;
    }
}

/**
 * Cache STB number for a card (longer TTL since STB rarely changes)
 * @param cardNumber - The smart card serial number
 * @param stbNumber - The STB (receiver) number
 */
export async function cacheSTB(cardNumber: string, stbNumber: string): Promise<void> {
    try {
        const redis = getRedisConnection();
        const key = STB_KEY_PREFIX + cardNumber;
        
        await redis.setex(key, STB_CACHE_TTL_MIN * 60, stbNumber);
        
        const maskedCard = cardNumber.slice(0, 4) + '****';
        console.log(`[PackageCache] 💾 Cached STB ${stbNumber} for ${maskedCard} (TTL: ${STB_CACHE_TTL_MIN} min)`);
    } catch (error: any) {
        console.error(`[PackageCache] ⚠️ Failed to cache STB:`, error.message);
    }
}

/**
 * Get cached STB for a card
 * @param cardNumber - The smart card serial number
 * @returns STB number or null if not cached
 */
export async function getCachedSTB(cardNumber: string): Promise<string | null> {
    try {
        const redis = getRedisConnection();
        const key = STB_KEY_PREFIX + cardNumber;
        
        const stb = await redis.get(key);
        if (stb) {
            cacheMetrics.stbHits++;
            const maskedCard = cardNumber.slice(0, 4) + '****';
            console.log(`[PackageCache] ✅ STB HIT for ${maskedCard}: ${stb}`);
            return stb;
        }
        
        cacheMetrics.stbMisses++;
        return null;
    } catch (error: any) {
        console.error(`[PackageCache] ⚠️ Failed to get cached STB:`, error.message);
        cacheMetrics.stbMisses++;
        return null;
    }
}

/**
 * Invalidate package cache for a card (call after purchase)
 * @param cardNumber - The smart card serial number
 */
export async function invalidatePackageCache(cardNumber: string): Promise<void> {
    try {
        const redis = getRedisConnection();
        await redis.del(PACKAGE_KEY_PREFIX + cardNumber);
        
        const maskedCard = cardNumber.slice(0, 4) + '****';
        console.log(`[PackageCache] 🗑️ Invalidated package cache for ${maskedCard}`);
    } catch (error: any) {
        console.error(`[PackageCache] ⚠️ Failed to invalidate cache:`, error.message);
    }
}

/**
 * Invalidate STB cache for a card (rarely needed)
 * @param cardNumber - The smart card serial number
 */
export async function invalidateSTBCache(cardNumber: string): Promise<void> {
    try {
        const redis = getRedisConnection();
        await redis.del(STB_KEY_PREFIX + cardNumber);
        
        const maskedCard = cardNumber.slice(0, 4) + '****';
        console.log(`[PackageCache] 🗑️ Invalidated STB cache for ${maskedCard}`);
    } catch (error: any) {
        console.error(`[PackageCache] ⚠️ Failed to invalidate STB cache:`, error.message);
    }
}

/**
 * Get cache metrics for monitoring
 */
export function getPackageCacheMetrics() {
    const totalPackage = cacheMetrics.packageHits + cacheMetrics.packageMisses;
    const totalStb = cacheMetrics.stbHits + cacheMetrics.stbMisses;
    
    return {
        packageHits: cacheMetrics.packageHits,
        packageMisses: cacheMetrics.packageMisses,
        stbHits: cacheMetrics.stbHits,
        stbMisses: cacheMetrics.stbMisses,
        packageHitRate: totalPackage > 0 
            ? (cacheMetrics.packageHits / totalPackage * 100).toFixed(1) + '%' 
            : 'N/A',
        stbHitRate: totalStb > 0 
            ? (cacheMetrics.stbHits / totalStb * 100).toFixed(1) + '%' 
            : 'N/A'
    };
}

/**
 * Reset cache metrics (for testing)
 */
export function resetPackageCacheMetrics(): void {
    cacheMetrics = {
        packageHits: 0,
        packageMisses: 0,
        stbHits: 0,
        stbMisses: 0
    };
}
