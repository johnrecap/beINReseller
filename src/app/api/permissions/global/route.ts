import { NextResponse, type NextRequest } from 'next/server'
import { requireAuthAPI } from '@/lib/auth-utils'
import { getPanelUserCreationFreeze } from '@/lib/permissions/guards'

export async function GET(request: NextRequest) {
    const authResult = await requireAuthAPI(request)
    if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const panelUserCreation = await getPanelUserCreationFreeze()

    return NextResponse.json({
        panelUserCreation,
    })
}
