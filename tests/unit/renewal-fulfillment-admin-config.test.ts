import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    DEFAULT_RENEWAL_FULFILLMENT_PROOF_MODE,
    DEFAULT_SOLD_PACKAGES_REPORT_PATH,
    DEFAULT_RENEWAL_VERIFICATION_DELAYS_MS,
    RENEWAL_FULFILLMENT_ENFORCEMENT_RELEASE_FINGERPRINT,
    RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY,
    RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY,
    SOLD_PACKAGES_REPORT_URL_SETTING_KEY,
    evaluateRenewalFulfillmentEnforcement,
    isValidRenewalVerificationDelays,
    isValidSoldReportPageCap,
    isValidSoldReportScanAttempts,
    isRenewalFulfillmentProofMode,
    parseRenewalFulfillmentProofMode,
    parseRenewalFulfillmentLiveSmokeAttestation,
    parseRenewalVerificationDelays,
    parseSoldReportPageCap,
    parseSoldReportScanAttempts,
    readRenewalFulfillmentProofMode,
    resolveSoldPackagesReportUrl,
} from '../../shared/operations/renewal-fulfillment-config'
import { en } from '@/i18n/translations/en'
import { ar } from '@/i18n/translations/ar'
import { bn } from '@/i18n/translations/bn'

const NOW = new Date('2026-08-24T12:00:00.000Z')

function validLiveSmokeAttestation(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        schemaVersion: 1,
        mode: 'LIVE_READ_ONLY',
        decision: 'PASS',
        releaseFingerprint: RENEWAL_FULFILLMENT_ENFORCEMENT_RELEASE_FINGERPRINT,
        verifiedAt: '2026-08-24T11:30:00.000Z',
        evidenceDigest: 'a'.repeat(64),
        checks: {
            baselineReportComplete: true,
            postReportComplete: true,
            contractReadComplete: true,
            paginationComplete: true,
            explicitLiveAuthorization: true,
            correlationMatched: true,
            dealerContextMatched: true,
            invoiceMatched: true,
        },
        ...overrides,
    })
}

test('renewal fulfillment proof mode fails closed to REVIEW_ONLY', async () => {
    assert.equal(DEFAULT_RENEWAL_FULFILLMENT_PROOF_MODE, 'REVIEW_ONLY')
    assert.equal(RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY, 'bein_renewal_fulfillment_proof_mode')

    for (const value of [undefined, null, '', 'enforce', ' ENFORCE ', 'UNKNOWN', true, 1]) {
        assert.equal(parseRenewalFulfillmentProofMode(value), 'REVIEW_ONLY')
        assert.equal(isRenewalFulfillmentProofMode(value), false)
    }

    assert.equal(parseRenewalFulfillmentProofMode('REVIEW_ONLY'), 'REVIEW_ONLY')
    assert.equal(parseRenewalFulfillmentProofMode('ENFORCE'), 'ENFORCE')
    assert.equal(isRenewalFulfillmentProofMode('REVIEW_ONLY'), true)
    assert.equal(isRenewalFulfillmentProofMode('ENFORCE'), true)

    const requestedKeys: string[] = []
    const values = new Map<string, unknown>([
        [RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY, 'ENFORCE'],
        [
            RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY,
            validLiveSmokeAttestation(),
        ],
    ])
    const mode = await readRenewalFulfillmentProofMode(async (key) => {
        requestedKeys.push(key)
        return values.get(key)
    }, NOW)

    assert.equal(mode, 'ENFORCE')
    assert.deepEqual(requestedKeys.sort(), [
        RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY,
        RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY,
    ].sort())
})

test('ENFORCE requires an exact current live read-only smoke attestation', () => {
    const valid = evaluateRenewalFulfillmentEnforcement({
        requestedMode: 'ENFORCE',
        attestationValue: validLiveSmokeAttestation(),
        now: NOW,
    })
    assert.deepEqual(valid, {
        requestedMode: 'ENFORCE',
        effectiveMode: 'ENFORCE',
        enforcementAvailable: true,
        reason: 'LIVE_SMOKE_ATTESTATION_VALID',
        verifiedAt: '2026-08-24T11:30:00.000Z',
    })

    const reviewOnly = evaluateRenewalFulfillmentEnforcement({
        requestedMode: 'REVIEW_ONLY',
        attestationValue: validLiveSmokeAttestation(),
        now: NOW,
    })
    assert.equal(reviewOnly.enforcementAvailable, true)
    assert.equal(reviewOnly.effectiveMode, 'REVIEW_ONLY')

    for (const attestationValue of [undefined, null, '']) {
        const missing = evaluateRenewalFulfillmentEnforcement({
            requestedMode: 'ENFORCE',
            attestationValue,
            now: NOW,
        })
        assert.equal(missing.effectiveMode, 'REVIEW_ONLY')
        assert.equal(missing.reason, 'LIVE_SMOKE_ATTESTATION_MISSING')
    }
})

test('live smoke attestation parser rejects malformed and extended schemas', () => {
    const valid = JSON.parse(validLiveSmokeAttestation()) as Record<string, unknown>
    const validChecks = valid.checks as Record<string, unknown>
    const invalidAttestations = [
        'not-json',
        JSON.stringify({ ...valid, extra: true }),
        JSON.stringify({ ...valid, mode: 'LIVE' }),
        JSON.stringify({ ...valid, decision: 'BLOCKED' }),
        JSON.stringify({ ...valid, verifiedAt: '2026-08-24T11:30:00Z' }),
        JSON.stringify({ ...valid, evidenceDigest: 'A'.repeat(64) }),
        JSON.stringify({
            ...valid,
            checks: { ...validChecks, unexpectedCheck: true },
        }),
        JSON.stringify({
            ...valid,
            checks: { ...validChecks, invoiceMatched: false },
        }),
        JSON.stringify({
            ...valid,
            checks: { ...validChecks, explicitLiveAuthorization: false },
        }),
    ]

    assert.ok(parseRenewalFulfillmentLiveSmokeAttestation(validLiveSmokeAttestation()))
    for (const attestation of invalidAttestations) {
        assert.equal(parseRenewalFulfillmentLiveSmokeAttestation(attestation), null)
        assert.equal(evaluateRenewalFulfillmentEnforcement({
            requestedMode: 'ENFORCE',
            attestationValue: attestation,
            now: NOW,
        }).effectiveMode, 'REVIEW_ONLY')
    }
})

test('live smoke attestation fails closed for stale future and release-mismatched evidence', () => {
    const cases: Array<[string, string]> = [
        [
            validLiveSmokeAttestation({ verifiedAt: '2026-08-23T11:59:59.999Z' }),
            'LIVE_SMOKE_ATTESTATION_STALE',
        ],
        [
            validLiveSmokeAttestation({ verifiedAt: '2026-08-24T12:05:00.001Z' }),
            'LIVE_SMOKE_ATTESTATION_FROM_FUTURE',
        ],
        [
            validLiveSmokeAttestation({ releaseFingerprint: 'previous-release' }),
            'LIVE_SMOKE_RELEASE_MISMATCH',
        ],
    ]

    for (const [attestationValue, expectedReason] of cases) {
        const evaluation = evaluateRenewalFulfillmentEnforcement({
            requestedMode: 'ENFORCE',
            attestationValue,
            now: NOW,
        })
        assert.equal(evaluation.effectiveMode, 'REVIEW_ONLY')
        assert.equal(evaluation.enforcementAvailable, false)
        assert.equal(evaluation.reason, expectedReason)
        assert.equal(evaluation.verifiedAt, null)
    }
})

test('admin config API exposes the safe default and rejects malformed proof mode updates', () => {
    const source = readFileSync(join(
        process.cwd(),
        'src',
        'app',
        'api',
        'admin',
        'bein-config',
        'route.ts'
    ), 'utf8')
    const generalSettingsSource = readFileSync(join(
        process.cwd(),
        'src',
        'app',
        'api',
        'settings',
        'route.ts'
    ), 'utf8')

    assert.match(source, /RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY/)
    assert.match(source, /isRenewalFulfillmentProofMode/)
    assert.match(source, /INVALID_RENEWAL_FULFILLMENT_PROOF_MODE/)
    assert.match(source, /RENEWAL_FULFILLMENT_ENFORCEMENT_UNAVAILABLE/)
    assert.match(source, /RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_READ_ONLY/)
    assert.match(source, /renewalFulfillmentEnforcement/)
    assert.match(source, /evaluateRenewalFulfillmentEnforcement/)
    assert.match(source, /INVALID_SOLD_PACKAGES_REPORT_URL/)
    assert.match(source, /resolveSoldPackagesReportUrl/)
    assert.match(source, /INVALID_RENEWAL_FULFILLMENT_BOUNDS/)
    assert.match(generalSettingsSource, /evaluateRenewalFulfillmentEnforcement/)
    assert.match(
        generalSettingsSource,
        /delete settingsMap\[RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY\]/
    )
    assert.match(
        generalSettingsSource,
        /RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_READ_ONLY/
    )
    assert.match(generalSettingsSource, /RENEWAL_FULFILLMENT_ENFORCEMENT_UNAVAILABLE/)
})

test('admin UI cannot submit unavailable ENFORCE or echo enforcement metadata', () => {
    const source = readFileSync(join(
        process.cwd(),
        'src',
        'components',
        'admin',
        'BeINConfigForm.tsx'
    ), 'utf8')

    assert.match(source, /disabled: !enforcementStatus\.available/)
    assert.match(source, /value === 'ENFORCE'[\s\S]{0,160}!enforcementStatus\.available/)
    assert.match(
        source,
        /config\.bein_renewal_fulfillment_proof_mode === 'ENFORCE'[\s\S]{0,160}!enforcementStatus\.available/
    )
    assert.match(source, /key !== 'renewalFulfillmentEnforcement'/)
})

test('Sold Report bounds are deterministic and invalid values fail to safe defaults', () => {
    assert.equal(parseSoldReportPageCap('37'), 37)
    assert.equal(parseSoldReportPageCap('101'), 100)
    assert.equal(parseSoldReportScanAttempts('1'), 1)
    assert.equal(parseSoldReportScanAttempts('3'), 2)
    assert.deepEqual(parseRenewalVerificationDelays('0,5000,15000,30000'), [0, 5000, 15000, 30000])
    assert.deepEqual(parseRenewalVerificationDelays('0,5000,5000,30000'), DEFAULT_RENEWAL_VERIFICATION_DELAYS_MS)

    assert.equal(isValidSoldReportPageCap('100'), true)
    assert.equal(isValidSoldReportPageCap('0'), false)
    assert.equal(isValidSoldReportScanAttempts('2'), true)
    assert.equal(isValidSoldReportScanAttempts('3'), false)
    assert.equal(isValidRenewalVerificationDelays('0,5000,15000,30000'), true)
    assert.equal(isValidRenewalVerificationDelays('0,70000,80000,90000'), false)
})

test('Sold Report configuration is same-origin and credential-free', () => {
    const loginUrl = 'https://sbs.beinsports.net/Dealers/NLogin.aspx'

    assert.equal(SOLD_PACKAGES_REPORT_URL_SETTING_KEY, 'bein_sold_packages_report_url')
    assert.equal(DEFAULT_SOLD_PACKAGES_REPORT_PATH, '/Dealers/Reports/frmSoldPackagesReport.aspx')
    assert.equal(
        resolveSoldPackagesReportUrl(loginUrl, DEFAULT_SOLD_PACKAGES_REPORT_PATH),
        'https://sbs.beinsports.net/Dealers/Reports/frmSoldPackagesReport.aspx'
    )
    assert.throws(
        () => resolveSoldPackagesReportUrl(loginUrl, 'https://example.com/report'),
        /provider login origin/
    )
    assert.throws(
        () => resolveSoldPackagesReportUrl(
            'https://user:secret@sbs.beinsports.net/Dealers/NLogin.aspx',
            DEFAULT_SOLD_PACKAGES_REPORT_PATH
        ),
        /provider login origin/
    )
})

test('beIN account admin APIs and UI expose explicit automation exclusivity attestation', () => {
    const collectionRoute = readFileSync(join(
        process.cwd(),
        'src',
        'app',
        'api',
        'admin',
        'bein-accounts',
        'route.ts'
    ), 'utf8')
    const itemRoute = readFileSync(join(
        process.cwd(),
        'src',
        'app',
        'api',
        'admin',
        'bein-accounts',
        '[id]',
        'route.ts'
    ), 'utf8')
    const page = readFileSync(join(
        process.cwd(),
        'src',
        'app',
        'dashboard',
        'admin',
        'bein-accounts',
        'page.tsx'
    ), 'utf8')

    assert.match(collectionRoute, /automationExclusive/)
    assert.match(itemRoute, /automationExclusive/)
    assert.match(collectionRoute, /INVALID_AUTOMATION_EXCLUSIVE/)
    assert.match(itemRoute, /INVALID_AUTOMATION_EXCLUSIVE/)
    assert.match(page, /automationExclusive/)
    assert.match(page, /automationExclusiveLabel/)
    assert.match(page, /automationExclusiveHint/)
})

test('all locales expose proof-mode and account-attestation labels', () => {
    for (const catalog of [en, ar, bn]) {
        assert.ok(catalog.admin.config.sections.fulfillmentProof)
        assert.ok(catalog.admin.config.fields.fulfillmentProofMode)
        assert.ok(catalog.admin.config.fields.soldPackagesReportPage)
        assert.ok(catalog.admin.config.fields.soldReportPageCap)
        assert.ok(catalog.admin.config.fields.soldReportScanAttempts)
        assert.ok(catalog.admin.config.fields.renewalVerificationDelays)
        assert.ok(catalog.admin.config.hints.soldReportPageCap)
        assert.ok(catalog.admin.config.hints.soldReportScanAttempts)
        assert.ok(catalog.admin.config.hints.renewalVerificationDelays)
        assert.ok(catalog.admin.config.hints.fulfillmentProofMode)
        assert.ok(catalog.admin.config.options.fulfillmentProofModes.reviewOnly)
        assert.ok(catalog.admin.config.options.fulfillmentProofModes.enforce)
        assert.ok(catalog.admin.config.enforcement.reasons.liveSmokeAttestationValid)
        assert.ok(catalog.admin.config.enforcement.reasons.liveSmokeAttestationMissing)
        assert.ok(catalog.admin.config.enforcement.reasons.liveSmokeAttestationInvalid)
        assert.ok(catalog.admin.config.enforcement.reasons.liveSmokeAttestationStale)
        assert.ok(catalog.admin.config.enforcement.reasons.liveSmokeAttestationFromFuture)
        assert.ok(catalog.admin.config.enforcement.reasons.liveSmokeReleaseMismatch)
        assert.ok(catalog.adminBeinAccounts.table.automationExclusive)
        assert.ok(catalog.adminBeinAccounts.status.automationExclusive)
        assert.ok(catalog.adminBeinAccounts.status.sharedUsage)
        assert.ok(catalog.adminBeinAccounts.dialogs.automationExclusiveLabel)
        assert.ok(catalog.adminBeinAccounts.dialogs.automationExclusiveHint)
    }

    assert.match(ar.admin.config.hints.fulfillmentProofMode, /[\u0600-\u06FF]/)
    assert.match(ar.adminBeinAccounts.dialogs.automationExclusiveHint, /[\u0600-\u06FF]/)
})
