import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Contract } from '../worker/src/http/types'
import {
    parseSoldPackagesReportPage,
    validateSoldReportScan,
    type SoldReportScanOutcome,
    type SoldReportScanResult,
} from '../worker/src/http/sold-packages-report'
import {
    correlateRenewalFulfillment,
    type FulfillmentCorrelationOutcome,
} from '../worker/src/lib/renewal-fulfillment-correlation'

type SmokeMode = 'FIXTURE' | 'LIVE' | 'INVALID'
type SmokeDecision = 'PASS' | 'FAIL' | 'BLOCKED'
type ReadOutcome = SoldReportScanOutcome | 'NOT_RUN'
type CorrelationOutcome = FulfillmentCorrelationOutcome | 'NOT_RUN'

interface CorrelationSmokeEvidence {
    schemaVersion: 1
    mode: SmokeMode
    decision: SmokeDecision
    outcomes: {
        baselineReport: ReadOutcome
        postReport: ReadOutcome
        contractRead: ReadOutcome
        correlation: CorrelationOutcome
    }
    counts: {
        baselinePages: number
        baselineRows: number
        postPages: number
        postRows: number
        contracts: number
        matchedContracts: number
    }
    equality: {
        dealerContext: boolean
        invoice: boolean
        explicitLiveAuthorization: boolean
    }
    hashes: {
        dealerContext: string | null
        reportInvoice: string | null
        contractInvoice: string | null
        reportRow: string | null
    }
    reasonCode: string
}

interface SmokeRequest {
    mode: SmokeMode
    explicitLiveAuthorization: boolean
    reasonCode?: string
}

const fixtureDirectory = join(
    process.cwd(),
    'worker',
    'tests',
    'fixtures',
    'sold-packages-report'
)

function safeHash(domain: string, rawValue: string | null): string | null {
    if (!rawValue) return null
    return createHash('sha256').update(`${domain}\u0000${rawValue}`).digest('hex')
}

function emptyEvidence(
    mode: SmokeMode,
    decision: SmokeDecision,
    reasonCode: string,
    explicitLiveAuthorization = false
): CorrelationSmokeEvidence {
    return {
        schemaVersion: 1,
        mode,
        decision,
        outcomes: {
            baselineReport: 'NOT_RUN',
            postReport: 'NOT_RUN',
            contractRead: 'NOT_RUN',
            correlation: 'NOT_RUN',
        },
        counts: {
            baselinePages: 0,
            baselineRows: 0,
            postPages: 0,
            postRows: 0,
            contracts: 0,
            matchedContracts: 0,
        },
        equality: {
            dealerContext: false,
            invoice: false,
            explicitLiveAuthorization,
        },
        hashes: {
            dealerContext: null,
            reportInvoice: null,
            contractInvoice: null,
            reportRow: null,
        },
        reasonCode,
    }
}

function stableFixtureScan(fixtureName: string): SoldReportScanResult {
    const html = readFileSync(join(fixtureDirectory, fixtureName), 'utf8')
    const page = parseSoldPackagesReportPage(html)
    return validateSoldReportScan({
        visitedPages: [page],
        firstPageRecheck: page,
    })
}

function isContract(candidateValue: unknown): candidateValue is Contract {
    if (!candidateValue || typeof candidateValue !== 'object' || Array.isArray(candidateValue)) return false
    const candidate = candidateValue as Record<string, unknown>
    return ['type', 'status', 'package', 'startDate', 'expiryDate', 'invoiceNo']
        .every((field) => typeof candidate[field] === 'string')
}

function contractFixture(): Contract[] {
    const json = readFileSync(join(fixtureDirectory, 'correlation-smoke-contracts.json'), 'utf8')
    const parsedContracts: unknown = JSON.parse(json)
    if (!Array.isArray(parsedContracts) || !parsedContracts.every(isContract)) {
        throw new Error('INVALID_SANITIZED_CONTRACT_FIXTURE')
    }
    return parsedContracts
}

function fixtureEvidence(): CorrelationSmokeEvidence {
    const baseline = stableFixtureScan('report-empty.html')
    const postReport = stableFixtureScan('correlation-smoke-report.html')
    const contracts = contractFixture()
    const correlation = correlateRenewalFulfillment({
        baseline: {
            outcome: baseline.outcome,
            invoiceNos: baseline.rows.map((row) => row.invoiceNo),
            dealerContextHash: baseline.dealerContextHash || '',
            capturedAt: '2026-08-23T21:29:00.000Z',
        },
        postReport: {
            outcome: postReport.outcome,
            rows: postReport.rows,
            dealerContextHash: postReport.dealerContextHash || '',
            observedAt: '2026-08-23T21:31:00.000Z',
        },
        contractCheck: {
            outcome: 'COMPLETE',
            contracts,
            observedAt: '2026-08-23T21:31:05.000Z',
        },
        target: {
            cardNumber: '7517687161',
            itemType: 'Card_CISCO',
            selectedPackageName: 'Renewal Premium 12 Months Save 25%',
            providerAmount: '174',
            currency: 'USD',
            finalMutationStartedAt: '2026-08-23T21:30:00.000Z',
        },
    })
    const reportInvoice = correlation.reportRow?.invoiceNo.trim() || null
    const contractInvoice = correlation.matchedContract?.invoiceNo.trim() || null
    const invoiceEqual = Boolean(reportInvoice && reportInvoice === contractInvoice)
    const dealerContextEqual = Boolean(
        baseline.dealerContextHash &&
        baseline.dealerContextHash === postReport.dealerContextHash
    )
    const passed = correlation.outcome === 'MATCHED' && invoiceEqual && dealerContextEqual

    return {
        schemaVersion: 1,
        mode: 'FIXTURE',
        decision: passed ? 'PASS' : 'FAIL',
        outcomes: {
            baselineReport: baseline.outcome,
            postReport: postReport.outcome,
            contractRead: 'COMPLETE',
            correlation: correlation.outcome,
        },
        counts: {
            baselinePages: baseline.pageCount,
            baselineRows: baseline.rows.length,
            postPages: postReport.pageCount,
            postRows: postReport.rows.length,
            contracts: contracts.length,
            matchedContracts: correlation.matchedContract ? 1 : 0,
        },
        equality: {
            dealerContext: dealerContextEqual,
            invoice: invoiceEqual,
            explicitLiveAuthorization: false,
        },
        hashes: {
            dealerContext: postReport.dealerContextHash,
            reportInvoice: safeHash('provider-invoice', reportInvoice),
            contractInvoice: safeHash('provider-invoice', contractInvoice),
            reportRow: correlation.reportRow?.rowFingerprint || null,
        },
        reasonCode: correlation.reasonCode,
    }
}

function smokeRequest(args: readonly string[]): SmokeRequest {
    if (args.length === 1 && args[0] === '--fixture') {
        return { mode: 'FIXTURE', explicitLiveAuthorization: false }
    }
    const allArgumentsKnown = args.every((argument) =>
        argument === '--live' || argument === '--authorize-live-read-only'
    )
    if (!allArgumentsKnown || !args.includes('--live')) {
        return {
            mode: 'INVALID',
            explicitLiveAuthorization: false,
            reasonCode: args.length === 0 ? 'MODE_REQUIRED' : 'INVALID_ARGUMENTS',
        }
    }
    const authorizationCount = args.filter((argument) =>
        argument === '--authorize-live-read-only'
    ).length
    if (args.filter((argument) => argument === '--live').length !== 1 || authorizationCount > 1) {
        return {
            mode: 'INVALID',
            explicitLiveAuthorization: false,
            reasonCode: 'INVALID_ARGUMENTS',
        }
    }
    return {
        mode: 'LIVE',
        explicitLiveAuthorization: authorizationCount === 1,
    }
}

function correlationSmoke(args: readonly string[]): CorrelationSmokeEvidence {
    const request = smokeRequest(args)
    if (request.mode === 'FIXTURE') return fixtureEvidence()
    if (request.mode === 'INVALID') {
        return emptyEvidence('INVALID', 'BLOCKED', request.reasonCode || 'INVALID_ARGUMENTS')
    }
    if (!request.explicitLiveAuthorization) {
        return emptyEvidence('LIVE', 'BLOCKED', 'LIVE_AUTHORIZATION_REQUIRED')
    }

    return emptyEvidence(
        'LIVE',
        'BLOCKED',
        'AUTHENTICATED_READ_ONLY_SESSION_ADAPTER_UNAVAILABLE',
        true
    )
}

let smokeEvidence: CorrelationSmokeEvidence
try {
    smokeEvidence = correlationSmoke(process.argv.slice(2))
} catch {
    smokeEvidence = emptyEvidence('FIXTURE', 'FAIL', 'FIXTURE_EVALUATION_FAILED')
}

console.log(JSON.stringify(smokeEvidence, null, 2))
if (smokeEvidence.decision !== 'PASS') process.exitCode = 1
