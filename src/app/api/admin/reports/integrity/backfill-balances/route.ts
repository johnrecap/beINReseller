import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => ({}))
        const days = Math.max(1, Math.min(120, Number(body?.days || 60)))
        const limit = Math.max(1, Math.min(5000, Number(body?.limit || 1000)))

        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const issues = await prisma.operationIntegrityIssue.findMany({
            where: {
                detectedAt: { gte: startDate },
                OR: [
                    { userBalanceBefore: null },
                    { userBalanceAfter: null }
                ]
            },
            select: {
                id: true,
                operationId: true,
                userBalanceBefore: true,
                userBalanceAfter: true
            },
            orderBy: { detectedAt: 'desc' },
            take: limit
        })

        let updated = 0
        for (const issue of issues) {
            const [deductionAgg, latestDeduction] = await Promise.all([
                prisma.transaction.aggregate({
                    where: {
                        operationId: issue.operationId,
                        type: 'OPERATION_DEDUCT'
                    },
                    _sum: { amount: true }
                }),
                prisma.transaction.findFirst({
                    where: {
                        operationId: issue.operationId,
                        type: 'OPERATION_DEDUCT'
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { balanceAfter: true }
                })
            ])

            const userDeductTotal = Math.abs(deductionAgg._sum.amount || 0)
            const userBalanceAfter =
                typeof latestDeduction?.balanceAfter === 'number' && !Number.isNaN(latestDeduction.balanceAfter)
                    ? latestDeduction.balanceAfter
                    : null
            const userBalanceBefore =
                userBalanceAfter === null
                    ? null
                    : userBalanceAfter + userDeductTotal

            if (userBalanceBefore === null || userBalanceAfter === null) continue

            await prisma.operationIntegrityIssue.update({
                where: { id: issue.id },
                data: {
                    userBalanceBefore: issue.userBalanceBefore ?? userBalanceBefore,
                    userBalanceAfter: issue.userBalanceAfter ?? userBalanceAfter
                }
            })
            updated++
        }

        return NextResponse.json({
            success: true,
            scanned: issues.length,
            updated,
            days,
            limit
        })
    } catch (error) {
        console.error('Integrity user balance backfill error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
