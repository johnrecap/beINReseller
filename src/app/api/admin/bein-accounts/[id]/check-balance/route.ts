import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { operationsQueue } from '@/lib/queue'
import redis from '@/lib/redis'
import { balanceRefreshView } from '../../../../../../../shared/bein/balance-refresh'
import { activeBalanceRefresh, admitBalanceRefresh, readBalanceRefresh } from '../../../../../../../shared/bein/balance-refresh-store'

interface RouteParams { params: Promise<{ id: string }> }

function failure(code: string, status: number, requestId?: string) {
    return NextResponse.json({ success: false, error: code, code, ...(requestId ? { requestId } : {}) }, { status })
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const auth = await requireRoleAPIWithMobile(request, 'ADMIN')
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await params
    const query = request.nextUrl.searchParams
    const requestId = query.get('requestId')
    if ((requestId && requestId.length > 128) || (!requestId && query.get('active') !== '1')) return failure('VALIDATION_ERROR', 400)
    try {
        const result = requestId ? await readBalanceRefresh(redis, requestId) : await activeBalanceRefresh(redis, id)
        if (result && result.accountId !== id) return failure('REQUEST_NOT_FOUND', 404)
        if (!result && requestId) return failure('REQUEST_NOT_FOUND', 404)
        return NextResponse.json({ success: true, data: result ? balanceRefreshView(result) : null })
    } catch { return failure('STATUS_UNAVAILABLE', 503) }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const auth = await requireRoleAPIWithMobile(request, 'ADMIN')
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    let asynchronous = false
    try {
        const body = await request.text()
        if (body.trim()) {
            const input = JSON.parse(body)
            if (!input || Array.isArray(input) || input.mode !== 'async') return failure('VALIDATION_ERROR', 400)
            asynchronous = true
        }
    } catch { return failure('VALIDATION_ERROR', 400) }

    const { id } = await params
    let requestId: string | undefined
    try {
        const account = await prisma.beinAccount.findUnique({ where: { id }, select: { id: true, isActive: true, automationExclusive: true } })
        if (!account) return failure('ACCOUNT_UNAVAILABLE', 404)
        if (!account.isActive || !account.automationExclusive) return failure('ACCOUNT_UNAVAILABLE', 409)
        const admission = await admitBalanceRefresh(redis, id, randomUUID())
        requestId = admission.request.requestId
        if (admission.created) {
            try {
                await operationsQueue.add('check-balance', {
                    type: 'CHECK_ACCOUNT_BALANCE', accountId: id, cardNumber: '0000000000', balanceRequestId: requestId,
                }, { jobId: 'balance-' + requestId, priority: 0, attempts: 1, removeOnComplete: true, removeOnFail: true })
            } catch {
                // A rejected add promise does not prove Redis did not accept the job.
                // Preserve identity and the active claim for status reconciliation.
                return failure('QUEUE_UNAVAILABLE', 503, requestId)
            }
        }
        if (asynchronous) return NextResponse.json({ success: true, data: balanceRefreshView(admission.request) }, { status: 202 })

        // Legacy callers retain response fields, using only this request's result.
        const end = Date.now() + 60_000
        while (Date.now() < end) {
            const result = await readBalanceRefresh(redis, requestId)
            if (!result || result.accountId !== id) return failure('REQUEST_NOT_FOUND', 404, requestId)
            if (result.state === 'COMPLETED') return NextResponse.json({
                success: true, balance: result.balance, updatedAt: result.updatedAt, message: 'BALANCE_UPDATED', requestId,
            })
            if (result.state === 'FAILED') return failure(result.errorCode || 'BALANCE_FAILED', 500, requestId)
            await new Promise(resolve => setTimeout(resolve, Math.min(1000, Math.max(0, end - Date.now()))))
        }
        return failure('BALANCE_TIMEOUT', 504, requestId)
    } catch { return failure('STATUS_UNAVAILABLE', 503, requestId) }
}
