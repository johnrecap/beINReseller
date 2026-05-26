import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { utcIsoToCairoDateInput } from '@/lib/egypt-time'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const page = Math.max(1, Number(searchParams.get('page') || 1))
        const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 25)))
        const search = searchParams.get('search')?.trim()
        const eventKey = searchParams.get('eventKey')?.trim()

        const where = {
            ...(eventKey ? { eventKey } : {}),
            ...(search
                ? {
                    OR: [
                        { eventKey: { contains: search, mode: 'insensitive' as const } },
                        { user: { username: { contains: search, mode: 'insensitive' as const } } },
                        { user: { email: { contains: search, mode: 'insensitive' as const } } },
                    ],
                }
                : {}),
        }

        const [total, claims] = await Promise.all([
            prisma.eidRewardClaim.count({ where }),
            prisma.eidRewardClaim.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    points: true,
                    moneyValue: true,
                    claimDate: true,
                    eventKey: true,
                    ipAddress: true,
                    userAgent: true,
                    pointLedgerEntryId: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            role: true,
                        },
                    },
                },
            }),
        ])

        return NextResponse.json({
            claims: claims.map((claim) => ({
                ...claim,
                claimDate: utcIsoToCairoDateInput(claim.claimDate.toISOString()),
                createdAt: claim.createdAt.toISOString(),
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        })
    } catch (error) {
        console.error('Admin Eid claims GET error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
