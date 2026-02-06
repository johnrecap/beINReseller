import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import Redis from 'ioredis'

interface RouteParams {
    params: Promise<{ id: string }>
}

// GET /api/admin/bein-accounts/[id] - Get account details
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        const account = await prisma.beinAccount.findUnique({
            where: { id },
            include: {
                sessions: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        isValid: true,
                        expiresAt: true,
                        createdAt: true
                    }
                },
                operations: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        type: true,
                        status: true,
                        cardNumber: true,
                        createdAt: true,
                        completedAt: true
                    }
                }
            }
        })

        if (!account) {
            return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
        }

        // Calculate stats
        const total = account.totalSuccess + account.totalFailures
        const successRate = total > 0 ? (account.totalSuccess / total) * 100 : 100

        // Get current rate limit count from Redis
        let requestsInWindow = 0
        let cooldownRemaining = 0

        try {
            const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

            const windowSeconds = 300
            const windowStart = Date.now() - (windowSeconds * 1000)
            const requestsKey = `bein:account:${id}:requests`
            requestsInWindow = await redis.zcount(requestsKey, windowStart, '+inf')

            const cooldownKey = `bein:account:cooldown:${id}`
            const ttl = await redis.ttl(cooldownKey)
            cooldownRemaining = ttl > 0 ? ttl : 0

            await redis.quit()
        } catch (redisError) {
            console.error('Redis error:', redisError)
        }

        return NextResponse.json({
            success: true,
            account: {
                ...account,
                password: '******', // Don't expose password
                successRate: Math.round(successRate * 100) / 100,
                requestsInWindow,
                cooldownRemaining
            }
        })

    } catch (error) {
        console.error('Get beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PUT /api/admin/bein-accounts/[id] - Update account
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json()
        const { password, totpSecret, label, priority, isActive, proxyId, customerOnly } = body

        // Check if account exists
        const existing = await prisma.beinAccount.findUnique({
            where: { id }
        })

        if (!existing) {
            return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
        }

        // Build update data
        const updateData: Record<string, string | number | boolean | null> = {}

        if (password !== undefined && password !== '') {
            updateData.password = password
        }
        if (totpSecret !== undefined) {
            updateData.totpSecret = totpSecret || null
        }
        if (label !== undefined) {
            updateData.label = label || null
        }
        if (priority !== undefined) {
            updateData.priority = priority
        }
        if (isActive !== undefined) {
            updateData.isActive = isActive
            // If reactivating, reset consecutive failures
            if (isActive === true) {
                updateData.consecutiveFailures = 0
            }
        }
        if (proxyId !== undefined) {
            updateData.proxyId = proxyId || null
        }
        if (customerOnly !== undefined) {
            updateData.customerOnly = customerOnly
        }

        const account = await prisma.beinAccount.update({
            where: { id },
            data: updateData
        })

        return NextResponse.json({
            success: true,
            account: {
                id: account.id,
                username: account.username,
                label: account.label,
                isActive: account.isActive,
                priority: account.priority,
                updatedAt: account.updatedAt
            }
        })

    } catch (error) {
        console.error('Update beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE /api/admin/bein-accounts/[id] - Delete account
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        // Check if account exists
        const existing = await prisma.beinAccount.findUnique({
            where: { id }
        })

        if (!existing) {
            return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
        }

        // Delete account (sessions will cascade delete)
        await prisma.beinAccount.delete({
            where: { id }
        })

        // Clear Redis data for this account
        try {
            const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
            await redis.del(`bein:account:${id}:requests`)
            await redis.del(`bein:account:cooldown:${id}`)
            await redis.del(`bein:account:lock:${id}`)
            await redis.quit()
        } catch (redisError) {
            console.error('Redis cleanup error:', redisError)
        }

        return NextResponse.json({
            success: true,
            message: 'تم حذف الحساب بنجاح'
        })

    } catch (error) {
        console.error('Delete beIN account error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
