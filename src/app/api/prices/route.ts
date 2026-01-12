import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAllOperationPrices } from '@/lib/pricing'

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const prices = await getAllOperationPrices()
        return NextResponse.json(prices)
    } catch (error) {
        console.error('Error fetching prices:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
