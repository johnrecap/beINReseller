/**
 * GET /api/admin/mobile-app/payments
 * 
 * List wallet top-up payments with filters
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { searchParams } = new URL(request.url)

        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
        const skip = (page - 1) * limit

        const status = searchParams.get('status')
        const dateFrom = searchParams.get('dateFrom')
        const dateTo = searchParams.get('dateTo')

        // Build where clause for wallet transactions with CREDIT type
        const where: Record<string, unknown> = {
            type: 'CREDIT',
            stripePaymentIntentId: { not: null }
        }

        if (dateFrom || dateTo) {
            where.createdAt = {}
            if (dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(dateFrom)
            if (dateTo) (where.createdAt as Record<string, Date>).lte = new Date(dateTo + 'T23:59:59')
        }

        // Fetch transactions
        const [transactions, total] = await Promise.all([
            prisma.walletTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            country: true
                        }
                    }
                }
            }),
            prisma.walletTransaction.count({ where })
        ])

        // Transform to payments format
        const payments = transactions.map(tx => ({
            id: tx.id,
            customerId: tx.customerId,
            customerName: tx.customer?.name || 'Unknown',
            customerEmail: tx.customer?.email || '',
            amount: tx.amount,
            currency: tx.customer?.country === 'EG' ? 'EGP' : 'SAR',
            status: 'succeeded' as const, // If it's in wallet transactions, it succeeded
            stripePaymentIntentId: tx.stripePaymentIntentId,
            createdAt: tx.createdAt.toISOString()
        }))

        const totalPages = Math.ceil(total / limit)

        return NextResponse.json({
            success: true,
            payments,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        })

    } catch (error) {
        console.error('Admin get payments error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}
