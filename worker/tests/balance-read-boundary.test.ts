import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HttpClientService } from '../src/http/HttpClientService'

test('dedicated balance client guards every request and forbids mutation-shaped renewal POSTs', async () => {
    let intercept: (config: any) => Promise<any> = async x => x
    let guards = 0
    const client = Object.assign(Object.create(HttpClientService.prototype), {
        config: { loginUrl: 'https://provider.invalid/login', renewUrl: '/renew' },
        axios: { interceptors: { request: { use: (handler: typeof intercept) => { intercept = handler } } } },
    }) as HttpClientService
    const cancellation = new AbortController()
    client.restrictToBalanceReads(cancellation.signal, async () => { guards++ })
    const allowed = await intercept({ url: '/renew', method: 'post', data: new URLSearchParams({
        __VIEWSTATE: 'synthetic', 'ctl00$ContentPlaceHolder1$txtSmartNo': '0000000000', 'ctl00$ContentPlaceHolder1$btnSubmit': 'Submit',
    }).toString() })
    assert.equal(allowed.signal, cancellation.signal)
    assert.equal(allowed['axios-retry'].retries, 0)
    assert.equal(allowed.timeout, 30_000)
    for (const config of [
        { url: '/pay', method: 'post' }, { url: 'https://other.invalid/login', method: 'get' },
        { url: '/renew', method: 'post', data: '__EVENTTARGET=buy' },
        { url: '/renew', method: 'post', data: 'ctl00%24ContentPlaceHolder1%24btnSubmit=Submit&pay=1' },
    ]) await assert.rejects(intercept(config), /BALANCE_READ_ONLY_BOUNDARY/)
    assert.equal(guards, 5)
    cancellation.abort()
    await assert.rejects(intercept({ url: '/login' }))
    assert.equal(guards, 5)
})
