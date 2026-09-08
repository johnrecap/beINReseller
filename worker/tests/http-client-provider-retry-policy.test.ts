import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { configureProviderRetryPolicy } from '../src/http/HttpClientService'

function networkFailure(config: InternalAxiosRequestConfig): AxiosError {
    return new AxiosError('socket reset', 'ECONNRESET', config)
}

function serverFailure(config: InternalAxiosRequestConfig, status: number): AxiosError {
    const response: AxiosResponse = {
        config,
        data: 'provider failure',
        headers: {},
        status,
        statusText: `HTTP ${status}`,
    }
    return new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_RESPONSE, config, undefined, response)
}

for (const endpoint of ['/final-ok', '/pay', '/signal', '/installment']) {
    test(`does not replay provider mutation ${endpoint} after a network failure`, async () => {
        let attempts = 0
        const client = axios.create({
            adapter: async (config) => {
                attempts += 1
                throw networkFailure(config)
            },
        })
        configureProviderRetryPolicy(client)

        await assert.rejects(client.post(endpoint, 'payload'))
        assert.equal(attempts, 1)
    })
}

for (const status of [500, 502, 503]) {
    test(`does not replay provider mutation after HTTP ${status}`, async () => {
        let attempts = 0
        const client = axios.create({
            adapter: async (config) => {
                attempts += 1
                throw serverFailure(config, status)
            },
        })
        configureProviderRetryPolicy(client)

        await assert.rejects(client.post('/pay', 'payload'))
        assert.equal(attempts, 1)
    })
}

test('retries a safe GET once through the configured transport policy', async () => {
    let attempts = 0
    const client = axios.create({
        adapter: async (config) => {
            attempts += 1
            if (attempts === 1) throw networkFailure(config)
            return {
                config,
                data: 'ok',
                headers: {},
                status: 200,
                statusText: 'OK',
            }
        },
    })
    configureProviderRetryPolicy(client)

    const response = await client.get('/safe-read')
    assert.equal(response.data, 'ok')
    assert.equal(attempts, 2)
})

test('persists the final-provider-mutation callback before the first OK POST', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http', 'HttpClientService.ts'), 'utf8')
    const confirmStart = source.indexOf('async confirmPurchase(')
    const confirmEnd = source.indexOf('async ', confirmStart + 20)
    const confirmSource = source.slice(confirmStart, confirmEnd > confirmStart ? confirmEnd : undefined)
    const markerIndex = confirmSource.indexOf("await onFinalProviderMutationStarted('FINAL_OK')")
    const okPostIndex = confirmSource.indexOf('this.axios.post(', markerIndex)

    assert.ok(markerIndex >= 0, 'final provider mutation callback must exist')
    assert.ok(okPostIndex > markerIndex, 'marker callback must run before the first final OK POST')
    assert.doesNotMatch(confirmSource.slice(okPostIndex), /onFinalPaySubmitted/)
})

test('2026-08-24 regression: every stateful renewal POST is fenced by the current execution lease', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http', 'HttpClientService.ts'), 'utf8')
    const queueSource = readFileSync(join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'), 'utf8')
    const completeStart = source.indexOf('async completePurchase(')
    const completeEnd = source.indexOf('async getCurrentBalance(', completeStart)
    const confirmStart = source.indexOf('async confirmPurchase(')
    const confirmEnd = source.indexOf('async ', confirmStart + 30)
    const completeSource = source.slice(completeStart, completeEnd)
    const confirmSource = source.slice(confirmStart, confirmEnd > confirmStart ? confirmEnd : undefined)

    assert.match(completeSource, /assertExecutionCurrent\?:\s*\(\)\s*=>\s*Promise<void>/)
    assert.ok(
        (completeSource.match(/await assertExecutionCurrent\?\.\(\)/g) || []).length >= 6,
        'Add, Sell, and STB posts each need a before/after fence'
    )
    assert.match(confirmSource, /assertExecutionCurrent\?:\s*\(\)\s*=>\s*Promise<void>/)
    assert.ok(
        (confirmSource.match(/await assertExecutionCurrent\?\.\(\)/g) || []).length >= 4,
        'OK and Pay posts each need a before/after fence'
    )
    assert.match(
        queueSource,
        /client\.completePurchase\([\s\S]*leaseHeartbeat\.assertCurrent/
    )
    assert.match(
        queueSource,
        /client\.confirmPurchase\([\s\S]*claimMutationStart,[\s\S]*leaseHeartbeat\.assertCurrent/
    )
})
