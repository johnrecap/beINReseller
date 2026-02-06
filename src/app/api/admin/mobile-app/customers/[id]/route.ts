/**
 * GET /api/admin/mobile-app/customers/[id]
 * 
 * Get single customer with transactions, operations, and orders
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json(
                { success: false, error: authResult.error },
                { status: authResult.status }
            )
        }

        const { id } = await params

        // Fetch customer with related data
        const customer = await prisma.customer.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                nameAr: true,
                phone: true,
                country: true,
                preferredLang: true,
                isVerified: true,
                isActive: true,
                walletBalance: true,
                storeCredit: true,
                loginCount: true,
                createdAt: true,
                lastLoginAt: true
            }
        })

        if (!customer) {
            return NextResponse.json(
                { success: false, error: 'Customer not found' },
                { status: 404 }
            )
        }

        // Fetch related data
        const [transactions, operations, orders] = await Promise.all([
            prisma.walletTransaction.findMany({
                where: { customerId: id },
                orderBy: { createdAt: 'desc' },
                take: 50,
                select: {
                    id: true,
                    type: true,
                    amount: true,
                    balanceBefore: true,
                    balanceAfter: true,
                    description: true,
                    createdAt: true
                }
            }),
            prisma.operation.findMany({
                where: { customerId: id },
                orderBy: { createdAt: 'desc' },
                take: 50,
                select: {
                    id: true,
                    type: true,
                    cardNumber: true,
                    status: true,
                    amount: true,
                    createdAt: true
                }
            }),
            prisma.order.findMany({
                where: { customerId: id },
                orderBy: { createdAt: 'desc' },
                take: 50,
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    total: true,
                    currency: true,
                    createdAt: true
                }
            })
        ])

        return NextResponse.json({
            success: true,
            customer,
            transactions,
            operations,
            orders
        })

    } catch (error) {
        console.error('Admin get customer error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}
