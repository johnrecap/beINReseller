/**
 * Account Pool Module
 * Exports all pool management utilities
 */

// Main manager
export {
    AccountPoolManager,
    getPoolManager,
    initializePoolManager,
} from './account-pool-manager'

// Queue manager (for sequential processing)
export {
    AccountQueueManager,
    getQueueManager,
} from './account-queue-manager'

// Types
export type {
    PoolConfig,
    AccountHealth,
    PoolStatus,
    AccountHealthReport,
    BeinAccount,
    BeinAccountSession,
} from './types'

// Rate limiting
export {
    checkRateLimit,
    recordRequest,
    getRequestCount,
    clearRateLimit,
} from './rate-limiter'

// Account locking
export {
    lockAccount,
    unlockAccount,
    forceUnlockAccount,
    isAccountLocked,
    getLockOwner,
    extendLock,
} from './account-locking'

// Health checking
export {
    getAccountHealthReport,
    getAllAccountsHealthReport,
    getHealthStatusCounts,
} from './health-checker'
