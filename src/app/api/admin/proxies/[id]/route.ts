import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

interface RouteParams {
    params: Promise<{ id: string }>
}

// GET /api/admin/proxies/[id] - Get single proxy
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        const proxy = await prisma.proxy.findUnique({
            where: { id },
            include: {
                accounts: {
                    select: {
                        id: true,
                        username: true,
                        label: true,
                        isActive: true
                    }
                },
                _count: {
                    select: { accounts: true }
                }
            }
        })

        if (!proxy) {
            return NextResponse.json({ error: 'Proxy not found' }, { status: 404 })
        }

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
                lastTestedAt: proxy.lastTestedAt,
                lastIp: proxy.lastIp,
                responseTimeMs: proxy.responseTimeMs,
                failureCount: proxy.failureCount,
                createdAt: proxy.createdAt,
                updatedAt: proxy.updatedAt,
                accounts: proxy.accounts,
                accountsCount: proxy._count.accounts
            }
        })

    } catch (error) {
        console.error('Get proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PUT /api/admin/proxies/[id] - Update proxy
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json()
        const { host, port, username, password, label, isActive } = body

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 })
        }

        // Check if proxy exists
        const existingProxy = await prisma.proxy.findUnique({
            where: { id }
        })

        if (!existingProxy) {
            return NextResponse.json({ error: 'Proxy not found' }, { status: 404 })
        }

        // Build update data
        const updateData: {
            host?: string
            port?: number
            username?: string | null
            password?: string | null
            label?: string
            isActive?: boolean
        } = {}

        // Validation and preparation
        const errors: string[] = []

        if (host !== undefined) {
            if (typeof host !== 'string' || host.trim().length === 0) {
                errors.push('Invalid IP address')
            } else {
                updateData.host = host.trim()
            }
        }

        if (port !== undefined) {
            if (typeof port !== 'number' || port < 1 || port > 65535) {
                errors.push('Port number must be between 1 and 65535')
            } else {
                updateData.port = port
            }
        }

        if (label !== undefined) {
            if (typeof label !== 'string' || label.trim().length < 3) {
                errors.push('Label must be at least 3 characters')
            } else {
                updateData.label = label.trim()
            }
        }

        if (isActive !== undefined) {
            updateData.isActive = !!isActive
        }

        // Handle username/password
        if (username !== undefined || password !== undefined) {
            const newUsername = username !== undefined ? username : existingProxy.username
            const newPassword = password !== undefined ? password : existingProxy.password

            // Both or none
            if ((newUsername && !newPassword) || (!newUsername && newPassword)) {
                errors.push('Username and password must both be provided or both be empty')
            } else {
                updateData.username = newUsername?.trim() || null
                updateData.password = newPassword || null
            }
        }

        if (errors.length > 0) {
            return NextResponse.json(
                { error: errors.join(', ') },
                { status: 400 }
            )
        }

        // Check for duplicate host:port (if changing)
        if (updateData.host || updateData.port) {
            const checkHost = updateData.host || existingProxy.host
            const checkPort = updateData.port || existingProxy.port

            const duplicate = await prisma.proxy.findFirst({
                where: {
                    host: checkHost,
                    port: checkPort,
                    id: { not: id }
                }
            })

            if (duplicate) {
                return NextResponse.json(
                    { error: 'This proxy already exists (same IP and port)' },
                    { status: 400 }
                )
            }
        }

        const proxy = await prisma.proxy.update({
            where: { id },
            data: updateData
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
                lastTestedAt: proxy.lastTestedAt,
                lastIp: proxy.lastIp,
                responseTimeMs: proxy.responseTimeMs,
                failureCount: proxy.failureCount,
                createdAt: proxy.createdAt,
                updatedAt: proxy.updatedAt
            }
        })

    } catch (error) {
        console.error('Update proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE /api/admin/proxies/[id] - Delete proxy
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params

        // Check if used by accounts
        const usage = await prisma.beinAccount.count({
            where: { proxyId: id }
        })

        if (usage > 0) {
            return NextResponse.json(
                { error: `Cannot delete this proxy because it is used by ${usage} accounts` },
                { status: 400 }
            )
        }

        await prisma.proxy.delete({
            where: { id }
        })

        return NextResponse.json({
            success: true,
            message: 'Proxy deleted successfully'
        })

    } catch (error) {
        console.error('Delete proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

