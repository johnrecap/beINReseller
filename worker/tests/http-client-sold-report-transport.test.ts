import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import {
    configureProviderRetryPolicy,
    createAuthenticatedSoldReportTransport,
    resolveSoldPackagesReportUrl,
} from '../src/http/HttpClientService'
import { scanSoldPackagesReport } from '../src/http/sold-packages-report'

const fixtureDirectory = join(
    process.cwd(),
    'worker',
    'tests',
    'fixtures',
    'sold-packages-report'
)

function fixture(name: string): string {
    return readFileSync(join(fixtureDirectory, name), 'utf8')
}

function networkFailure(config: InternalAxiosRequestConfig): AxiosError {
    return new AxiosError('socket reset', 'ECONNRESET', config)
}

function response(config: InternalAxiosRequestConfig, data: string): AxiosResponse<string> {
    return {
        config,
        data,
        headers: {},
        status: 200,
        statusText: 'OK',
    }
}

test('Sold Report URL resolution accepts only the provider login origin', () => {
    const loginUrl = 'https://sbs.beinsports.net/Dealers/NLogin.aspx'

    assert.equal(
        resolveSoldPackagesReportUrl(loginUrl, '/Dealers/Reports/frmSoldPackagesReport.aspx'),
        'https://sbs.beinsports.net/Dealers/Reports/frmSoldPackagesReport.aspx'
    )
    assert.equal(
        resolveSoldPackagesReportUrl(
            loginUrl,
            'https://sbs.beinsports.net/Dealers/Reports/frmSoldPackagesReport.aspx'
        ),
        'https://sbs.beinsports.net/Dealers/Reports/frmSoldPackagesReport.aspx'
    )
    assert.throws(
        () => resolveSoldPackagesReportUrl(loginUrl, 'https://example.com/report'),
        /provider login origin/
    )
    assert.throws(
        () => resolveSoldPackagesReportUrl(loginUrl, '//example.com/report'),
        /provider login origin/
    )
    assert.throws(
        () => resolveSoldPackagesReportUrl(loginUrl, 'https://user:password@sbs.beinsports.net/report'),
        /provider login origin/
    )
})

test('authenticated Sold Report transport restarts at fresh GET and preserves ordered controls', async () => {
    const requests: InternalAxiosRequestConfig[] = []
    const postBodies: string[] = []
    let getAttempts = 0
    const client = axios.create({
        adapter: async (config) => {
            requests.push(config)
            if (config.method === 'get') {
                getAttempts += 1
                if (getAttempts === 1) throw networkFailure(config)
                return response(
                    config,
                    fixture('initial-controls.html').replace(
                        'view-state-part-0',
                        `view-state-get-${getAttempts}`
                    )
                )
            }
            postBodies.push(String(config.data))
            return response(config, fixture('report-empty.html'))
        },
    })
    configureProviderRetryPolicy(client)

    const scan = await scanSoldPackagesReport(createAuthenticatedSoldReportTransport({
        axios: client,
        loginUrl: 'https://sbs.beinsports.net/Dealers/NLogin.aspx',
        soldPackagesReportUrl: '/Dealers/Reports/frmSoldPackagesReport.aspx',
    }))

    assert.equal(scan.outcome, 'COMPLETE')
    assert.equal(scan.scanAttemptCount, 2)
    assert.equal(getAttempts, 3)
    assert.deepEqual(requests.map((request) => request.method), [
        'get',
        'get',
        'post',
        'get',
        'post',
    ])
    assert.ok(requests.every((request) => request.url === (
        'https://sbs.beinsports.net/Dealers/Reports/frmSoldPackagesReport.aspx'
    )))
    assert.ok(requests.every((request) => request['axios-retry']?.retries === 0))

    const submitted = postBodies.map((body) => new URLSearchParams(body))
    assert.equal(submitted.length, 2)
    for (const form of submitted) {
        assert.deepEqual(form.getAll('duplicateToken'), ['first', 'second'])
        assert.equal(form.get('ctl00$ContentPlaceHolder1$ddlDealer'), 'DEALER-001')
        assert.equal(form.get('ctl00$ContentPlaceHolder1$btnApply'), 'Apply')
    }
    assert.equal(submitted[0].get('__VIEWSTATE'), 'view-state-get-2')
    assert.equal(submitted[1].get('__VIEWSTATE'), 'view-state-get-3')

    const names = [...submitted[0].keys()]
    assert.ok(names.indexOf('__VIEWSTATE') < names.indexOf('__VIEWSTATE1'))
    assert.ok(names.indexOf('__VIEWSTATE1') < names.indexOf('duplicateToken'))
})
