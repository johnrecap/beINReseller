import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'

interface SmokeEvidence {
    schemaVersion: number
    mode: string
    decision: string
    outcomes: Record<string, unknown>
    counts: Record<string, number>
    equality: Record<string, boolean>
    hashes: Record<string, string | null>
    reasonCode: string
}

const requireFromTest = createRequire(import.meta.url)
const tsxCli = requireFromTest.resolve('tsx/cli')
const scriptPath = join(process.cwd(), 'scripts', 'verify-sold-report-contract-correlation.ts')

function runSmoke(args: readonly string[]) {
    return spawnSync(process.execPath, [tsxCli, scriptPath, ...args], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env },
    })
}

function parsedEvidence(stdout: string): SmokeEvidence {
    return JSON.parse(stdout) as SmokeEvidence
}

function assertStrictOutputShape(evidence: SmokeEvidence): void {
    assert.deepEqual(
        Object.keys(evidence).sort(),
        ['counts', 'decision', 'equality', 'hashes', 'mode', 'outcomes', 'reasonCode', 'schemaVersion']
    )
    assert.deepEqual(
        Object.keys(evidence.counts).sort(),
        ['baselinePages', 'baselineRows', 'contracts', 'matchedContracts', 'postPages', 'postRows']
    )
    assert.deepEqual(
        Object.keys(evidence.equality).sort(),
        ['dealerContext', 'explicitLiveAuthorization', 'invoice']
    )
    assert.deepEqual(
        Object.keys(evidence.hashes).sort(),
        ['contractInvoice', 'dealerContext', 'reportInvoice', 'reportRow']
    )
}

function assertNoSensitiveOutput(stdout: string): void {
    assert.doesNotMatch(stdout, /7517687161|053000123|Card_CISCO|Premium 12 Months/i)
    assert.doesNotMatch(
        stdout,
        /subscriber|country|raw.?html|cookie|viewstate|credential|password|totp/i
    )
}

test('fixture smoke proves one sanitized report invoice equals one active contract invoice', () => {
    const execution = runSmoke(['--fixture'])

    assert.equal(execution.status, 0)
    assert.equal(execution.stderr, '')
    const evidence = parsedEvidence(execution.stdout)
    assertStrictOutputShape(evidence)
    assert.equal(evidence.mode, 'FIXTURE')
    assert.equal(evidence.decision, 'PASS')
    assert.equal(evidence.outcomes.baselineReport, 'COMPLETE')
    assert.equal(evidence.outcomes.postReport, 'COMPLETE')
    assert.equal(evidence.outcomes.contractRead, 'COMPLETE')
    assert.equal(evidence.outcomes.correlation, 'MATCHED')
    assert.equal(evidence.equality.invoice, true)
    assert.equal(evidence.equality.dealerContext, true)
    assert.equal(evidence.counts.postRows, 1)
    assert.equal(evidence.counts.contracts, 1)
    assert.equal(evidence.counts.matchedContracts, 1)
    assert.match(evidence.hashes.reportInvoice || '', /^[a-f0-9]{64}$/)
    assert.equal(evidence.hashes.reportInvoice, evidence.hashes.contractInvoice)
    assert.match(evidence.hashes.reportRow || '', /^[a-f0-9]{64}$/)
    assertNoSensitiveOutput(execution.stdout)
})

for (const scenario of [
    {
        name: 'missing mode',
        args: [] as string[],
        mode: 'INVALID',
        reasonCode: 'MODE_REQUIRED',
        authorized: false,
    },
    {
        name: 'live mode without explicit authorization',
        args: ['--live'],
        mode: 'LIVE',
        reasonCode: 'LIVE_AUTHORIZATION_REQUIRED',
        authorized: false,
    },
    {
        name: 'authorized live mode without a safe session adapter',
        args: ['--live', '--authorize-live-read-only'],
        mode: 'LIVE',
        reasonCode: 'AUTHENTICATED_READ_ONLY_SESSION_ADAPTER_UNAVAILABLE',
        authorized: true,
    },
] as const) {
    test(`${scenario.name} fails closed with sanitized evidence`, () => {
        const execution = runSmoke(scenario.args)

        assert.equal(execution.status, 1)
        assert.equal(execution.stderr, '')
        const evidence = parsedEvidence(execution.stdout)
        assertStrictOutputShape(evidence)
        assert.equal(evidence.mode, scenario.mode)
        assert.equal(evidence.decision, 'BLOCKED')
        assert.equal(evidence.reasonCode, scenario.reasonCode)
        assert.equal(evidence.equality.explicitLiveAuthorization, scenario.authorized)
        assert.deepEqual(Object.values(evidence.counts), [0, 0, 0, 0, 0, 0])
        assertNoSensitiveOutput(execution.stdout)
    })
}
