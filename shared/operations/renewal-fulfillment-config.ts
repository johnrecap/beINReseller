export const RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY =
    'bein_renewal_fulfillment_proof_mode' as const
export const RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY =
    'bein_renewal_fulfillment_live_smoke_attestation' as const
export const RENEWAL_FULFILLMENT_ENFORCEMENT_RELEASE_FINGERPRINT =
    'spec-035-sold-report-contract-correlation-v1' as const
export const RENEWAL_FULFILLMENT_LIVE_SMOKE_MAX_AGE_MS = 24 * 60 * 60 * 1_000
export const RENEWAL_FULFILLMENT_LIVE_SMOKE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000

export const DEFAULT_RENEWAL_FULFILLMENT_PROOF_MODE = 'REVIEW_ONLY' as const
export const SOLD_PACKAGES_REPORT_URL_SETTING_KEY = 'bein_sold_packages_report_url' as const
export const DEFAULT_SOLD_PACKAGES_REPORT_PATH =
    '/Dealers/Reports/frmSoldPackagesReport.aspx' as const
export const SOLD_REPORT_PAGE_CAP_SETTING_KEY = 'bein_sold_report_page_cap' as const
export const SOLD_REPORT_SCAN_ATTEMPTS_SETTING_KEY = 'bein_sold_report_scan_attempts' as const
export const RENEWAL_VERIFICATION_DELAYS_SETTING_KEY =
    'bein_renewal_verification_delays_ms' as const

export const DEFAULT_SOLD_REPORT_PAGE_CAP = 100 as const
export const DEFAULT_SOLD_REPORT_SCAN_ATTEMPTS = 2 as const
export const DEFAULT_RENEWAL_VERIFICATION_DELAYS_MS =
    [0, 5_000, 15_000, 30_000] as const

export type RenewalFulfillmentProofMode = 'REVIEW_ONLY' | 'ENFORCE'
export type RenewalFulfillmentEnforcementReason =
    | 'LIVE_SMOKE_ATTESTATION_VALID'
    | 'LIVE_SMOKE_ATTESTATION_MISSING'
    | 'LIVE_SMOKE_ATTESTATION_INVALID'
    | 'LIVE_SMOKE_ATTESTATION_STALE'
    | 'LIVE_SMOKE_ATTESTATION_FROM_FUTURE'
    | 'LIVE_SMOKE_RELEASE_MISMATCH'

const RENEWAL_FULFILLMENT_ENFORCEMENT_REASONS = [
    'LIVE_SMOKE_ATTESTATION_VALID',
    'LIVE_SMOKE_ATTESTATION_MISSING',
    'LIVE_SMOKE_ATTESTATION_INVALID',
    'LIVE_SMOKE_ATTESTATION_STALE',
    'LIVE_SMOKE_ATTESTATION_FROM_FUTURE',
    'LIVE_SMOKE_RELEASE_MISMATCH',
] as const satisfies readonly RenewalFulfillmentEnforcementReason[]

export function isRenewalFulfillmentEnforcementReason(
    value: unknown
): value is RenewalFulfillmentEnforcementReason {
    return typeof value === 'string' &&
        (RENEWAL_FULFILLMENT_ENFORCEMENT_REASONS as readonly string[]).includes(value)
}

export interface RenewalFulfillmentLiveSmokeAttestation {
    schemaVersion: 1
    mode: 'LIVE_READ_ONLY'
    decision: 'PASS'
    releaseFingerprint: string
    verifiedAt: string
    evidenceDigest: string
    checks: {
        baselineReportComplete: true
        postReportComplete: true
        contractReadComplete: true
        paginationComplete: true
        explicitLiveAuthorization: true
        correlationMatched: true
        dealerContextMatched: true
        invoiceMatched: true
    }
}

export interface RenewalFulfillmentEnforcementEvaluation {
    requestedMode: RenewalFulfillmentProofMode
    effectiveMode: RenewalFulfillmentProofMode
    enforcementAvailable: boolean
    reason: RenewalFulfillmentEnforcementReason
    verifiedAt: string | null
}

const LIVE_SMOKE_ATTESTATION_KEYS = [
    'schemaVersion',
    'mode',
    'decision',
    'releaseFingerprint',
    'verifiedAt',
    'evidenceDigest',
    'checks',
] as const

const LIVE_SMOKE_CHECK_KEYS = [
    'baselineReportComplete',
    'postReportComplete',
    'contractReadComplete',
    'paginationComplete',
    'explicitLiveAuthorization',
    'correlationMatched',
    'dealerContextMatched',
    'invoiceMatched',
] as const

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const actualKeys = Object.keys(value).sort()
    const expectedKeys = [...keys].sort()
    return actualKeys.length === expectedKeys.length &&
        actualKeys.every((key, index) => key === expectedKeys[index])
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
    if (typeof value !== 'string') return false
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

export function parseRenewalFulfillmentLiveSmokeAttestation(
    value: unknown
): RenewalFulfillmentLiveSmokeAttestation | null {
    if (typeof value !== 'string' || !value || value.length > 4_096) return null

    let parsed: unknown
    try {
        parsed = JSON.parse(value)
    } catch {
        return null
    }

    if (!isExactRecord(parsed, LIVE_SMOKE_ATTESTATION_KEYS)) return null
    const checks = parsed.checks
    if (!isExactRecord(checks, LIVE_SMOKE_CHECK_KEYS)) return null
    if (
        parsed.schemaVersion !== 1 ||
        parsed.mode !== 'LIVE_READ_ONLY' ||
        parsed.decision !== 'PASS' ||
        typeof parsed.releaseFingerprint !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(parsed.releaseFingerprint) ||
        !isCanonicalIsoTimestamp(parsed.verifiedAt) ||
        typeof parsed.evidenceDigest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(parsed.evidenceDigest) ||
        LIVE_SMOKE_CHECK_KEYS.some((key) => checks[key] !== true)
    ) {
        return null
    }

    return parsed as unknown as RenewalFulfillmentLiveSmokeAttestation
}

export function evaluateRenewalFulfillmentEnforcement(input: {
    requestedMode: unknown
    attestationValue: unknown
    now?: Date
}): RenewalFulfillmentEnforcementEvaluation {
    const requestedMode = parseRenewalFulfillmentProofMode(input.requestedMode)
    const unavailable = (
        reason: Exclude<RenewalFulfillmentEnforcementReason, 'LIVE_SMOKE_ATTESTATION_VALID'>,
        verifiedAt: string | null = null
    ): RenewalFulfillmentEnforcementEvaluation => ({
        requestedMode,
        effectiveMode: DEFAULT_RENEWAL_FULFILLMENT_PROOF_MODE,
        enforcementAvailable: false,
        reason,
        verifiedAt,
    })

    if (
        input.attestationValue === undefined ||
        input.attestationValue === null ||
        input.attestationValue === ''
    ) {
        return unavailable('LIVE_SMOKE_ATTESTATION_MISSING')
    }

    const attestation = parseRenewalFulfillmentLiveSmokeAttestation(input.attestationValue)
    if (!attestation) return unavailable('LIVE_SMOKE_ATTESTATION_INVALID')
    if (
        attestation.releaseFingerprint !==
        RENEWAL_FULFILLMENT_ENFORCEMENT_RELEASE_FINGERPRINT
    ) {
        return unavailable('LIVE_SMOKE_RELEASE_MISMATCH')
    }

    const nowMs = (input.now || new Date()).getTime()
    const verifiedAtMs = Date.parse(attestation.verifiedAt)
    if (!Number.isFinite(nowMs)) return unavailable('LIVE_SMOKE_ATTESTATION_INVALID')
    if (verifiedAtMs > nowMs + RENEWAL_FULFILLMENT_LIVE_SMOKE_MAX_FUTURE_SKEW_MS) {
        return unavailable('LIVE_SMOKE_ATTESTATION_FROM_FUTURE')
    }
    if (nowMs - verifiedAtMs > RENEWAL_FULFILLMENT_LIVE_SMOKE_MAX_AGE_MS) {
        return unavailable('LIVE_SMOKE_ATTESTATION_STALE')
    }

    return {
        requestedMode,
        effectiveMode: requestedMode === 'ENFORCE' ? 'ENFORCE' : 'REVIEW_ONLY',
        enforcementAvailable: true,
        reason: 'LIVE_SMOKE_ATTESTATION_VALID',
        verifiedAt: attestation.verifiedAt,
    }
}

export function isRenewalFulfillmentProofMode(
    value: unknown
): value is RenewalFulfillmentProofMode {
    return value === 'REVIEW_ONLY' || value === 'ENFORCE'
}

export function parseRenewalFulfillmentProofMode(
    value: unknown
): RenewalFulfillmentProofMode {
    return isRenewalFulfillmentProofMode(value)
        ? value
        : DEFAULT_RENEWAL_FULFILLMENT_PROOF_MODE
}

export async function readRenewalFulfillmentProofMode(
    readSettingValue: (key: string) => Promise<unknown>,
    now?: Date
): Promise<RenewalFulfillmentProofMode> {
    const [mode, attestationValue] = await Promise.all([
        readSettingValue(RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY),
        readSettingValue(RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY),
    ])
    return evaluateRenewalFulfillmentEnforcement({
        requestedMode: mode,
        attestationValue,
        now,
    }).effectiveMode
}

export function resolveSoldPackagesReportUrl(
    loginUrl: string,
    configuredUrl: string
): string {
    const login = new URL(loginUrl)
    const report = new URL(configuredUrl || DEFAULT_SOLD_PACKAGES_REPORT_PATH, login)

    if (
        !['http:', 'https:'].includes(login.protocol) ||
        Boolean(login.username || login.password) ||
        report.origin !== login.origin ||
        Boolean(report.username || report.password)
    ) {
        throw new Error('Sold Packages Report URL must use the provider login origin')
    }

    return report.toString()
}

export function parseSoldReportPageCap(value: unknown): number {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return DEFAULT_SOLD_REPORT_PAGE_CAP
    }
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100
        ? parsed
        : DEFAULT_SOLD_REPORT_PAGE_CAP
}

export function parseSoldReportScanAttempts(value: unknown): number {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return DEFAULT_SOLD_REPORT_SCAN_ATTEMPTS
    }
    const parsed = Number(value)
    return parsed === 1 || parsed === 2
        ? parsed
        : DEFAULT_SOLD_REPORT_SCAN_ATTEMPTS
}

export function parseRenewalVerificationDelays(value: unknown): readonly number[] {
    if (typeof value !== 'string') return DEFAULT_RENEWAL_VERIFICATION_DELAYS_MS
    const parsed = value.split(',').map((part) => Number(part.trim()))
    const valid = parsed.length === 4 &&
        parsed[0] === 0 &&
        parsed.every((delay, index) =>
            Number.isSafeInteger(delay) &&
            delay >= 0 &&
            delay <= 60_000 &&
            (index === 0 || delay > parsed[index - 1])
        )
    return valid ? parsed : DEFAULT_RENEWAL_VERIFICATION_DELAYS_MS
}

export function isValidSoldReportPageCap(value: unknown): value is string {
    return typeof value === 'string' &&
        /^\d+$/.test(value) &&
        Number(value) >= 1 &&
        Number(value) <= 100
}

export function isValidSoldReportScanAttempts(value: unknown): value is string {
    return value === '1' || value === '2'
}

export function isValidRenewalVerificationDelays(value: unknown): value is string {
    if (typeof value !== 'string') return false
    const parsed = value.split(',').map((part) => Number(part.trim()))
    return parsed.length === 4 &&
        parsed[0] === 0 &&
        parsed.every((delay, index) =>
            Number.isSafeInteger(delay) &&
            delay >= 0 &&
            delay <= 60_000 &&
            (index === 0 || delay > parsed[index - 1])
        )
}
