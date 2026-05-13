import { NextResponse } from 'next/server'
import { dispatchPendingOperationJobs } from '@/lib/operation-dispatch'

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        if (!cronSecret) {
            console.error('[Dispatch Cron] CRON_SECRET is not configured - refusing to process')
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            )
        }

        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const result = await dispatchPendingOperationJobs({ limit: 50 })
        return NextResponse.json({ success: true, ...result })
    } catch (error) {
        console.error('[Dispatch Cron] Failed to dispatch pending operation jobs:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
