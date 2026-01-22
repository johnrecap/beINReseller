import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// GET /api/admin/proxies - List all proxies
export async function GET() {
    try {
        const session = await auth()

        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const proxies = await prisma.proxy.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { accounts: true }
                }
            }
        })

        const proxiesWithCount = proxies.map(p => ({
            ...p,
            accountsCount: p._count.accounts
        }))

        return NextResponse.json({
            success: true,
            proxies: proxiesWithCount
        })

    } catch (error) {
        console.error('Get proxies error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/admin/proxies - Create new proxy
export async function POST(request: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { sessionId, label } = body

        if (!sessionId) {
            return NextResponse.json(
                { error: 'Session ID مطلوب' },
                { status: 400 }
            )
        }

        // Check if exists
        const existing = await prisma.proxy.findUnique({
            where: { sessionId }
        })

        if (existing) {
            return NextResponse.json(
                { error: 'Session ID موجود بالفعل' },
                { status: 400 }
            )
        }

        const proxy = await prisma.proxy.create({
            data: {
                sessionId,
                label,
                isActive: true
            }
        })

        return NextResponse.json({
            success: true,
            proxy: {
                ...proxy,
                accountsCount: 0
            }
        })

    } catch (error) {
        console.error('Create proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
