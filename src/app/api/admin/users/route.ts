import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { hash } from 'bcryptjs'

const createUserSchema = z.object({
    username: z.string().min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
    email: z.string().email('البريد الإلكتروني غير صالح'),
    password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
})

export async function GET(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')
        const search = searchParams.get('search') || ''

        const where = search ? {
            OR: [
                { username: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } }
            ]
        } : {}

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    username: true,
                    email: true,
                    role: true,
                    balance: true,
                    isActive: true,
                    createdAt: true,
                    lastLoginAt: true,
                    _count: { select: { transactions: true, operations: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.user.count({ where }),
        ])

        return NextResponse.json({
            users: users.map(u => ({
                ...u,
                transactionCount: u._count.transactions,
                operationCount: u._count.operations
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })

    } catch (error) {
        console.error('List users error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const body = await request.json()
        const result = createUserSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { username, email, password } = result.data

        // Check existing
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

        const newUser = await prisma.user.create({
            data: {
                username,
                email,
                passwordHash: hashedPassword,
                role: 'RESELLER',
                balance: 0,
                isActive: true
            }
        })

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: session.user.id,
                action: 'ADMIN_CREATE_USER',
                details: `Created user: ${username}`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({ success: true, user: newUser })

    } catch (error) {
        console.error('Create user error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
