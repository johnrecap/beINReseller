import prisma from '@/lib/prisma'

export type UserStatsReportPagination = {
    txLimit: number
    txSkip: number
    opLimit: number
    opSkip: number
}

export async function getUserStatsReport(userId: string, pagination: UserStatsReportPagination) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            email: true,
            balance: true,
            isActive: true,
            createdAt: true,
        },
    })

    if (!user) return null

    const transactions = await prisma.transaction.findMany({
        where: { userId },
        select: {
            id: true,
            type: true,
            amount: true,
            operationId: true,
        },
    })

    let totalDeposits = 0
    let totalDeductions = 0
    let totalRefunds = 0
    let totalWithdrawals = 0
    let totalCorrections = 0

    for (const transaction of transactions) {
        switch (transaction.type) {
            case 'DEPOSIT':
                totalDeposits += transaction.amount
                break
            case 'OPERATION_DEDUCT':
                totalDeductions += Math.abs(transaction.amount)
                break
            case 'REFUND':
                totalRefunds += transaction.amount
                break
            case 'WITHDRAW':
                totalWithdrawals += Math.abs(transaction.amount)
                break
            case 'CORRECTION':
                totalCorrections += transaction.amount
                break
        }
    }

    const expectedBalance = totalDeposits - totalDeductions + totalRefunds - totalWithdrawals + totalCorrections
    const actualBalance = user.balance
    const discrepancy = actualBalance - expectedBalance
    const isBalanceValid = Math.abs(discrepancy) < 0.01

    const completedOps = await prisma.operation.findMany({
        where: { userId, status: 'COMPLETED' },
        select: { id: true },
    })
    const completedOpIds = new Set(completedOps.map((operation) => operation.id))
    let completedSpent = 0
    for (const transaction of transactions) {
        if (transaction.type === 'OPERATION_DEDUCT' && transaction.operationId && completedOpIds.has(transaction.operationId)) {
            completedSpent += Math.abs(transaction.amount)
        }
    }
    const netSpent = totalDeductions - totalRefunds

    const correctedOperations = await prisma.operation.findMany({
        where: { userId, corrected: true },
        select: { id: true },
    })
    const correctedOpIds = new Set(correctedOperations.map((operation) => operation.id))

    const refundsByOperation = new Map<string, number>()
    for (const transaction of transactions) {
        if (transaction.type === 'REFUND' && transaction.operationId && !correctedOpIds.has(transaction.operationId)) {
            refundsByOperation.set(
                transaction.operationId,
                (refundsByOperation.get(transaction.operationId) || 0) + 1
            )
        }
    }
    const doubleRefunds = Array.from(refundsByOperation.entries())
        .filter(([, count]) => count > 1)
        .map(([operationId, count]) => ({ operationId, count }))

    const operationsWithRefunds = await prisma.operation.findMany({
        where: {
            userId,
            corrected: false,
            transactions: {
                some: { type: 'REFUND' },
            },
        },
        select: {
            id: true,
            amount: true,
            corrected: true,
            transactions: {
                where: { type: 'REFUND' },
                select: { amount: true },
            },
        },
    })

    const overRefunds: { operationId: string; refundAmount: number; operationAmount: number }[] = []
    const phantomRefunds: { operationId: string; refundAmount: number }[] = []

    for (const operation of operationsWithRefunds) {
        const totalRefundForOperation = operation.transactions.reduce((sum, transaction) => sum + transaction.amount, 0)
        if (operation.amount === 0 && totalRefundForOperation > 0) {
            phantomRefunds.push({
                operationId: operation.id,
                refundAmount: totalRefundForOperation,
            })
        } else if (totalRefundForOperation > operation.amount) {
            overRefunds.push({
                operationId: operation.id,
                refundAmount: totalRefundForOperation,
                operationAmount: operation.amount,
            })
        }
    }

    const alerts: { type: string; message: string; severity: 'high' | 'medium' | 'low'; operationId?: string }[] = []

    if (!isBalanceValid) {
        alerts.push({
            type: 'BALANCE_MISMATCH',
            message: `Balance mismatch: difference ${discrepancy.toFixed(2)} $`,
            severity: 'high',
        })
    }

    for (const doubleRefund of doubleRefunds) {
        alerts.push({
            type: 'DOUBLE_REFUND',
            message: `Duplicate refund: operation has ${doubleRefund.count} refunds`,
            severity: 'high',
            operationId: doubleRefund.operationId,
        })
    }

    for (const overRefund of overRefunds) {
        alerts.push({
            type: 'OVER_REFUND',
            message: `Excess refund: refunded ${overRefund.refundAmount} from operation worth ${overRefund.operationAmount}`,
            severity: 'high',
            operationId: overRefund.operationId,
        })
    }

    for (const phantomRefund of phantomRefunds) {
        alerts.push({
            type: 'PHANTOM_REFUND',
            message: `Ghost refund: refunded ${phantomRefund.refundAmount} for operation without prior deduction`,
            severity: 'high',
            operationId: phantomRefund.operationId,
        })
    }

    const operationStats = await prisma.operation.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
    })

    const opStats = {
        total: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        pending: 0,
        processing: 0,
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

    const totalTransactions = await prisma.transaction.count({ where: { userId } })
    const recentTransactions = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: pagination.txLimit,
        skip: pagination.txSkip,
        select: {
            id: true,
            type: true,
            amount: true,
            balanceAfter: true,
            notes: true,
            createdAt: true,
            operationId: true,
        },
    })

    const totalOperationsCount = await prisma.operation.count({ where: { userId } })
    const recentOperations = await prisma.operation.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: pagination.opLimit,
        skip: pagination.opSkip,
        select: {
            id: true,
            type: true,
            cardNumber: true,
            amount: true,
            status: true,
            responseMessage: true,
            createdAt: true,
            completedAt: true,
        },
    })

    return {
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
        refundSummary: {
            doubleRefunds: doubleRefunds.length,
            phantomRefunds: phantomRefunds.length,
            overRefunds: overRefunds.length,
        },
        recentTransactions,
        recentOperations,
        pagination: {
            transactions: {
                total: totalTransactions,
                limit: pagination.txLimit,
                skip: pagination.txSkip,
                hasMore: pagination.txSkip + pagination.txLimit < totalTransactions,
            },
            operations: {
                total: totalOperationsCount,
                limit: pagination.opLimit,
                skip: pagination.opSkip,
                hasMore: pagination.opSkip + pagination.opLimit < totalOperationsCount,
            },
        },
    }
}
