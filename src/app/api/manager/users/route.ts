import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPI } from '@/lib/auth-utils'
import { z } from 'zod'
import { hash } from 'bcryptjs'

const createUserSchema = z.object({
    username: z.string().min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
    email: z.string().email('البريد الإلكتروني غير صالح'),
    password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
    balance: z.number().min(0).optional().default(0),
})

export async function GET(request: Request) {
    try {
        const authResult = await requireRoleAPI('MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user } = authResult
        const managerId = user.id
        const userRole = user.role

        // Parse query params
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')
        const search = searchParams.get('search') || ''

        // Should return users managed by this manager
        // If admin, can see all or filter by manager_id param
        const whereManager = userRole === 'ADMIN' ? {} : { managerId }

        const where: any = {
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

        return NextResponse.json({
            users: users.map(record => ({
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

export async function POST(request: Request) {
    try {
        const authResult = await requireRoleAPI('MANAGER')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user: manager } = authResult

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

        // Transaction: Create User + Link to Manager
        const newUser = await prisma.$transaction(async (tx) => {
            // 1. Create User
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

            // 2. Link to Manager
            await tx.managerUser.create({
                data: {
                    managerId: manager.id,
                    userId: user.id
                }
            })

            // 3. Log Activity
            await tx.activityLog.create({
                data: {
                    userId: manager.id,
                    action: 'MANAGER_CREATE_USER',
                    details: { createdUserId: user.id, username: user.username },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })

            return user
        })

        return NextResponse.json({ success: true, user: newUser })

    } catch (error) {
        console.error('Create manager user error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
