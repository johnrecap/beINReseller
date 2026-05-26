import { NextResponse, type NextRequest } from 'next/server'
import { PERMISSION_CATALOG, PERMISSION_KEYS } from '@/lib/permissions/catalog'
import { requirePermissionAPIWithMobile } from '@/lib/permissions/guards'

export async function GET(request: NextRequest) {
    const authResult = await requirePermissionAPIWithMobile(request, PERMISSION_KEYS.PERMISSIONS_MANAGE)
    if ('response' in authResult) {
        return authResult.response
    }

    return NextResponse.json({
        permissions: PERMISSION_CATALOG.map(({ key, category, label, description, riskLevel }) => ({
            key,
            category,
            label,
            description,
            riskLevel,
        })),
    })
}
