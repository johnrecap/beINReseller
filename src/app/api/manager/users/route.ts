import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

const createUserSchema = z.object({
    username: z.string().min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
    email: z.string().email('البريد الإلكتروني غير صالح'),
    password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
    balance: z.number().min(0).optional().default(0),
})

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
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10') || 10))
        const search = searchParams.get('search') || ''

        // Should return users managed by this manager
        // If admin, can see all or filter by manager_id param
        const whereManager = userRole === 'ADMIN' ? {} : { managerId }

        const where: Record<string, unknown> = {
            ...whereManager
        }

        if (search) {
            where.user = {
                OR: [
                    { username: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } }
                ]
            }
        }

        const [users, total] = await Promise.all([
            prisma.managerUser.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            isActive: true,
                            balance: true,
                            createdAt: true,
                            lastLoginAt: true,
                            role: true,
                            deletedAt: true,
                            _count: {
                                select: { operations: true }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.managerUser.count({ where }),
        ])

        // Filter out deleted users
        const activeUsers = users.filter(record => !record.user.deletedAt)

        return NextResponse.json({
            users: activeUsers.map(record => ({
                ...record.user,
                linkedAt: record.createdAt,
                operationsCount: record.user._count.operations
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })

    } catch (error) {
        console.error('List manager users error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user: manager } = authResult

        // Rate Limit
        const { allowed, result: limitResult } = await withRateLimit(
            `manager:${manager.id}`,
            RATE_LIMITS.manager
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'تجاوزت الحد المسموح، انتظر قليلاً' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

        const body = await request.json()
        const result = createUserSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { username, email, password, balance } = result.data

        // Check if username/email exists globally
        const existing = await prisma.user.findFirst({
            where: { OR: [{ username }, { email }] }
        })

        if (existing) {
            return NextResponse.json(
                { error: 'اسم المستخدم أو البريد الإلكتروني موجود بالفعل' },
                { status: 400 }
            )
        }

        const hashedPassword = await hash(password, 12)

        // Transaction: Create User + Link to Manager + Deduct Balance (with balance check INSIDE)
        try {
            const newUser = await prisma.$transaction(async (tx) => {
                // 1. Check manager balance INSIDE transaction (prevents race condition)
                if (balance > 0) {
                    const managerData = await tx.user.findUnique({
                        where: { id: manager.id },
                        select: { balance: true }
                    })

                    if (!managerData || managerData.balance < balance) {
                        throw new Error(`INSUFFICIENT_BALANCE:${managerData?.balance.toFixed(2) || 0}`)
                    }
                }

                // 2. Create User
                const user = await tx.user.create({
                    data: {
                        username,
                        email,
                        passwordHash: hashedPassword,
                        role: 'USER', // Always USER when created by Manager
                        balance,
                        isActive: true
                    }
                })

                // 3. Link to Manager
                await tx.managerUser.create({
                    data: {
                        managerId: manager.id,
                        userId: user.id
                    }
                })

                // 4. Deduct balance from manager if giving initial balance
                if (balance > 0) {
                    const updatedManager = await tx.user.update({
                        where: { id: manager.id },
                        data: { balance: { decrement: balance } }
                    })

                    // 5. Log the balance transfer as transaction
                    await tx.transaction.create({
                        data: {
                            userId: user.id,
                            type: 'DEPOSIT',
                            amount: balance,
                            notes: `رصيد أولي من المدير ${manager.username}`,
                            balanceAfter: balance
                        }
                    })

                    // Log manager side transaction (withdrawal)
                    await tx.transaction.create({
                        data: {
                            userId: manager.id,
                            type: 'WITHDRAW',
                            amount: balance,
                            notes: `تحويل رصيد للمستخدم الجديد ${username}`,
                            balanceAfter: updatedManager.balance
                        }
                    })
                }

                // 6. Log Activity
                await tx.activityLog.create({
                    data: {
                        userId: manager.id,
                        action: 'MANAGER_CREATE_USER',
                        details: { createdUserId: user.id, username: user.username, initialBalance: balance },
                        ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                    }
                })

                return user
            })

            return NextResponse.json({ success: true, user: newUser })

        } catch (error) {
            // Handle custom balance error
            if (error instanceof Error && error.message.startsWith('INSUFFICIENT_BALANCE:')) {
                const balance = error.message.split(':')[1]
                return NextResponse.json(
                    { error: `رصيدك غير كافي. رصيدك الحالي: $${balance}` },
                    { status: 400 }
                )
            }
            throw error
        }

    } catch (error) {
        console.error('Create manager user error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
