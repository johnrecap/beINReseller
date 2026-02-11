import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

/**
 * GET /api/admin/users/[id]/stats
 * 
 * جلب إحصائيات المستخدم المالية والعمليات
 * - الملخص المالي (إيداعات/خصومات/استردادات)
 * - مقارنة الرصيد المتوقع vs الفعلي
 * - كشف المخالفات (استرداد مزدوج/زائد)
 * - آخر المعاملات والعمليات
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await params
        const { searchParams } = new URL(request.url)
        const txLimit = parseInt(searchParams.get('txLimit') || '20')
        const txSkip = parseInt(searchParams.get('txSkip') || '0')
        const opLimit = parseInt(searchParams.get('opLimit') || '20')
        const opSkip = parseInt(searchParams.get('opSkip') || '0')

        // 1. Check admin authentication
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        // 2. Get user with current balance
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                email: true,
                balance: true,
                isActive: true,
                createdAt: true,
            }
        })

        if (!user) {
            return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
        }

        // 3. Get all transactions grouped by type
        const transactions = await prisma.transaction.findMany({
            where: { userId },
            select: {
                id: true,
                type: true,
                amount: true,
                operationId: true,
            }
        })

        // Calculate financial summary
        let totalDeposits = 0
        let totalDeductions = 0
        let totalRefunds = 0
        let totalWithdrawals = 0
        let totalCorrections = 0

        for (const tx of transactions) {
            switch (tx.type) {
                case 'DEPOSIT':
                    totalDeposits += tx.amount
                    break
                case 'OPERATION_DEDUCT':
                    totalDeductions += Math.abs(tx.amount)
                    break
                case 'REFUND':
                    totalRefunds += tx.amount
                    break
                case 'WITHDRAW':
                    totalWithdrawals += Math.abs(tx.amount)
                    break
                case 'CORRECTION':
                    totalCorrections += tx.amount
                    break
            }
        }

        // Calculate expected balance
        const expectedBalance = totalDeposits - totalDeductions + totalRefunds - totalWithdrawals + totalCorrections
        const actualBalance = user.balance
        const discrepancy = actualBalance - expectedBalance
        const isBalanceValid = Math.abs(discrepancy) < 0.01

        // Calculate completedSpent (deductions only for COMPLETED operations)
        const completedOps = await prisma.operation.findMany({
            where: { userId, status: 'COMPLETED' },
            select: { id: true }
        })
        const completedOpIds = new Set(completedOps.map(op => op.id))
        let completedSpent = 0
        for (const tx of transactions) {
            if (tx.type === 'OPERATION_DEDUCT' && tx.operationId && completedOpIds.has(tx.operationId)) {
                completedSpent += Math.abs(tx.amount)
            }
        }
        // netSpent = totalDeductions - totalRefunds (what the user actually lost)
        const netSpent = totalDeductions - totalRefunds

        // 4. Get corrected operation IDs to exclude them from alerts
        const correctedOperations = await prisma.operation.findMany({
            where: { userId, corrected: true },
            select: { id: true }
        })
        const correctedOpIds = new Set(correctedOperations.map(op => op.id))

        // 5. Detect Double Refunds (same operation has multiple refunds) - exclude corrected
        const refundsByOperation = new Map<string, number>()
        for (const tx of transactions) {
            if (tx.type === 'REFUND' && tx.operationId && !correctedOpIds.has(tx.operationId)) {
                refundsByOperation.set(
                    tx.operationId,
                    (refundsByOperation.get(tx.operationId) || 0) + 1
                )
            }
        }
        const doubleRefunds = Array.from(refundsByOperation.entries())
            .filter(([, count]) => count > 1)
            .map(([operationId, count]) => ({ operationId, count }))

        // 5. Detect Over-Refunds (refund amount > operation amount)
        const overRefunds: { operationId: string; refundAmount: number; operationAmount: number }[] = []

        // Get operations that have refunds (exclude corrected ones)
        const operationsWithRefunds = await prisma.operation.findMany({
            where: {
                userId,
                corrected: false,  // استبعاد العمليات المصححة
                transactions: {
                    some: { type: 'REFUND' }
                }
            },
            select: {
                id: true,
                amount: true,
                corrected: true,
                transactions: {
                    where: { type: 'REFUND' },
                    select: { amount: true }
                }
            }
        })

        // Detect Phantom Refunds (refund exists but operation amount = 0)
        const phantomRefunds: { operationId: string; refundAmount: number }[] = []

        for (const op of operationsWithRefunds) {
            const totalRefundForOp = op.transactions.reduce((sum, t) => sum + t.amount, 0)
            if (op.amount === 0 && totalRefundForOp > 0) {
                phantomRefunds.push({
                    operationId: op.id,
                    refundAmount: totalRefundForOp
                })
            } else if (totalRefundForOp > op.amount) {
                overRefunds.push({
                    operationId: op.id,
                    refundAmount: totalRefundForOp,
                    operationAmount: op.amount
                })
            }
        }

        // 6. Build alerts array
        const alerts: { type: string; message: string; severity: 'high' | 'medium' | 'low'; operationId?: string }[] = []

        if (!isBalanceValid) {
            alerts.push({
                type: 'BALANCE_MISMATCH',
                message: `رصيد غير متطابق: الفرق ${discrepancy.toFixed(2)} $`,
                severity: 'high'
            })
        }

        for (const dr of doubleRefunds) {
            alerts.push({
                type: 'DOUBLE_REFUND',
                message: `استرداد مزدوج: العملية لها ${dr.count} استردادات`,
                severity: 'high',
                operationId: dr.operationId
            })
        }

        for (const or of overRefunds) {
            alerts.push({
                type: 'OVER_REFUND',
                message: `استرداد زائد: تم استرداد ${or.refundAmount} من عملية قيمتها ${or.operationAmount}`,
                severity: 'high',
                operationId: or.operationId
            })
        }

        for (const pr of phantomRefunds) {
            alerts.push({
                type: 'PHANTOM_REFUND',
                message: `استرداد وهمي: تم استرداد ${pr.refundAmount} لعملية بدون خصم مسبق`,
                severity: 'high',
                operationId: pr.operationId
            })
        }

        // Build refund anomaly summary
        const refundSummary = {
            doubleRefunds: doubleRefunds.length,
            phantomRefunds: phantomRefunds.length,
            overRefunds: overRefunds.length,
        }

        // 7. Get operation stats
        const operationStats = await prisma.operation.groupBy({
            by: ['status'],
            where: { userId },
            _count: true
        })

        const opStats = {
            total: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
            pending: 0,
            processing: 0
        }

        for (const stat of operationStats) {
            opStats.total += stat._count
            switch (stat.status) {
                case 'COMPLETED':
                    opStats.completed = stat._count
                    break
                case 'FAILED':
                    opStats.failed = stat._count
                    break
                case 'CANCELLED':
                    opStats.cancelled = stat._count
                    break
                case 'PENDING':
                    opStats.pending = stat._count
                    break
                case 'PROCESSING':
                case 'AWAITING_CAPTCHA':
                case 'AWAITING_PACKAGE':
                case 'AWAITING_FINAL_CONFIRM':
                case 'COMPLETING':
                    opStats.processing += stat._count
                    break
            }
        }

        // 8. Get total transaction count and recent transactions with pagination
        const totalTransactions = await prisma.transaction.count({ where: { userId } })
        const recentTransactions = await prisma.transaction.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: txLimit,
            skip: txSkip,
            select: {
                id: true,
                type: true,
                amount: true,
                balanceAfter: true,
                notes: true,
                createdAt: true,
                operationId: true,
            }
        })

        // 9. Get total operation count and recent operations with pagination
        const totalOperationsCount = await prisma.operation.count({ where: { userId } })
        const recentOperations = await prisma.operation.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: opLimit,
            skip: opSkip,
            select: {
                id: true,
                type: true,
                cardNumber: true,
                amount: true,
                status: true,
                responseMessage: true,
                createdAt: true,
                completedAt: true,
            }
        })

        // 10. Return response
        return NextResponse.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isActive: user.isActive,
                createdAt: user.createdAt,
            },
            financials: {
                totalDeposits,
                totalDeductions,
                totalRefunds,
                totalWithdrawals,
                totalCorrections,
                expectedBalance,
                actualBalance,
                discrepancy,
                isBalanceValid,
                completedSpent,
                netSpent,
            },
            operations: opStats,
            alerts,
            refundSummary,
            recentTransactions,
            recentOperations,
            pagination: {
                transactions: {
                    total: totalTransactions,
                    limit: txLimit,
                    skip: txSkip,
                    hasMore: txSkip + txLimit < totalTransactions
                },
                operations: {
                    total: totalOperationsCount,
                    limit: opLimit,
                    skip: opSkip,
                    hasMore: opSkip + opLimit < totalOperationsCount
                }
            }
        })

    } catch (error) {
        console.error('Get user stats error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
