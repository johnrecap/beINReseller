import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { buildOperationListWhere } from '@/lib/operation-list-filters'
import { parseOperationResponseData } from '@/lib/operation-safety'
import { projectOperationProgress } from '../../../../shared/operations/consumer-progress'

export const GET = withAuth(async (request: Request, session) => {
    try {
        // Check authentication REMOVED (handled by wrapper)
        // const session = await auth() -> session is now passed as arg

        // Parse query params
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '10')
        const where = buildOperationListWhere(session.user.id, searchParams)

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
                    responseData: true,
                    providerPaymentState: true,
                    fulfillmentState: true,
                    fulfillmentAuthority: true,
                    completedAt: true,
                    createdAt: true,
                    updatedAt: true,
                    // New fields for final confirmation
                    selectedPackage: true,
                    stbNumber: true,
                    finalConfirmExpiry: true,
                    heartbeatExpiry: true,
                    transactions: { where: { type: 'REFUND' }, select: { type: true } },
                    refundSettlements: { select: { state: true } },
                },
            }),
            prisma.operation.count({ where }),
        ])

        const safeOperations = operations.map(({ responseData, transactions, refundSettlements, ...operation }) => {
            const evidence = parseOperationResponseData(responseData)
            return {
                ...operation,
                ...projectOperationProgress({ ...operation, responseData, transactions, refundSettlements }),
                providerPaymentState: operation.providerPaymentState ?? (
                    typeof evidence.providerPaymentState === 'string' ? evidence.providerPaymentState : null
                ),
                fulfillmentState: operation.fulfillmentState ?? (
                    typeof evidence.fulfillmentState === 'string' ? evidence.fulfillmentState : null
                ),
                fulfillmentAuthority: operation.fulfillmentAuthority ?? 'NONE',
                fulfillmentConfirmedAt:
                    operation.fulfillmentAuthority && operation.fulfillmentAuthority !== 'NONE'
                        ? operation.completedAt?.toISOString() ?? null
                        : null,
            }
        })

        return NextResponse.json({
            operations: safeOperations,
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
}, { currentUser: true })
