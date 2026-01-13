import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { Prisma, OperationType, OperationStatus } from '@prisma/client'

export async function GET(request: Request) {
    try {
        // Check authentication
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        // Parse query params
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')
        const type = searchParams.get('type') as OperationType | null
        const status = searchParams.get('status') as OperationStatus | null
        const from = searchParams.get('from')
        const to = searchParams.get('to')

        // Build where clause
        const where: Prisma.OperationWhereInput = {
            userId: session.user.id,
        }

        if (type) {
            where.type = type
        }

        if (status) {
            where.status = status
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
}
