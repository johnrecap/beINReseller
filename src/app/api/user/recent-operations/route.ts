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

export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthUser(request)

        if (!authUser?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get recent 5 operations
        const operations = await prisma.operation.findMany({
            where: { userId: authUser.id },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                type: true,
                cardNumber: true,
                amount: true,
                status: true,
                responseMessage: true,
                createdAt: true
            }
        })

        // Mask card numbers for security (show only last 4 digits)
        const maskedOperations = operations.map(op => ({
            ...op,
            cardNumber: `****${op.cardNumber.slice(-4)}`
        }))

        return NextResponse.json({ operations: maskedOperations })
    } catch (error) {
        console.error('Recent operations API error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
