import test from 'node:test'
import assert from 'node:assert/strict'
import type { ReLoginRuntime } from '../src/http-queue-processor'
import type { AccountExecutionLeaseHandle } from '../src/pool/account-locking'

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:9/test'
process.env.REDIS_URL ||= 'redis://127.0.0.1:9'

type ProcessorModule = typeof import('../src/http-queue-processor')
type PerformReLogin = ProcessorModule['performReLogin']

let performReLoginPromise: Promise<PerformReLogin> | null = null

function loadPerformReLogin(): Promise<PerformReLogin> {
    if (performReLoginPromise) return performReLoginPromise

    performReLoginPromise = import('../src/http-queue-processor').then((imported) => {
        const exports = imported as unknown as Record<string, unknown>
        const defaultExports = exports.default as Record<string, unknown> | undefined
        const performReLogin = exports.performReLogin ?? defaultExports?.performReLogin
        assert.equal(typeof performReLogin, 'function')
        return performReLogin as PerformReLogin
    })
    return performReLoginPromise
}

const lease: AccountExecutionLeaseHandle = {
    accountId: 'account-1',
    operationId: 'operation-1',
    reservationGeneration: 1,
    leaseId: 'lease-1',
    fencingToken: 1,
    workerId: 'worker-1',
    acquiredAt: '2026-08-25T00:00:00.000Z',
}

const scenarios = [
    {
        name: 'CAPTCHA submit',
        stage: 'CAPTCHA' as const,
        expectedError: 'PROVIDER_EXECUTION_LEASE_LOST_DURING_CAPTCHA_SUBMIT',
        expectedSaveCalls: 0,
    },
    {
        name: 'fenced session save',
        stage: 'SAVE' as const,
        expectedError: 'PROVIDER_EXECUTION_LEASE_LOST_DURING_SESSION_SAVE',
        expectedSaveCalls: 1,
    },
]

for (const scenario of scenarios) {
    test(`2026-08-25 regression: lease loss during ${scenario.name} prevents a second provider login`, async () => {
        const performReLogin = await loadPerformReLogin()
        let assertionCalls = 0
        let loginCalls = 0
        let saveCalls = 0

        const client = {
            invalidateSession: () => undefined,
            login: async () => {
                loginCalls += 1
                if (scenario.stage === 'CAPTCHA') {
                    return {
                        success: false,
                        requiresCaptcha: true,
                        captchaImage: 'sanitized-captcha-image',
                    }
                }
                return { success: true, requiresCaptcha: false }
            },
            submitLogin: async () => ({ success: true }),
            exportSession: async () => ({
                cookies: 'sanitized-cookie-state',
                expiresAt: Date.now() + 60_000,
            }),
            getSessionTimeout: () => 900,
        } as unknown as Parameters<PerformReLogin>[0]

        const runtime: ReLoginRuntime = {
            assertExecutionLeaseCurrent: async () => {
                assertionCalls += 1
                if (scenario.stage === 'CAPTCHA' && assertionCalls === 5) {
                    throw new Error(scenario.expectedError)
                }
            },
            getCaptchaApiKey: async () => 'sanitized-api-key',
            solveCaptcha: async () => 'sanitized-solution',
            trackCredentialLoginFailure: async () => undefined,
            trackFreshLoginSuccess: async () => undefined,
            saveSessionToCacheFenced: async () => {
                saveCalls += 1
                return scenario.stage !== 'SAVE'
            },
        }

        const account = {
            id: lease.accountId,
            username: 'dealer-user',
            password: 'sanitized-password',
            totpSecret: null,
        } as unknown as Parameters<PerformReLogin>[1]
        const route = {
            mode: 'server_ip',
            routeKey: 'server-ip',
            accountId: lease.accountId,
        } as Parameters<PerformReLogin>[2]

        await assert.rejects(
            performReLogin(client, account, route, 'lease regression', lease, runtime),
            { message: scenario.expectedError }
        )
        assert.equal(loginCalls, 1)
        assert.equal(saveCalls, scenario.expectedSaveCalls)
    })
}
