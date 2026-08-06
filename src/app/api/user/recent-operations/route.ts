import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuthAPI } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }
        const authUser = authResult.user

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

        return NextResponse.json({ operations })
    } catch (error) {
        console.error('Recent operations API error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
