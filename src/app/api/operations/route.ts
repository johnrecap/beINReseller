import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { Prisma, OperationType, OperationStatus } from '@prisma/client'
import { recoverOperationIfNeeded } from '@/lib/operations/recovery'

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
        let [operations, total] = await Promise.all([
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
                    heartbeatExpiry: true,
                },
            }),
            prisma.operation.count({ where }),
        ])

        if (status === 'active') {
            const now = new Date()
            const staleOperations = operations.filter(operation =>
                (
                    operation.status === 'AWAITING_PACKAGE' ||
                    operation.status === 'AWAITING_FINAL_CONFIRM'
                ) &&
                (
                    (operation.finalConfirmExpiry && operation.finalConfirmExpiry < now) ||
                    (operation.heartbeatExpiry && operation.heartbeatExpiry < now)
                )
            )

            if (staleOperations.length > 0) {
                await Promise.all(
                    staleOperations.map(operation =>
                        recoverOperationIfNeeded(operation.id, 'maintenance').catch(error => {
                            console.error(`Failed to recover stale active operation ${operation.id}:`, error)
                        })
                    )
                )

                const staleIds = new Set(staleOperations.map(operation => operation.id))
                operations = operations.filter(operation => !staleIds.has(operation.id))
                total = Math.max(0, total - staleIds.size)
            }
        }

        return NextResponse.json({
            operations,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        })

    } catch (error) {
        console.error('List operations error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
})
