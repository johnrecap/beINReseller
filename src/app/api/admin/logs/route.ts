import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '20')
        const search = searchParams.get('search') || ''
        const action = searchParams.get('action') || ''
        const userId = searchParams.get('userId') || ''

        const where: Prisma.ActivityLogWhereInput = {}

        if (search) {
            where.OR = [
                { action: { contains: search, mode: 'insensitive' } },
                { user: { username: { contains: search, mode: 'insensitive' } } },
                { ipAddress: { contains: search } }
            ]
        }

        if (action) {
            // Support comma-separated action values for grouped filters
            const actions = action.split(',').map(a => a.trim()).filter(Boolean)
            if (actions.length === 1) {
                where.action = actions[0]
            } else if (actions.length > 1) {
                where.action = { in: actions }
            }
        }

        if (userId) {
            where.userId = userId
        }

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                include: {
                    user: {
                        select: { username: true, email: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.activityLog.count({ where }),
        ])

        return NextResponse.json({
            logs: logs.map(log => ({
                ...log,
                username: log.user.username,
                email: log.user.email
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })

    } catch (error) {
        console.error('List logs error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
