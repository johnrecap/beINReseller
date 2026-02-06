/**
 * POST /api/admin/mobile-app/customers/[id]/balance
 * 
 * Adjust customer wallet balance (credit or debit)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params
        const body = await request.json()
        const { type, amount, description } = body as {
            type: 'credit' | 'debit'
            amount: number
            description?: string
        }

        if (!type || !['credit', 'debit'].includes(type)) {
            return NextResponse.json(
                { success: false, error: 'Invalid type' },
                { status: 400 }
            )
        }

        if (!amount || amount <= 0) {
            return NextResponse.json(
                { success: false, error: 'Invalid amount' },
                { status: 400 }
            )
        }

        // Get customer
        const customer = await prisma.customer.findUnique({
            where: { id },
            select: { walletBalance: true }
        })

        if (!customer) {
            return NextResponse.json(
                { success: false, error: 'Customer not found' },
                { status: 404 }
            )
        }

        // For debit, check sufficient balance
        if (type === 'debit' && customer.walletBalance < amount) {
            return NextResponse.json(
                { success: false, error: 'Insufficient balance' },
                { status: 400 }
            )
        }

        // Update balance and create transaction
        const balanceBefore = customer.walletBalance
        const balanceAfter = type === 'credit'
            ? balanceBefore + amount
            : balanceBefore - amount

        await prisma.$transaction([
            prisma.customer.update({
                where: { id },
                data: {
                    walletBalance: type === 'credit'
                        ? { increment: amount }
                        : { decrement: amount }
                }
            }),
            prisma.walletTransaction.create({
                data: {
                    customerId: id,
                    type: type === 'credit' ? 'CREDIT' : 'DEBIT',
                    amount,
                    balanceBefore,
                    balanceAfter,
                    description: description || `تعديل إداري - ${type === 'credit' ? 'إضافة' : 'خصم'}`,
                    referenceType: 'ADMIN_ADJUSTMENT'
                }
            })
        ])

        return NextResponse.json({
            success: true,
            message: `تم ${type === 'credit' ? 'إضافة' : 'خصم'} ${amount} بنجاح`,
            newBalance: balanceAfter
        })

    } catch (error) {
        console.error('Admin adjust balance error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}
