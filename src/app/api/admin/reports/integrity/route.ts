import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
        const issueType = searchParams.get('issueType') || ''
        const status = searchParams.get('status') || ''
        const severity = searchParams.get('severity') || ''
        const userId = searchParams.get('userId') || ''
        const beinAccountId = searchParams.get('beinAccountId') || ''
        const dateFrom = searchParams.get('dateFrom') || ''
        const dateTo = searchParams.get('dateTo') || ''
        const search = (searchParams.get('search') || '').trim()

        const where: Prisma.OperationIntegrityIssueWhereInput = {}

        if (issueType) where.issueType = issueType as Prisma.OperationIntegrityIssueWhereInput['issueType']
        if (status) where.status = status as Prisma.OperationIntegrityIssueWhereInput['status']
        if (severity) where.severity = severity as Prisma.OperationIntegrityIssueWhereInput['severity']
        if (userId) where.userId = userId
        if (beinAccountId) where.beinAccountId = beinAccountId

        if (dateFrom || dateTo) {
            where.detectedAt = {}
            if (dateFrom) where.detectedAt.gte = new Date(dateFrom)
            if (dateTo) {
                const end = new Date(dateTo)
                end.setHours(23, 59, 59, 999)
                where.detectedAt.lte = end
            }
        }

        if (search) {
            where.OR = [
                { operationId: { contains: search, mode: 'insensitive' } },
                { operation: { cardNumber: { contains: search, mode: 'insensitive' } } },
                { user: { username: { contains: search, mode: 'insensitive' } } },
                { beinAccount: { username: { contains: search, mode: 'insensitive' } } },
                { beinAccount: { label: { contains: search, mode: 'insensitive' } } }
            ]
        }

        const [issues, total] = await Promise.all([
            prisma.operationIntegrityIssue.findMany({
                where,
                include: {
                    operation: {
                        select: {
                            id: true,
                            cardNumber: true,
                            type: true,
                            status: true,
                            completedAt: true
                        }
                    },
                    user: {
                        select: { id: true, username: true, email: true }
                    },
                    beinAccount: {
                        select: { id: true, username: true, label: true }
                    },
                    reviewedBy: {
                        select: { id: true, username: true }
                    }
                },
                orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }],
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.operationIntegrityIssue.count({ where })
        ])

        return NextResponse.json({
            issues,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })
    } catch (error) {
        console.error('Integrity report list error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

