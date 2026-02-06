/**
 * GET /api/admin/mobile-app/customers
 * 
 * List mobile app customers with search and filters
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
    try {
        // Auth check
        const session = await getServerSession(authOptions)
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { searchParams } = new URL(request.url)

        // Pagination
        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
        const skip = (page - 1) * limit

        // Filters
        const search = searchParams.get('search')
        const country = searchParams.get('country')

        // Build where clause
        const where: Record<string, unknown> = {}

        if (search) {
            where.OR = [
                { email: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } }
            ]
        }

        if (country && ['SA', 'EG'].includes(country)) {
            where.country = country
        }

        // Fetch customers
        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    country: true,
                    isVerified: true,
                    isActive: true,
                    walletBalance: true,
                    storeCredit: true,
                    loginCount: true,
                    createdAt: true,
                    lastLoginAt: true,
                    _count: {
                        select: {
                            orders: true,
                            operations: true,
                            addresses: true
                        }
                    }
                }
            }),
            prisma.customer.count({ where })
        ])

        const totalPages = Math.ceil(total / limit)

        return NextResponse.json({
            success: true,
            customers,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        })

    } catch (error) {
        console.error('Admin get customers error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}
