import { NextRequest, NextResponse } from 'next/server'
import { requireAuthAPI } from '@/lib/auth-utils'
import { getEidRewardStatus } from '@/lib/eid-rewards/claim'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const status = await getEidRewardStatus(authResult.user.id)
        return NextResponse.json(status)
    } catch (error) {
        console.error('Eid reward status error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
