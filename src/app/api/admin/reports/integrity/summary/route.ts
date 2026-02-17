import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const days = Math.max(1, parseInt(searchParams.get('days') || '30'))
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const [total, byStatus, byType, bySeverity, openHigh] = await Promise.all([
            prisma.operationIntegrityIssue.count({
                where: { detectedAt: { gte: startDate } }
            }),
            prisma.operationIntegrityIssue.groupBy({
                by: ['status'],
                where: { detectedAt: { gte: startDate } },
                _count: true
            }),
            prisma.operationIntegrityIssue.groupBy({
                by: ['issueType'],
                where: { detectedAt: { gte: startDate } },
                _count: true
            }),
            prisma.operationIntegrityIssue.groupBy({
                by: ['severity'],
                where: { detectedAt: { gte: startDate } },
                _count: true
            }),
            prisma.operationIntegrityIssue.count({
                where: {
                    detectedAt: { gte: startDate },
                    status: 'OPEN',
                    severity: 'HIGH'
                }
            })
        ])

        return NextResponse.json({
            period: { days, startDate: startDate.toISOString() },
            total,
            openHigh,
            byStatus,
            byType,
            bySeverity
        })
    } catch (error) {
        console.error('Integrity summary error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

