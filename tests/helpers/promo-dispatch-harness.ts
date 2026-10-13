import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { lockFinancialOperation } from '../../shared/operations/financial-lock'
import { buildRenewalFinalConfirmationEvidence } from '../../src/lib/operation-final-confirmation'
import { planRenewalPackageSelection } from '../../src/lib/operations/lock-timeouts'
import * as packageQuote from '../../shared/operations/package-quote'
import * as consumerProgress from '../../shared/operations/consumer-progress'
import * as renewalPrePayment from '../../shared/operations/renewal-pre-payment'
import * as renewalHold from '../../shared/operations/renewal-hold'
import { mergeOperationPhaseEvidence } from '../../src/lib/operation-safety'

// Execute the real module body with explicit dependencies. Unlisted imports
// fail closed, so this harness cannot initialize Redis, auth or provider clients.
export function loadIsolatedModule<T>(path: string, dependencies: Record<string, unknown>, expose: string[] = [], env: Record<string, string> = {}, globals: Record<string, unknown> = {}): T {
    const filename = resolve(process.cwd(), path)
    if (expose.some(name => !/^[A-Za-z_$][\w$]*$/.test(name))) throw new Error('INVALID_TEST_EXPORT')
    const source = readFileSync(filename, 'utf8') + (expose.length ? `\nexport { ${expose.join(', ')} };` : '')
    const compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
        fileName: filename,
    }).outputText
    const sandboxModule = { exports: {} }
    runInNewContext(compiled, {
        module: sandboxModule, exports: sandboxModule.exports, console, Response, URL, URLSearchParams, Date, Error,
        process: { env },
        setTimeout: (callback: () => void) => { callback(); return 0 },
        ...globals,
        require: (name: string) => {
            if (/^(\.\.\/)+shared\/operations\/consumer-progress$/.test(name)) return consumerProgress
            if (/^(\.\.\/)+shared\/operations\/renewal-pre-payment$/.test(name)) return renewalPrePayment
            if (/^(\.\.\/)+shared\/operations\/renewal-hold$/.test(name)) return renewalHold
            if (!Object.hasOwn(dependencies, name)) throw new Error(`UNMOCKED_IMPORT:${name}`)
            return dependencies[name]
        },
    }, { filename, timeout: 5000 })
    return sandboxModule.exports as T
}

const load = loadIsolatedModule

export type RevisionJob = {
    operationId: string; type: string; cardNumber: string; userId: string
    promoCode?: string; actionRevision?: number; amount?: number
}

const noExternalCall = () => { throw new Error('UNEXPECTED_EXTERNAL_CALL') }

export function loadDispatch(db: unknown = {}, addOperationJob: (data: RevisionJob) => unknown = noExternalCall) {
    return load<{
        createOperationDispatch: (tx: Prisma.TransactionClient, data: RevisionJob) => Promise<void>
        dispatchPendingOperationJobs: (options?: { operationIds?: string[]; limit?: number; maxAttempts?: number }) => Promise<{ scanned: number; dispatched: number; failed: number }>
        runDispatchWatchdog: (options?: { limit?: number; maxAttempts?: number }) => Promise<{ retried: number; recovered: number }>
        settlePreparationDispatchExhaustion: (id: string, maxAttempts?: number) => Promise<boolean>
        recordOperationDispatchEvidence: (id: string, input: { phase: 'DISPATCH_PENDING' | 'DISPATCH_FAILED'; message: string }) => Promise<boolean>
    }>(
        'src/lib/operation-dispatch.ts', {
            '@/lib/prisma': { default: db },
            '@/lib/queue': { addOperationJob, addCustomerOperationJob: noExternalCall },
            '@/lib/operation-safety': { mergeOperationPhaseEvidence },
            '@/lib/operations/recovery': { recoverOperationIfNeeded: noExternalCall },
            '../../shared/operations/package-quote': packageQuote,
            '../../shared/operations/financial-lock': { lockFinancialOperation },
        })
}

export function loadQueue() {
    const calls: { queue: string; jobId: string; data: RevisionJob }[] = []
    class Queue {
        constructor(readonly name: string) {}
        async add(_name: string, data: RevisionJob, options: { jobId: string }) {
            calls.push({ queue: this.name, jobId: options.jobId, data })
            return { id: options.jobId }
        }
    }
    const api = load<{ addOperationJob: (data: RevisionJob) => Promise<unknown> }>(
        'src/lib/queue.ts', { bullmq: { Queue }, '../../shared/operations/package-quote': packageQuote })
    return { ...api, calls }
}

export function loadPanelSelection(db: unknown, userId: string, realLock = false) {
    let dispatches = 0
    const api = load<{ POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>(
        'src/app/api/operations/[id]/select-package/route.ts', {
            'next/server': { NextResponse: { json: Response.json.bind(Response) } },
            '@/lib/auth-utils': { getAuthenticatedUser: async () => ({ id: userId }) },
            '@/lib/renewal-readiness': { assertRenewalReadiness: async () => undefined, renewalReadinessErrorPayload: () => null },
            '@/lib/prisma': { default: db },
            '../../../../../../shared/operations/package-quote': packageQuote,
            '../../../../../../shared/operations/financial-lock': { lockFinancialOperation: realLock ? lockFinancialOperation : async () => true },
            zod: { z },
            '@/lib/mobile-auth': { getMobileUserFromRequest: noExternalCall },
            '@/lib/rate-limiter': {
                withRateLimit: async () => ({ allowed: true, result: {} }),
                RATE_LIMITS: { financial: {} }, rateLimitHeaders: () => ({}),
            },
            '@/lib/operations/lock-timeouts': { planRenewalPackageSelection },
            '@/lib/operations/account-lock-release': { releaseAccountLockSafely: noExternalCall },
            '@/lib/redis': { default: {} },
            '@/lib/operation-dispatch': {
                createOperationDispatch: async () => { dispatches++ },
                dispatchPendingOperationJobs: async () => ({ failed: 0 }),
            },
            '@/lib/operations/renewal-creation-guard': {
                ensureGuardedRenewalOperationReservation: async () => undefined,
                isRenewalCreationBlockedError: () => false,
                renewalCreationBlockedPayload: noExternalCall,
            },
        })
    return { ...api, dispatched: () => dispatches }
}

export function loadPanelConfirmation(db: unknown, userId: string, realLock = false) {
    const dispatch = loadDispatch()
    return load<{ POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>(
        'src/app/api/operations/[id]/confirm-purchase/route.ts', {
            'next/server': { NextResponse: { json: Response.json.bind(Response) } },
            '@/lib/auth-utils': { getAuthenticatedUser: async () => ({ id: userId }) }, '@/lib/prisma': { default: db },
            '@/lib/renewal-readiness': { assertRenewalReadiness: async () => undefined, renewalReadinessErrorPayload: () => null },
            '@/lib/mobile-auth': { getMobileUserFromRequest: noExternalCall },
            '@/lib/rate-limiter': { withRateLimit: async () => ({ allowed: true, result: {} }),
                RATE_LIMITS: { financial: {} }, rateLimitHeaders: () => ({}) },
            '@prisma/client': { Prisma },
            '@/lib/operation-final-confirmation': { buildRenewalFinalConfirmationEvidence },
            '@/lib/points/operation-spend-award-runs': { finalizeOperationSpendAwardRun: noExternalCall },
            '@/lib/operation-dispatch': { createOperationDispatch: dispatch.createOperationDispatch,
                dispatchPendingOperationJobs: async () => ({ failed: 0 }), recordOperationDispatchEvidence: noExternalCall },
            '@/lib/operations/renewal-creation-guard': { ensureGuardedRenewalOperationReservation: async () => undefined,
                isRenewalCreationBlockedError: () => false, renewalCreationBlockedPayload: noExternalCall },
            '../../../../../../shared/operations/package-quote': packageQuote,
            '../../../../../../shared/operations/financial-lock': { lockFinancialOperation: realLock ? lockFinancialOperation : async () => true },
        })
}

export function loadPanelPackages(operation: unknown, userId: string) {
    return load<{ GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>(
        'src/app/api/operations/[id]/packages/route.ts', {
            'next/server': { NextResponse: { json: Response.json.bind(Response) } },
            '@/lib/auth-utils': { getAuthenticatedUser: async () => ({ id: userId }) },
            '@/lib/prisma': { default: { operation: { findUnique: async () => operation } } },
            '@/lib/mobile-auth': { getMobileUserFromRequest: noExternalCall },
            '@/lib/operations/recovery': { recoverOperationIfNeeded: noExternalCall },
            '@/lib/operation-safety': { parseOperationResponseData: packageQuote.quoteData },
            '../../../../../../shared/operations/package-quote': packageQuote,
        })
}

export function loadPanelPromo(db: unknown, userId: string) {
    const dispatch = loadDispatch()
    return load<{ POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>(
        'src/app/api/operations/[id]/apply-promo/route.ts', {
            'next/server': { NextResponse: { json: Response.json.bind(Response) } },
            '@/lib/auth-utils': { getAuthenticatedUser: async () => ({ id: userId }) },
            '@/lib/prisma': { default: db },
            '@/lib/mobile-auth': { getMobileUserFromRequest: noExternalCall },
            '@/lib/operation-dispatch': { createOperationDispatch: dispatch.createOperationDispatch,
                dispatchPendingOperationJobs: async () => ({ failed: 0 }) },
            '@/lib/operations/renewal-creation-guard': { ensureGuardedRenewalOperationReservation: async () => undefined,
                isRenewalCreationBlockedError: () => false, renewalCreationBlockedPayload: noExternalCall },
            zod: { z }, '@prisma/client': { Prisma: { JsonNull: null } },
            '../../../../../../shared/operations/package-quote': packageQuote,
            '../../../../../../shared/operations/financial-lock': { lockFinancialOperation: async () => true },
        })
}
