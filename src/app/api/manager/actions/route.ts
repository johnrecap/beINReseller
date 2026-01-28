import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user } = authResult
        const managerId = user.id
        const userRole = user.role

        // Rate Limit
        const { allowed, result: limitResult } = await withRateLimit(
            `manager:${user.id}`,
            RATE_LIMITS.manager
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'تجاوزت الحد المسموح، انتظر قليلاً' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

        // Parse query params with bounds
        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20))
        const type = searchParams.get('type') // Filter by action type
        const search = searchParams.get('search') // Search by username

        const whereManager = userRole === 'ADMIN' ? {} : { managerId }

        const where: Prisma.UserActionWhereInput = {
            ...whereManager
        }

        if (type) {
            where.actionType = type
        }

        if (search) {
            where.user = {
                username: { contains: search, mode: 'insensitive' }
            }
        }

        const [actions, total] = await Promise.all([
            prisma.userAction.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.userAction.count({ where }),
        ])

        return NextResponse.json({
            actions,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })

    } catch (error) {
        console.error('List manager actions error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
