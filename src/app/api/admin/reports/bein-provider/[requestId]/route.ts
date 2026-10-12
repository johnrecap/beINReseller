import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { errorResponse } from '@/lib/api-response'
import redis from '@/lib/redis'
import { reportPage } from '../../../../../../../shared/reports/bein-provider'
import { readReportRequest } from '../../../../../../../shared/reports/bein-provider-store'

export async function GET(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
    const auth = await requireRoleAPIWithMobile(request, 'ADMIN')
    if ('error' in auth) return errorResponse(auth.error || 'Unauthorized', auth.status, auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN')
    const { requestId } = await params
    if (!/^[a-f0-9-]{36}$/.test(requestId)) return errorResponse('Report not found', 404, 'REPORT_EXPIRED')
    const page = Number(request.nextUrl.searchParams.get('page') || 1)
    const search = (request.nextUrl.searchParams.get('search') || '').trim()
    if (!Number.isSafeInteger(page) || page < 1 || search.length > 100) return errorResponse('Invalid filter', 400, 'VALIDATION_ERROR')
    try {
        const result = await readReportRequest(redis, requestId)
        if (!result) return errorResponse('Report expired', 404, 'REPORT_EXPIRED')
        return NextResponse.json(reportPage(result, page, search), { headers: { 'Cache-Control': 'private, no-store' } })
    } catch { return errorResponse('Report unavailable', 503, 'REPORT_FAILED') }
}
