import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) {
        return session.user
    }
    return getMobileUserFromRequest(request)
}

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * GET /api/operations/[id]/installment
 * 
 * Get installment details for an operation (polling endpoint)
 * Returns status and installment info when available
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: operationId } = await params

        // Check authentication
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                userId: true,
                status: true,
                responseData: true,
                amount: true,
                stbNumber: true,
                responseMessage: true,
                finalConfirmExpiry: true,
            }
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership (unless admin)
        if (operation.userId !== authUser.id && authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized access to this operation' },
                { status: 403 }
            )
        }

        // Parse metadata if present
        let installment = null
        let subscriber = null
        let dealerBalance = null

        if (operation.responseData) {
            try {
                const data = typeof operation.responseData === 'string'
                    ? JSON.parse(operation.responseData)
                    : operation.responseData
                installment = data.installment
                subscriber = data.subscriber
                dealerBalance = data.dealerBalance
            } catch {
                // Ignore parse errors
            }
        }

        // Return based on status
        return NextResponse.json({
            status: operation.status,
            installment,
            subscriber,
            dealerBalance,
            amount: operation.amount,
            stbNumber: operation.stbNumber,
            message: operation.responseMessage,
            finalConfirmExpiry: operation.finalConfirmExpiry?.toISOString(),
        })

    } catch (error) {
        console.error('Get installment error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
