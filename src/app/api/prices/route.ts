import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAllOperationPrices } from '@/lib/pricing'
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

        const prices = await getAllOperationPrices()
        return NextResponse.json(prices)
    } catch (error) {
        console.error('Error fetching prices:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
