import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
            select: {
                id: true,
                type: true,
                cardNumber: true,
                amount: true,
                status: true,
                responseMessage: true,
                responseData: true,  // Required for signal refresh card status
                stbNumber: true,
                createdAt: true,
                updatedAt: true,
                userId: true,
            },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership (user can only see their own operations)
        if (operation.userId !== authUser.id && authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            )
        }

        // Remove userId from response
        const { userId: _userId, ...operationData } = operation

        return NextResponse.json(operationData)

    } catch (error) {
        console.error('Get operation error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
