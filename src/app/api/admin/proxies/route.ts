import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

// GET /api/admin/proxies - List all proxies
export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
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
            id: p.id,
            host: p.host,
            port: p.port,
            username: p.username,
            // Don't expose password in response - just indicate if it exists
            hasPassword: !!p.password,
            label: p.label,
            isActive: p.isActive,
            lastTestedAt: p.lastTestedAt,
            lastIp: p.lastIp,
            responseTimeMs: p.responseTimeMs,
            failureCount: p.failureCount,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
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
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json()
        const { host, port, username, password, label, isActive = true } = body

        // Validation
        const errors: string[] = []

        if (!host || typeof host !== 'string' || host.trim().length === 0) {
            errors.push('عنوان IP مطلوب')
        }

        if (!port || typeof port !== 'number') {
            errors.push('رقم المنفذ مطلوب')
        } else if (port < 1 || port > 65535) {
            errors.push('رقم المنفذ يجب أن يكون بين 1 و 65535')
        }

        if (!label || typeof label !== 'string' || label.trim().length < 3) {
            errors.push('التسمية مطلوبة (3 أحرف على الأقل)')
        }

        // Username and password: both or none
        if ((username && !password) || (!username && password)) {
            errors.push('يجب إدخال اسم المستخدم وكلمة المرور معاً أو تركهما فارغين')
        }

        if (errors.length > 0) {
            return NextResponse.json(
                { error: errors.join(', ') },
                { status: 400 }
            )
        }

        // Check if same host:port exists
        const existing = await prisma.proxy.findFirst({
            where: {
                host: host.trim(),
                port: port
            }
        })

        if (existing) {
            return NextResponse.json(
                { error: 'هذا البروكسي موجود بالفعل (نفس الـ IP والمنفذ)' },
                { status: 400 }
            )
        }

        const proxy = await prisma.proxy.create({
            data: {
                host: host.trim(),
                port: port,
                username: username?.trim() || null,
                password: password || null,
                label: label.trim(),
                isActive: isActive
            }
        })

        return NextResponse.json({
            success: true,
            proxy: {
                id: proxy.id,
                host: proxy.host,
                port: proxy.port,
                username: proxy.username,
                hasPassword: !!proxy.password,
                label: proxy.label,
                isActive: proxy.isActive,
                createdAt: proxy.createdAt,
                accountsCount: 0
            }
        })

    } catch (error) {
        console.error('Create proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

