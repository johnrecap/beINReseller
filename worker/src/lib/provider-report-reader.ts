import { randomUUID } from 'node:crypto'
import type Redis from 'ioredis'
import type { BeinAccount, Proxy } from '@prisma/client'
import { prisma } from './prisma'
import { decryptAccountPassword } from './crypto'
import { findActiveProviderAccountReservationForAccount } from './provider-account-reservation'
import { lockAccount, unlockAccount, extendLock, getAccountLockStatus, isAccountExecutionLeaseActive } from '../pool/account-locking'
import type { HttpClientService } from '../http/HttpClientService'
import { readReportRequest, claimReportRequest, finishReportRequest } from '../../../shared/reports/bein-provider-store'
import { PROVIDER_REPORT_READ_MS, type ProviderReportRequest, type ProviderReportError } from '../../../shared/reports/bein-provider'

type Account = BeinAccount & { proxy: Proxy | null }
type ReportClient = Pick<HttpClientService, 'restrictToReportReads' | 'isSessionActive' | 'invalidateSession' | 'login' | 'scanSoldPackagesReport'>
export interface ReportReaderRuntime {
    account(id: string): Promise<Account | null>
    reserved(id: string): Promise<boolean>
    acquire(id: string, owner: string): Promise<boolean>
    assertOwner(id: string, owner: string): Promise<void>
    renew(id: string, owner: string): Promise<boolean>
    release(id: string, owner: string): Promise<unknown>
    client(account: Account): Promise<ReportClient>
}
export class ReportReadError extends Error {
    constructor(public readonly code: ProviderReportError) { super(code) }
}
export async function readProviderReport(
    request: ProviderReportRequest, runtime: ReportReaderRuntime, signal: AbortSignal
) {
    const owner = `report:${request.id}:${randomUUID()}`
    const account = await runtime.account(request.accountId)
    if (!account?.isActive || !account.automationExclusive) throw new ReportReadError('ACCOUNT_UNAVAILABLE')
    if (await runtime.reserved(account.id) || !await runtime.acquire(account.id, owner)) throw new ReportReadError('ACCOUNT_BUSY')
    const cancellation = new AbortController()
    const abort = () => cancellation.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    let heartbeat: Promise<void> | null = null
    const guard = async () => {
        cancellation.signal.throwIfAborted()
        await runtime.assertOwner(account.id, owner)
        if (await runtime.reserved(account.id)) throw new ReportReadError('ACCOUNT_BUSY')
        cancellation.signal.throwIfAborted()
    }
    const timer = setInterval(() => {
        if (heartbeat) return
        heartbeat = (async () => {
            if (!await runtime.renew(account.id, owner)) throw new ReportReadError('ACCOUNT_BUSY')
            await guard()
        })().catch(() => cancellation.abort(new ReportReadError('ACCOUNT_BUSY'))).finally(() => { heartbeat = null })
    }, 10_000)
    try {
        await guard()
        const client = await runtime.client(account)
        client.restrictToReportReads(cancellation.signal, guard)
        let loginAttempted = false
        const login = async () => {
            if (loginAttempted) throw new ReportReadError('LOGIN_FAILED')
            loginAttempted = true
            await guard()
            client.invalidateSession()
            const result = await client.login(account.username, account.password, account.totpSecret ?? undefined)
            cancellation.signal.throwIfAborted()
            if (result.requiresCaptcha) throw new ReportReadError('CAPTCHA_REQUIRED')
            if (!result.success) throw new ReportReadError('LOGIN_FAILED')
        }
        if (!client.isSessionActive()) await login()
        const scan = () => client.scanSoldPackagesReport({
            dateRange: { from: request.from, to: request.to }, scanAttempts: 2, pageCap: 100, signal: cancellation.signal,
        })
        let result = await scan()
        if (result.reasonCode === 'LOGIN_REQUIRED' && !loginAttempted) { await login(); result = await scan() }
        await guard()
        if (result.reasonCode === 'LOGIN_REQUIRED') throw new ReportReadError('LOGIN_FAILED')
        if (result.outcome !== 'COMPLETE') throw new ReportReadError('REPORT_INCOMPLETE')
        // Explicit allowlist: no subscriber/country, raw HTML, hashes or financial evidence.
        return result.rows.map(row => ({
            invoiceNo: row.invoiceNo, cardNumber: row.cardNumber, itemType: row.itemType,
            packageName: row.packageName, contractStartDate: row.contractStartDate,
            contractExpiryDate: row.contractExpiryDate, providerAmount: row.providerAmount, currency: row.currency,
        }))
    } finally {
        clearInterval(timer)
        signal.removeEventListener('abort', abort)
        cancellation.abort()
        if (heartbeat) await heartbeat
        await runtime.release(account.id, owner)
    }
}

export function providerReportRuntime(redis: Redis, workerId: string, createClient: (account: Account) => Promise<ReportClient>): ReportReaderRuntime {
    return {
        account: async id => {
            const account = await prisma.beinAccount.findUnique({ where: { id }, include: { proxy: true } })
            return account ? decryptAccountPassword(account) : null
        },
        reserved: async id => !!await findActiveProviderAccountReservationForAccount(prisma, id) || await isAccountExecutionLeaseActive(redis, id),
        acquire: (id, owner) => lockAccount(redis, id, workerId, 120, owner),
        renew: (id, owner) => extendLock(redis, id, workerId, 120, owner),
        release: (id, owner) => unlockAccount(redis, id, workerId, owner),
        assertOwner: async (id, owner) => {
            const lock = await getAccountLockStatus(redis, id)
            if (!lock.locked || lock.ownerWorkerId !== workerId || lock.ownerOperationId !== owner) throw new ReportReadError('ACCOUNT_BUSY')
        },
        client: createClient,
    }
}
export async function handleProviderReportJob(requestId: string, redis: Redis, runtime: ReportReaderRuntime): Promise<void> {
    const request = await readReportRequest(redis, requestId)
    if (!request || request.state !== 'QUEUED') return
    if (Date.now() >= request.deadline) {
        await finishReportRequest(redis, { ...request, state: 'FAILED', errorCode: 'REPORT_TIMEOUT' }); return
    }
    const token = randomUUID()
    if (!await claimReportRequest(redis, request, token)) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new ReportReadError('REPORT_TIMEOUT')),
        Math.min(PROVIDER_REPORT_READ_MS, request.deadline - Date.now()))
    try {
        const rows = await readProviderReport(request, runtime, controller.signal)
        controller.signal.throwIfAborted()
        await finishReportRequest(redis, { ...request, state: 'COMPLETED', fetchedAt: new Date().toISOString(), rows }, token)
    } catch (error) {
        const reason = controller.signal.aborted ? controller.signal.reason : error
        await finishReportRequest(redis, { ...request, state: 'FAILED',
            errorCode: reason instanceof ReportReadError ? reason.code : 'REPORT_FAILED' }, token)
    } finally { clearTimeout(timer); controller.abort() }
}
