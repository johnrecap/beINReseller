import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'

/**
 * POST /api/admin/users/[id]/correct-balance
 * 
 * تصحيح رصيد المستخدم
 * - BALANCE_MISMATCH: تصحيح الفرق في الرصيد
 * - INITIALIZE_BALANCE: إضافة رصيد مبدئي كإيداع
 * - ADD_MISSING: إضافة المبلغ الناقص
 * - DOUBLE_REFUND / OVER_REFUND: تصحيح الاستردادات الزائدة
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await params
        const body = await request.json()
        const { type, operationId, notes: customNotes } = body as {
            type: 'BALANCE_MISMATCH' | 'DOUBLE_REFUND' | 'OVER_REFUND' | 'INITIALIZE_BALANCE' | 'ADD_MISSING'
            operationId?: string
            notes?: string
        }

        // 1. Check admin authentication
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }
        const adminUser = authResult.user

        // 2. Get user with current balance
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, balance: true }
        })

        if (!user) {
            return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
        }

        let correctionAmount = 0
        let correctionNotes = ''
        let operationToCorrect: string | null = null
        let transactionType: 'CORRECTION' | 'DEPOSIT' = 'CORRECTION'

        // Helper: Calculate expected balance
        const calculateExpectedBalance = async () => {
            const transactions = await prisma.transaction.findMany({
                where: { userId },
                select: { type: true, amount: true }
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
                        totalCorrections += tx.amount
                        break
                }
            }

            return totalDeposits - totalDeductions + totalRefunds - totalWithdrawals + totalCorrections
        }

        // 3. Handle INITIALIZE_BALANCE - Add as initial deposit
        if (type === 'INITIALIZE_BALANCE') {
            const expectedBalance = await calculateExpectedBalance()
            const discrepancy = user.balance - expectedBalance

            if (discrepancy > 0.01) {
                // User has more balance than expected - create DEPOSIT to record it
                correctionAmount = discrepancy // Positive amount for DEPOSIT
                transactionType = 'DEPOSIT'
                correctionNotes = customNotes || 'رصيد مبدئي / Initial Balance'
            } else {
                return NextResponse.json({
                    success: true,
                    message: 'لا يوجد رصيد زائد لتسجيله كرصيد مبدئي',
                    corrected: false
                })
            }
        }
        // Handle ADD_MISSING - Add missing amount for negative discrepancy
        else if (type === 'ADD_MISSING') {
            const expectedBalance = await calculateExpectedBalance()
            const discrepancy = user.balance - expectedBalance

            if (discrepancy < -0.01) {
                // User has less balance than expected - add the missing amount
                correctionAmount = Math.abs(discrepancy) // Positive CORRECTION to add
                correctionNotes = customNotes || `إضافة رصيد ناقص: $${Math.abs(discrepancy).toFixed(2)} / Adding missing balance`
            } else {
                return NextResponse.json({
                    success: true,
                    message: 'لا يوجد رصيد ناقص لإضافته',
                    corrected: false
                })
            }
        }
        // 3. Handle DOUBLE_REFUND or OVER_REFUND
        else if ((type === 'DOUBLE_REFUND' || type === 'OVER_REFUND') && operationId) {
            // Check if already corrected
            const operation = await prisma.operation.findUnique({
                where: { id: operationId },
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

            if (!operation) {
                return NextResponse.json({ error: 'العملية غير موجودة' }, { status: 404 })
            }

            if (operation.corrected) {
                return NextResponse.json({
                    success: true,
                    message: 'تم تصحيح هذه العملية مسبقاً',
                    corrected: false,
                    alreadyCorrected: true
                })
            }

            // Calculate excess refund
            const totalRefunded = operation.transactions.reduce((sum, r) => sum + r.amount, 0)
            const excessRefund = totalRefunded - operation.amount

            if (excessRefund > 0) {
                correctionAmount = -excessRefund // خصم الزيادة
                correctionNotes = type === 'DOUBLE_REFUND'
                    ? `تصحيح استرداد مزدوج: تم استرداد ${operation.transactions.length} مرات بإجمالي $${totalRefunded} من عملية قيمتها $${operation.amount}`
                    : `تصحيح استرداد زائد: تم استرداد $${totalRefunded} من عملية قيمتها $${operation.amount}`
                operationToCorrect = operationId
            }
        }
        // Handle BALANCE_MISMATCH - Deduct excess balance
        else if (type === 'BALANCE_MISMATCH') {
            const expectedBalance = await calculateExpectedBalance()
            const actualBalance = user.balance
            const discrepancy = actualBalance - expectedBalance

            // فقط إذا الفرق موجب (زيادة) نقوم بالخصم
            if (discrepancy > 0.01) {
                // Prevent negative balance: only deduct up to current balance
                const maxDeduction = Math.min(discrepancy, user.balance)
                correctionAmount = -maxDeduction // خصم الزيادة
                
                if (maxDeduction < discrepancy) {
                    // Can't deduct full amount, balance will be $0
                    correctionNotes = customNotes || `تصحيح رصيد زائد: الفرق كان $${discrepancy.toFixed(2)} (تم خصم $${maxDeduction.toFixed(2)} - الرصيد أصبح صفر)`
                } else {
                    correctionNotes = customNotes || `تصحيح رصيد زائد: الفرق كان $${discrepancy.toFixed(2)}`
                }
            } else if (discrepancy < -0.01) {
                // الفرق سالب = المستخدم ناقص رصيد - now we inform the user to use ADD_MISSING instead
                return NextResponse.json({
                    success: false,
                    message: `الرصيد ناقص بـ $${Math.abs(discrepancy).toFixed(2)} - استخدم خيار "إضافة المبلغ الناقص"`,
                    needsManualReview: true,
                    discrepancy,
                    suggestedAction: 'ADD_MISSING'
                })
            } else {
                return NextResponse.json({
                    success: true,
                    message: 'الرصيد متطابق، لا يوجد ما يحتاج تصحيح',
                    corrected: false
                })
            }
        }

        // 4. If no correction needed
        if (Math.abs(correctionAmount) < 0.01) {
            return NextResponse.json({
                success: true,
                message: 'لا يوجد مبلغ للتصحيح',
                corrected: false,
                correctionAmount: 0
            })
        }

        // 5. Apply correction atomically
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
                    adminId: adminUser.id,
                    operationId: operationToCorrect,
                    amount: correctionAmount,
                    balanceAfter: updatedUser.balance,
                    type: transactionType,
                    notes: correctionNotes
                }
            })

            // Mark operation as corrected if applicable
            if (operationToCorrect) {
                await tx.operation.update({
                    where: { id: operationToCorrect },
                    data: { corrected: true, correctedAt: new Date() }
                })
            }

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
