/**
 * Health Checker for beIN Accounts
 * Monitors and reports on account health status
 */

import Redis from 'ioredis'
import { prisma } from '../lib/prisma'
import { AccountHealthReport } from './types'

/**
 * Get a detailed health report for a specific account
 */
export async function getAccountHealthReport(
    redis: Redis,
    accountId: string
): Promise<AccountHealthReport> {
    const account = await prisma.beinAccount.findUnique({
        where: { id: accountId },
    })

    if (!account) {
        throw new Error(`Account not found: ${accountId}`)
    }

    // Calculate success rate
    const totalOps = account.totalSuccess + account.totalFailures
    const successRate = totalOps > 0 ? (account.totalSuccess / totalOps) * 100 : 100

    // Check cooldown TTL
    const cooldownTTL = await redis.ttl(`bein:account:${accountId}:cooldown`)

    // Get request count in window
    const requestsKey = `bein:account:${accountId}:requests`
    const requestCount = await redis.zcard(requestsKey)

    // Determine status
    let status: 'healthy' | 'warning' | 'critical' | 'disabled'

    if (!account.isActive) {
        status = 'disabled'
    } else if (account.consecutiveFailures >= 3 || successRate < 50) {
        status = 'critical'
    } else if (account.consecutiveFailures >= 1 || successRate < 80) {
        status = 'warning'
    } else {
        status = 'healthy'
    }

    return {
        accountId: account.id,
        label: account.label || account.username,
        status,
        metrics: {
            successRate,
            requestsInWindow: requestCount,
            consecutiveFailures: account.consecutiveFailures,
            lastUsedAt: account.lastUsedAt,
            cooldownRemaining: cooldownTTL > 0 ? cooldownTTL : null,
        },
    }
}

/**
 * Get health reports for all accounts
 */
export async function getAllAccountsHealthReport(
    redis: Redis
): Promise<AccountHealthReport[]> {
    const accounts = await prisma.beinAccount.findMany()
    const reports: AccountHealthReport[] = []

    for (const account of accounts) {
        const report = await getAccountHealthReport(redis, account.id)
        reports.push(report)
    }

    return reports
}

/**
 * Get counts of accounts by health status
 */
export async function getHealthStatusCounts(
    redis: Redis
): Promise<Record<'healthy' | 'warning' | 'critical' | 'disabled', number>> {
    const reports = await getAllAccountsHealthReport(redis)

    return {
        healthy: reports.filter((r) => r.status === 'healthy').length,
        warning: reports.filter((r) => r.status === 'warning').length,
        critical: reports.filter((r) => r.status === 'critical').length,
        disabled: reports.filter((r) => r.status === 'disabled').length,
    }
}
