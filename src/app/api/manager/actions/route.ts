import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPI } from '@/lib/auth-utils'

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
        const limit = parseInt(searchParams.get('limit') || '20')
        const type = searchParams.get('type') // Filter by action type
        const search = searchParams.get('search') // Search by username

        const whereManager = userRole === 'ADMIN' ? {} : { managerId }

        const where: any = {
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
