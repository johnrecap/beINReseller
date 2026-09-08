import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { encryptSecret } from '@/lib/crypto'
import Redis from 'ioredis'
import { buildAccountLockStatus, readAccountLockStatus } from '@/lib/operations/account-lock-release'
import { normalizeProviderAccountCredentialUsername } from '@/lib/provider-account-identity'

function isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

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

        const lockStatusByAccountId = new Map<string, ReturnType<typeof buildAccountLockStatus>>()

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
                const lockStatus = await readAccountLockStatus(redis, account.id)
                lockStatusByAccountId.set(account.id, lockStatus)

                if (!account.isActive || !account.automationExclusive) continue
                if (lockStatus.locked) continue

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
                a.isActive
                && a.automationExclusive
                && (!a.cooldownUntil || a.cooldownUntil < new Date())
            ).length
        }

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
                consecutiveLoginFailures: account.consecutiveLoginFailures,
                totalFailures: account.totalFailures,
                totalSuccess: account.totalSuccess,
                lastError: account.lastError,
                lastErrorAt: account.lastErrorAt,
                lastLoginAttemptAt: account.lastLoginAttemptAt,
                lastLoginFailureAt: account.lastLoginFailureAt,
                lastLoginFailureReason: account.lastLoginFailureReason,
                lastSuccessfulLoginAt: account.lastSuccessfulLoginAt,
                createdAt: account.createdAt,
                updatedAt: account.updatedAt,
                dealerBalance: (account as unknown as Record<string, unknown>).dealerBalance ?? null,
                balanceUpdatedAt: (account as unknown as Record<string, unknown>).balanceUpdatedAt ?? null,
                successRate: Math.round(successRate * 100) / 100,
                operationsCount: account._count.operations,
                proxyId: account.proxyId,
                proxy: account.proxy,
                customerOnly: account.customerOnly,
                automationExclusive: account.automationExclusive,
                hasTotpSecret: !!account.totpSecret, // Indicate if TOTP is configured
                lockStatus: lockStatusByAccountId.get(account.id) ?? buildAccountLockStatus(null),
            }
        })

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
        const adminUser = authResult.user

        const body = await request.json()
        const {
            username,
            password,
            totpSecret,
            label,
            priority,
            customerOnly,
            automationExclusive = false,
        } = body

        if (typeof automationExclusive !== 'boolean') {
            return NextResponse.json(
                { error: 'INVALID_AUTOMATION_EXCLUSIVE' },
                { status: 400 }
            )
        }

        // Validate required fields
        if (typeof username !== 'string' || !username.trim() || !password) {
            return NextResponse.json(
                { error: 'Username and password are required' },
                { status: 400 }
            )
        }

        const credentialUsername = normalizeProviderAccountCredentialUsername(username)

        // Check if username already exists
        const existing = await prisma.beinAccount.findFirst({
            where: { username: { equals: credentialUsername, mode: 'insensitive' } }
        })

        if (existing) {
            return NextResponse.json(
                { error: 'Username already exists' },
                { status: 400 }
            )
        }

        // Create account
        const account = await prisma.$transaction(async (tx) => {
            const createdAccount = await tx.beinAccount.create({
                data: {
                    username: credentialUsername,
                    password: encryptSecret(password),
                    totpSecret: totpSecret ? encryptSecret(totpSecret) : null,
                    label: label || null,
                    priority: priority || 0,
                    customerOnly: customerOnly || false,
                    automationExclusive,
                    isActive: true
                }
            })

            await tx.activityLog.create({
                data: {
                    userId: adminUser.id,
                    action: 'ADMIN_CREATE_BEIN_ACCOUNT',
                    targetId: createdAccount.id,
                    targetType: 'BeinAccount',
                    details: { automationExclusive },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })

            return createdAccount
        })

        return NextResponse.json({
            success: true,
            account: {
                id: account.id,
                username: account.username,
                label: account.label,
                isActive: account.isActive,
                priority: account.priority,
                automationExclusive: account.automationExclusive,
                createdAt: account.createdAt
            }
        })

    } catch (error) {
        if (isUniqueConstraintViolation(error)) {
            return NextResponse.json({ error: 'Username already exists' }, { status: 400 })
        }
        console.error('Create beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
