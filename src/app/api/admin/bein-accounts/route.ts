import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import Redis from 'ioredis'

// Initialize Redis for pool status
const getRedis = () => {
    return new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
}

// GET /api/admin/bein-accounts - List all accounts with pool status
export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        // Get all accounts
        const accounts = await prisma.beinAccount.findMany({
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'asc' }
            ],
            include: {
                _count: {
                    select: { operations: true }
                },
                proxy: {
                    select: { id: true, host: true, port: true, label: true }
                }
            }
        })

        // Calculate success rate for each account
        const accountsWithStats = accounts.map(account => {
            const total = account.totalSuccess + account.totalFailures
            const successRate = total > 0 ? (account.totalSuccess / total) * 100 : 100

            return {
                id: account.id,
                username: account.username,
                label: account.label,
                isActive: account.isActive,
                priority: account.priority,
                lastUsedAt: account.lastUsedAt,
                usageCount: account.usageCount,
                cooldownUntil: account.cooldownUntil,
                consecutiveFailures: account.consecutiveFailures,
                totalFailures: account.totalFailures,
                totalSuccess: account.totalSuccess,
                lastError: account.lastError,
                lastErrorAt: account.lastErrorAt,
                createdAt: account.createdAt,
                updatedAt: account.updatedAt,
                dealerBalance: (account as unknown as Record<string, unknown>).dealerBalance ?? null,
                balanceUpdatedAt: (account as unknown as Record<string, unknown>).balanceUpdatedAt ?? null,
                successRate: Math.round(successRate * 100) / 100,
                operationsCount: account._count.operations,
                proxyId: account.proxyId,
                proxy: account.proxy,
                customerOnly: account.customerOnly,
                hasTotpSecret: !!account.totpSecret // Indicate if TOTP is configured
            }
        })

        // Get pool status from Redis
        const poolStatus = {
            totalAccounts: accounts.length,
            activeAccounts: accounts.filter(a => a.isActive).length,
            availableNow: 0,
            inCooldown: 0,
            rateLimited: 0
        }

        try {
            const redis = getRedis()

            for (const account of accounts) {
                if (!account.isActive) continue

                // Check cooldown
                const cooldownKey = `bein:account:cooldown:${account.id}`
                const cooldownTTL = await redis.ttl(cooldownKey)

                if (cooldownTTL > 0) {
                    poolStatus.inCooldown++
                    continue
                }

                // Check rate limit
                const requestsKey = `bein:account:${account.id}:requests`
                const windowSeconds = 300 // 5 minutes
                const windowStart = Date.now() - (windowSeconds * 1000)
                const requestCount = await redis.zcount(requestsKey, windowStart, '+inf')

                if (requestCount >= 5) { // max 5 requests per window
                    poolStatus.rateLimited++
                    continue
                }

                poolStatus.availableNow++
            }

            await redis.quit()
        } catch (redisError) {
            console.error('Redis error when getting pool status:', redisError)
            // Fall back to basic calculation
            poolStatus.availableNow = accounts.filter(a =>
                a.isActive && (!a.cooldownUntil || a.cooldownUntil < new Date())
            ).length
        }

        return NextResponse.json({
            success: true,
            accounts: accountsWithStats,
            poolStatus
        })

    } catch (error) {
        console.error('Get beIN accounts error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/admin/bein-accounts - Create new account
export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json()
        const { username, password, totpSecret, label, priority, customerOnly } = body

        // Validate required fields
        if (!username || !password) {
            return NextResponse.json(
                { error: 'Username and password are required' },
                { status: 400 }
            )
        }

        // Check if username already exists
        const existing = await prisma.beinAccount.findUnique({
            where: { username }
        })

        if (existing) {
            return NextResponse.json(
                { error: 'Username already exists' },
                { status: 400 }
            )
        }

        // Create account
        const account = await prisma.beinAccount.create({
            data: {
                username,
                password, // In production, consider encrypting this
                totpSecret: totpSecret || null,
                label: label || null,
                priority: priority || 0,
                customerOnly: customerOnly || false,
                isActive: true
            }
        })

        return NextResponse.json({
            success: true,
            account: {
                id: account.id,
                username: account.username,
                label: account.label,
                isActive: account.isActive,
                priority: account.priority,
                createdAt: account.createdAt
            }
        })

    } catch (error) {
        console.error('Create beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
