import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import redis from '@/lib/redis'
import { operationsQueue } from '@/lib/queue'
import { errorResponse, successResponse } from '@/lib/api-response'
import { validReportCriteria } from '../../../../../../shared/reports/bein-provider'
import { admitReportRequest, finishReportRequest } from '../../../../../../shared/reports/bein-provider-store'

export async function POST(request: NextRequest) {
    const auth = await requireRoleAPIWithMobile(request, 'ADMIN')
    if ('error' in auth) return errorResponse(auth.error || 'Unauthorized', auth.status, auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN')
    const input: unknown = await request.json().catch(() => null)
    if (!validReportCriteria(input)) return errorResponse('Invalid report criteria', 400, 'VALIDATION_ERROR')
    try {
        const account = await prisma.beinAccount.findUnique({ where: { id: input.accountId }, select: { isActive: true, automationExclusive: true } })
        if (!account) return errorResponse('Account not found', 404, 'ACCOUNT_UNAVAILABLE')
        if (!account.isActive || !account.automationExclusive) return errorResponse('Account unavailable', 409, 'ACCOUNT_UNAVAILABLE')
        const admission = await admitReportRequest(redis, { accountId: input.accountId, from: input.from, to: input.to }, randomUUID())
        if (admission.kind === 'ACCOUNT_BUSY') return errorResponse('Account busy', 409, admission.kind)
        if (admission.kind === 'RATE_LIMITED') return errorResponse('Try again shortly', 429, admission.kind)
        if (admission.kind === 'CREATED') {
            try {
                await operationsQueue.add('read-provider-report', { type: 'READ_PROVIDER_REPORT', requestId: admission.request.id }, {
                    jobId: `provider-report--${admission.request.id}`, priority: 10, attempts: 1,
                    removeOnComplete: true, removeOnFail: true,
                })
            } catch {
                await finishReportRequest(redis, { ...admission.request, state: 'FAILED', errorCode: 'REPORT_FAILED' })
                return errorResponse('Report unavailable', 503, 'REPORT_FAILED')
            }
        }
        return successResponse({ requestId: admission.request.id }, undefined, 202)
    } catch { return errorResponse('Report unavailable', 503, 'REPORT_FAILED') }
}
