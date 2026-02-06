/**
 * GET /api/admin/mobile-app/subscriptions
 * 
 * List customer operations with status/type filters
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json(
                { success: false, error: authResult.error },
                { status: authResult.status }
            )
        }

        const { searchParams } = new URL(request.url)

        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
        const skip = (page - 1) * limit

        const status = searchParams.get('status')
        const type = searchParams.get('type')

        // Only operations from mobile customers
        const where: Record<string, unknown> = {
            customerId: { not: null }
        }

        if (status) where.status = status
        if (type) where.type = type

        const [operations, total] = await Promise.all([
            prisma.operation.findMany({
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
            prisma.operation.count({ where })
        ])

        const formattedOperations = operations.map(op => ({
            id: op.id,
            customerId: op.customerId,
            customerName: op.customer?.name || 'Unknown',
            customerEmail: op.customer?.email || '',
            type: op.type,
            cardNumber: op.cardNumber,
            status: op.status,
            amount: op.amount,
            currency: op.customer?.country === 'EG' ? 'EGP' : 'SAR',
            createdAt: op.createdAt.toISOString(),
            completedAt: op.updatedAt?.toISOString() || null
        }))

        const totalPages = Math.ceil(total / limit)

        return NextResponse.json({
            success: true,
            operations: formattedOperations,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        })

    } catch (error) {
        console.error('Admin get operations error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}
