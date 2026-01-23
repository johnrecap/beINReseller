import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { Prisma, OperationType, OperationStatus } from '@prisma/client'

export const GET = withAuth(async (request: Request, session) => {
    try {
        // Check authentication REMOVED (handled by wrapper)
        // const session = await auth() -> session is now passed as arg

        // Parse query params
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')
        const type = searchParams.get('type') as OperationType | null
        const status = searchParams.get('status') // Can be OperationStatus or 'active'
        const from = searchParams.get('from')
        const to = searchParams.get('to')

        // Build where clause
        const where: Prisma.OperationWhereInput = {
            userId: session.user.id,
        }

        if (type) {
            where.type = type
        }

        // Handle 'active' as a special case - filter by multiple active statuses
        if (status === 'active') {
            where.status = {
                in: ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM', 'COMPLETING']
            }
        } else if (status) {
            where.status = status as OperationStatus
        }

        if (from || to) {
            where.createdAt = {}
            if (from) {
                where.createdAt.gte = new Date(from)
            }
            if (to) {
                where.createdAt.lte = new Date(to)
            }
        }

        // Get operations with pagination
        const [operations, total] = await Promise.all([
            prisma.operation.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    type: true,
                    cardNumber: true,
                    amount: true,
                    status: true,
                    responseMessage: true,
                    createdAt: true,
                    updatedAt: true,
                    // New fields for final confirmation
                    selectedPackage: true,
                    stbNumber: true,
                    finalConfirmExpiry: true,
                },
            }),
            prisma.operation.count({ where }),
        ])

        // Mask card numbers for security (show only last 4 digits)
        const maskedOperations = operations.map(op => ({
            ...op,
            cardNumber: `****${op.cardNumber.slice(-4)}`
        }))

        return NextResponse.json({
            operations: maskedOperations,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        })

    } catch (error) {
        console.error('List operations error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
})
