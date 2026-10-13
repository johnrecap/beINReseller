import test from 'node:test'
import assert from 'node:assert/strict'
import { OperationStatus, Prisma } from '@prisma/client'
import { loadIsolatedModule } from '../../tests/helpers/promo-dispatch-harness'
import * as quoteApi from '../../shared/operations/package-quote'
import * as correlation from '../src/lib/renewal-fulfillment-correlation'
import { parseSoldPackagesReportPage } from '../src/http/sold-packages-report'
import { readRenewalSummary } from '../src/http/renewal-purchase-guard'
import { observedCart, observedReport, fullCard } from './fixtures/renewal-observed'

test('actual verification worker requires stored cart evidence before attributing a Reports invoice', async () => {
    const deps: Record<string, unknown> = {
        '@prisma/client': { OperationStatus, Prisma },
        '../../shared/operations/package-quote': quoteApi,
        './lib/renewal-fulfillment-correlation': correlation,
    }
    for (const name of ['node:crypto', 'bullmq', './http', './pool', './pool/account-locking', './utils/notification',
        './utils/error-handler', './lib/prisma', './utils/captcha-solver', './lib/activity-tracker', './lib/integrity-detector',
        './lib/crypto', './lib/bein-spend-ledger', './lib/installment-finalization', '../../shared/operations/audit-financial-context',
        '../../shared/operations/completion-effects', './lib/redis', './lib/points', './lib/session-cache', './lib/package-cache',
        './lib/bein-login-tracking', './lib/bein-connection-mode', './lib/final-pay-evidence', './lib/fulfillment-finalization',
        './lib/renewal-no-charge-finalization', './lib/pre-mutation-renewal-finalization', './lib/renewal-verification-retry',
        './lib/provider-account-reservation', './lib/same-day-report-fulfillment',
        '../../shared/operations/renewal-fulfillment', './lib/promo-quote']) {
        deps[name] = new Proxy({}, { get: () => () => { throw new Error(`UNEXPECTED_EXTERNAL_DEPENDENCY:${name}`) } })
    }
    const report = parseSoldPackagesReportPage(observedReport())
    deps['./lib/fulfillment-baseline'] = {
        getRenewalFulfillmentConfig: async () => ({ proofMode: 'ENFORCE', reportPageCap: 100, reportScanAttempts: 2 }),
        getActiveRenewalFulfillmentBaseline: async () => ({ activeBaseline: { id: 'baseline', beinAccountId: 'account',
            invoiceSet: ['1000'], dealerContextHash: report.dealerContextHash, capturedAt: new Date('2026-10-11T11:59:00Z'), sessionGeneration: 'generation' } }),
    }
    const api = loadIsolatedModule<{ verifyRenewalFulfillmentWithProvider(input: Record<string, unknown>): Promise<{
        correlation: correlation.RenewalFulfillmentCorrelationResult; proofCandidate: { invoiceNo: string; providerAmount: string } | null
    }> }>('worker/src/http-queue-processor.ts', deps, ['verifyRenewalFulfillmentWithProvider'])
    const selected = { index: 0, name: 'Premium 6 Months (6 Months)', price: 108, currency: 'USD', quoteRevision: 2, packageKey: '2.0', appliedPromoCode: null }
    let reads = 0
    const input = { operationId: 'operation', beinAccountId: 'account', cardNumber: fullCard, selectedPackage: selected,
        responseData: {}, finalMutationStartedAt: new Date('2026-10-11T12:00:00Z'), account: {}, route: {}, executionLease: {},
        verificationSource: 'POST_FINAL_PAY', assertExecutionCurrent: async () => {}, client: {
            scanSoldPackagesReport: async () => { reads++; return { ...report, pageCount: 1 } },
            checkCardForSignal: async () => { reads++; return { success: true, contracts: [{ invoiceNo: '1001',
                package: 'Premium 6 Months', startDate: '11/10/2026', expiryDate: '10/04/2027', status: 'Active', type: 'Package' }] } },
        } }
    const missing = await api.verifyRenewalFulfillmentWithProvider(input)
    assert.equal(missing.correlation.outcome, 'PROOF_CONFLICT')
    assert.equal(missing.proofCandidate, null)
    assert.equal(reads, 0)
    input.responseData = { smartcardType: 'CISCO', purchaseIdentity: readRenewalSummary(observedCart(), selected, fullCard) }
    const verified = await api.verifyRenewalFulfillmentWithProvider(input)
    assert.equal(verified.correlation.outcome, 'MATCHED')
    assert.equal(verified.proofCandidate?.invoiceNo, '1001')
    assert.equal(verified.proofCandidate?.providerAmount, '108')
    assert.equal(reads, 2)
    input.selectedPackage = { ...selected, price: 216 }
    assert.equal((await api.verifyRenewalFulfillmentWithProvider(input)).proofCandidate, null)
    assert.equal(reads, 2)
})
