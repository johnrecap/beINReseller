import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { Role } from '@/lib/permissions'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { emptyPointSummary, groupPointSummariesByOwner } from '@/lib/points/balance'
import { getAgentTransferErrorResponse, transferUserToAgentInTransaction } from '@/lib/agents/assignment-transfer'
import { buildManagerOwnedUserFilter } from '@/lib/admin/users-ownership-filter'
import { PERMISSION_KEYS } from '@/lib/permissions/catalog'
import { requirePermissionAPIWithMobile } from '@/lib/permissions/guards'

const createUserSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['ADMIN', 'MANAGER', 'AGENT', 'USER']).optional().default('USER'),
    balance: z.number().optional().default(0),
    agentId: z.string().min(1).optional().nullable(),
    sourceGroup: z.string().trim().max(120).optional().nullable(),
    whatsappGroupUrl: z.string().trim().max(500).optional().nullable(),
})

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user } = authResult

        // Rate Limit
        const { allowed, result: limitResult } = await withRateLimit(
            `admin:${user.id}`,
            RATE_LIMITS.admin
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded, please wait' },
                { status: 429, headers: rateLimitHeaders(limitResult) }
            )
        }

        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')
        const search = searchParams.get('search') || ''
        const roleFilter = searchParams.get('roleFilter') as 'distributors' | 'agents' | 'users' | null
        const managerId = searchParams.get('managerId') || ''

        // Build where clause based on roleFilter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = { deletedAt: null }

        // Add role filter
        if (roleFilter === 'distributors') {
            // ADMIN and MANAGER are considered distributors
            where.role = { in: ['ADMIN', 'MANAGER'] }
        } else if (roleFilter === 'agents') {
            where.role = 'AGENT'
        } else if (roleFilter === 'users') {
            // Only USER role
            where.role = 'USER'

            // If managerId is provided, use current ownership with a legacy creator fallback.
            if (managerId) {
                Object.assign(where, buildManagerOwnedUserFilter(managerId))
            }
        }

        // Add search filter
        if (search) {
            const searchCondition = [
                { username: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } }
            ]
            if (where.OR) {
                // Combine with existing OR (managerId filter)
                where.AND = [
                    { OR: where.OR },
                    { OR: searchCondition }
                ]
                delete where.OR
            } else {
                where.OR = searchCondition
            }
        }

        async function getPointSummaries(userIds: string[]) {
            if (userIds.length === 0) return new Map()
            const entries = await prisma.pointLedgerEntry.findMany({
                where: { ownerUserId: { in: userIds } },
                select: {
                    ownerUserId: true,
                    sourceType: true,
                    status: true,
                    points: true,
                },
            })
            return groupPointSummariesByOwner(entries)
        }

        // Different select based on roleFilter
        if (roleFilter === 'distributors') {
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
                        // Count of managed users (via ManagerUser junction)
                        _count: {
                            select: {
                                managedUsers: {
                                    where: { user: { deletedAt: null } }
                                }
                            }
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
                prisma.user.count({ where }),
            ])

            const pointSummaries = await getPointSummaries(users.map((u) => u.id))

            return NextResponse.json({
                users: users.map(u => ({
                    ...u,
                    // Count of users managed via ManagerUser
                    managedUsersCount: u._count.managedUsers,
                    points: pointSummaries.get(u.id) ?? emptyPointSummary(),
                })),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            })
        } else if (roleFilter === 'agents') {
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
                        agentProfile: {
                            select: {
                                displayName: true,
                                defaultSourceGroup: true,
                                whatsappHandoffGroupUrl: true,
                                isActive: true,
                            },
                        },
                        _count: {
                            select: {
                                agentAssignmentsAsAgent: {
                                    where: {
                                        isActive: true,
                                        user: { deletedAt: null },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
                prisma.user.count({ where }),
            ])

            const pointSummaries = await getPointSummaries(users.map((u) => u.id))

            return NextResponse.json({
                users: users.map(u => ({
                    id: u.id,
                    username: u.username,
                    email: u.email,
                    role: u.role,
                    balance: u.balance,
                    isActive: u.isActive,
                    createdAt: u.createdAt,
                    lastLoginAt: u.lastLoginAt,
                    assignedUsersCount: u._count.agentAssignmentsAsAgent,
                    profile: {
                        displayName: u.agentProfile?.displayName || '',
                        defaultSourceGroup: u.agentProfile?.defaultSourceGroup || '',
                        whatsappHandoffGroupUrl: u.agentProfile?.whatsappHandoffGroupUrl || '',
                        isActive: u.agentProfile?.isActive ?? u.isActive,
                    },
                    points: pointSummaries.get(u.id) ?? emptyPointSummary(),
                })),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            })
        } else if (roleFilter === 'users') {
            // Get proxy limit setting for users tab
            const proxyLimitSetting = await prisma.setting.findUnique({
                where: { key: 'user_proxy_limit' }
            })
            const proxyLimit = proxyLimitSetting ? parseInt(proxyLimitSetting.value) || 0 : 0

            // Get IDs of users who should have proxy linked (oldest N users by creation date)
            let proxyLinkedUserIds: string[] = []
            if (proxyLimit > 0) {
                const oldestUsers = await prisma.user.findMany({
                    where: { role: 'USER', deletedAt: null },
                    select: { id: true },
                    orderBy: { createdAt: 'asc' },
                    take: proxyLimit
                })
                proxyLinkedUserIds = oldestUsers.map(u => u.id)
            }

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
                        // Include creator info
                        createdBy: {
                            select: {
                                id: true,
                                username: true,
                                email: true,
                                role: true
                            }
                        },
                        // Include manager link (legacy relationship)
                        managerLink: {
                            select: {
                                manager: {
                                    select: {
                                        id: true,
                                        username: true,
                                        email: true,
                                        role: true
                                    }
                                }
                            },
                            take: 1
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
                prisma.user.count({ where }),
            ])

            const pointSummaries = await getPointSummaries(users.map((u) => u.id))

            return NextResponse.json({
                users: users.map(u => {
                    // Prefer createdBy, fallback to managerLink for legacy data
                    const creator = u.createdBy || u.managerLink[0]?.manager || null
                    return {
                        id: u.id,
                        username: u.username,
                        email: u.email,
                        role: u.role,
                        balance: u.balance,
                        isActive: u.isActive,
                        createdAt: u.createdAt,
                        lastLoginAt: u.lastLoginAt,
                        transactionCount: u._count.transactions,
                        operationCount: u._count.operations,
                        // Creator/Manager info
                        creatorId: creator?.id || null,
                        creatorUsername: creator?.username || null,
                        creatorEmail: creator?.email || null,
                        creatorRole: creator?.role || null,
                        // Proxy status (based on user_proxy_limit setting)
                        hasProxyLinked: proxyLinkedUserIds.includes(u.id),
                        points: pointSummaries.get(u.id) ?? emptyPointSummary(),
                    }
                }),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            })
        }

        // Default: return all users (no roleFilter)
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

        const pointSummaries = await getPointSummaries(users.map((u) => u.id))

        return NextResponse.json({
            users: users.map(u => ({
                ...u,
                transactionCount: u._count.transactions,
                operationCount: u._count.operations,
                points: pointSummaries.get(u.id) ?? emptyPointSummary(),
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })

    } catch (error) {
        console.error('List users error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Error details:', errorMessage)
        return NextResponse.json({ error: 'Server error', details: errorMessage }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { user } = authResult

        const permissionResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.USERS_CREATE)
        if ('response' in permissionResult) {
            return permissionResult.response
        }

        const body = await request.json()
        const result = createUserSchema.safeParse(body)

        if (!result.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: result.error.flatten() },
                { status: 400 }
            )
        }

        const { username, email, password, role, balance, agentId, sourceGroup, whatsappGroupUrl } = result.data

        if (agentId && role !== 'USER') {
            return NextResponse.json(
                { error: 'Agent ownership can only be assigned to USER accounts' },
                { status: 400 }
            )
        }

        // Check existing
        const existing = await prisma.user.findFirst({
            where: { OR: [{ username }, { email }] }
        })

        if (existing) {
            return NextResponse.json(
                { error: 'Username or email already exists' },
                { status: 400 }
            )
        }

        const hashedPassword = await hash(password, 12)

        if (agentId && role === 'USER') {
            try {
                const created = await prisma.$transaction(async (tx) => {
                    const newUser = await tx.user.create({
                        data: {
                            username,
                            email,
                            passwordHash: hashedPassword,
                            role: role as Role,
                            balance,
                            isActive: true,
                            createdById: user.id
                        }
                    })

                    const transfer = await transferUserToAgentInTransaction({
                        userId: newUser.id,
                        agentId,
                        sourceGroup,
                        whatsappGroupUrl,
                        replaceExisting: true,
                        adminUserId: user.id,
                        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    }, tx)

                    await tx.activityLog.create({
                        data: {
                            userId: user.id,
                            action: 'ADMIN_CREATE_AGENT_USER',
                            details: {
                                createdUserId: newUser.id,
                                username: newUser.username,
                                agentId,
                                sourceGroup: transfer.assignment.sourceGroup,
                                whatsappGroupUrl: transfer.assignment.whatsappGroupUrl,
                            },
                            ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                        }
                    })

                    return { user: newUser, assignment: transfer.assignment }
                })

                return NextResponse.json({ success: true, user: created.user, assignment: created.assignment })
            } catch (error) {
                const transferError = getAgentTransferErrorResponse(error)
                if (transferError) {
                    return NextResponse.json({
                        error: transferError.code,
                        reason: transferError.code,
                    }, { status: transferError.status })
                }
                throw error
            }
        }

        const newUser = await prisma.user.create({
            data: {
                username,
                email,
                passwordHash: hashedPassword,
                role: role as Role,
                balance,
                isActive: true,
                createdById: user.id
            }
        })

        if (role === 'USER') {
            await prisma.managerUser.create({
                data: {
                    managerId: user.id,
                    userId: newUser.id
                }
            })
        }

        await prisma.activityLog.create({
            data: {
                userId: user.id,
                action: 'ADMIN_CREATE_USER',
                details: `Created ${role} user: ${username}`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({ success: true, user: newUser })

    } catch (error) {
        console.error('Create user error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
