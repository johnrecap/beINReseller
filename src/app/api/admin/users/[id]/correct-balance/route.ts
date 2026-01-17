import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * POST /api/admin/users/[id]/correct-balance
 * 
 * تصحيح رصيد المستخدم الزائد
 * - يحسب الفرق ويخصمه
 * - يسجل معاملة CORRECTION
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await params
        const body = await request.json()
        const { type, operationId } = body as {
            type: 'BALANCE_MISMATCH' | 'DOUBLE_REFUND' | 'OVER_REFUND' | 'ALL'
            operationId?: string
        }

        // 1. Check admin authentication
        const session = await auth()
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        // 2. Get user with current balance
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, balance: true }
        })

        if (!user) {
            return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
        }

        // 3. Get all transactions to calculate expected balance
        const transactions = await prisma.transaction.findMany({
            where: { userId },
            select: { type: true, amount: true, operationId: true }
        })

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
                    totalCorrections += tx.amount // negative values
                    break
            }
        }

        const expectedBalance = totalDeposits - totalDeductions + totalRefunds - totalWithdrawals + totalCorrections
        const actualBalance = user.balance
        const discrepancy = actualBalance - expectedBalance

        // 4. Handle different correction types
        let correctionAmount = 0
        let correctionNotes = ''

        if (type === 'BALANCE_MISMATCH' || type === 'ALL') {
            // Balance mismatch - correct the discrepancy
            if (Math.abs(discrepancy) >= 0.01) {
                correctionAmount = -discrepancy // Negative to reduce balance
                correctionNotes = `تصحيح رصيد غير متطابق: الفرق $${discrepancy.toFixed(2)}`
            }
        } else if (type === 'DOUBLE_REFUND' && operationId) {
            // Double refund - find extra refunds for this operation
            const refundsForOp = transactions.filter(
                t => t.type === 'REFUND' && t.operationId === operationId
            )

            if (refundsForOp.length > 1) {
                // Get the operation amount
                const operation = await prisma.operation.findUnique({
                    where: { id: operationId },
                    select: { amount: true }
                })

                if (operation) {
                    const totalRefunded = refundsForOp.reduce((sum, r) => sum + r.amount, 0)
                    const excessRefund = totalRefunded - operation.amount

                    if (excessRefund > 0) {
                        correctionAmount = -excessRefund
                        correctionNotes = `تصحيح استرداد مزدوج للعملية ${operationId.slice(-6)}: تم استرداد ${refundsForOp.length} مرات`
                    }
                }
            }
        } else if (type === 'OVER_REFUND' && operationId) {
            // Over refund - refund amount > operation amount
            const operation = await prisma.operation.findUnique({
                where: { id: operationId },
                select: {
                    amount: true,
                    transactions: {
                        where: { type: 'REFUND' },
                        select: { amount: true }
                    }
                }
            })

            if (operation) {
                const totalRefunded = operation.transactions.reduce((sum, r) => sum + r.amount, 0)
                const excessRefund = totalRefunded - operation.amount

                if (excessRefund > 0) {
                    correctionAmount = -excessRefund
                    correctionNotes = `تصحيح استرداد زائد للعملية ${operationId.slice(-6)}: استرداد $${totalRefunded} من عملية $${operation.amount}`
                }
            }
        }

        // 5. If no correction needed
        if (Math.abs(correctionAmount) < 0.01) {
            return NextResponse.json({
                success: true,
                message: 'لا يوجد مبلغ للتصحيح',
                corrected: false,
                correctionAmount: 0
            })
        }

        // 6. Apply correction - use transaction for atomicity
        const result = await prisma.$transaction(async (tx) => {
            // Update user balance
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { balance: { increment: correctionAmount } }
            })

            // Create correction transaction
            const correctionTx = await tx.transaction.create({
                data: {
                    userId,
                    adminId: session.user.id,
                    amount: correctionAmount,
                    balanceAfter: updatedUser.balance,
                    type: 'CORRECTION',
                    notes: correctionNotes
                }
            })

            return { user: updatedUser, transaction: correctionTx }
        })

        return NextResponse.json({
            success: true,
            message: 'تم التصحيح بنجاح',
            corrected: true,
            correctionAmount: Math.abs(correctionAmount),
            newBalance: result.user.balance,
            transactionId: result.transaction.id
        })

    } catch (error) {
        console.error('Correct balance error:', error)
        return NextResponse.json({ error: 'حدث خطأ في التصحيح' }, { status: 500 })
    }
}
