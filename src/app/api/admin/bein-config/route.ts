import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { getRenewalReadiness } from '@/lib/renewal-readiness'
import {
    DEFAULT_RENEWAL_FULFILLMENT_PROOF_MODE,
    DEFAULT_RENEWAL_VERIFICATION_DELAYS_MS,
    DEFAULT_SOLD_PACKAGES_REPORT_PATH,
    DEFAULT_SOLD_REPORT_PAGE_CAP,
    DEFAULT_SOLD_REPORT_SCAN_ATTEMPTS,
    RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY,
    RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY,
    RENEWAL_VERIFICATION_DELAYS_SETTING_KEY,
    SOLD_PACKAGES_REPORT_URL_SETTING_KEY,
    SOLD_REPORT_PAGE_CAP_SETTING_KEY,
    SOLD_REPORT_SCAN_ATTEMPTS_SETTING_KEY,
    evaluateRenewalFulfillmentEnforcement,
    isRenewalFulfillmentProofMode,
    isValidRenewalVerificationDelays,
    isValidSoldReportPageCap,
    isValidSoldReportScanAttempts,
    resolveSoldPackagesReportUrl,
} from '../../../../../shared/operations/renewal-fulfillment-config'

// All beIN-related setting keys
// NOTE: Credentials (bein_username, bein_password, bein_totp_secret) are now stored
// in the BeinAccount table for multi-account support
const BEIN_SETTINGS_KEYS = [
    // Captcha
    'captcha_2captcha_key',
    'captcha_enabled',

    // URLs
    'bein_login_url',
    'bein_renew_url',
    'bein_check_url',
    'bein_signal_url',
    SOLD_PACKAGES_REPORT_URL_SETTING_KEY,

    // Login Selectors
    'bein_sel_username',
    'bein_sel_password',
    'bein_sel_2fa',
    'bein_sel_captcha_img',
    'bein_sel_captcha_input',
    'bein_sel_submit',

    // Renew Selectors
    'bein_sel_card_input',
    'bein_sel_duration',
    'bein_sel_renew_submit',
    'bein_sel_success_msg',
    'bein_sel_error_msg',

    // Check Balance Selectors
    'bein_sel_check_card',
    'bein_sel_check_submit',
    'bein_sel_balance_result',

    // Pool Settings (Account Distribution)
    'pool_max_requests_per_account',
    'pool_rate_limit_window_seconds',
    'pool_cooldown_after_failures',
    'pool_cooldown_duration_seconds',
    'pool_min_delay_ms',
    'pool_max_delay_ms',
    'pool_max_consecutive_failures',
    'pool_auto_disable_on_error',

    // Advanced Worker Settings
    'worker_session_timeout',
    'worker_max_retries',
    'worker_headless',

    // Renewal fulfillment proof rollout
    RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY,
    SOLD_REPORT_PAGE_CAP_SETTING_KEY,
    SOLD_REPORT_SCAN_ATTEMPTS_SETTING_KEY,
    RENEWAL_VERIFICATION_DELAYS_SETTING_KEY,

    // Session Keep-Alive Settings (NEW)
    'worker_keepalive_enabled',         // Enable/disable background keep-alive
    'worker_keepalive_interval',        // Interval in minutes (default: 10)
    'keepalive_interval_minutes',       // Session refresh interval (used by worker)

    // User Proxy Settings
    'user_proxy_limit',  // Number of users with proxy linked (display only)

    // Sidebar Visibility
    'sidebar_show_login_failures',
    'sidebar_show_low_balance',
]

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const [settings, liveSmokeAttestation] = await Promise.all([
            prisma.setting.findMany({
                where: {
                    key: { in: BEIN_SETTINGS_KEYS }
                }
            }),
            prisma.setting.findUnique({
                where: { key: RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY },
                select: { value: true },
            }),
        ])

        // Convert to object, masking sensitive values
        const config: Record<string, string> = {
            [RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY]: DEFAULT_RENEWAL_FULFILLMENT_PROOF_MODE,
            [SOLD_PACKAGES_REPORT_URL_SETTING_KEY]: DEFAULT_SOLD_PACKAGES_REPORT_PATH,
            [SOLD_REPORT_PAGE_CAP_SETTING_KEY]: String(DEFAULT_SOLD_REPORT_PAGE_CAP),
            [SOLD_REPORT_SCAN_ATTEMPTS_SETTING_KEY]: String(DEFAULT_SOLD_REPORT_SCAN_ATTEMPTS),
            [RENEWAL_VERIFICATION_DELAYS_SETTING_KEY]:
                DEFAULT_RENEWAL_VERIFICATION_DELAYS_MS.join(','),
        }

        settings.forEach(s => {
            // Mask sensitive fields
            if (s.key === 'captcha_2captcha_key' && s.value) {
                config[s.key] = '••••••••' + s.value.slice(-4)
            } else {
                config[s.key] = s.value
            }
        })

        const storedProofMode = config[RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY]
        const enforcement = evaluateRenewalFulfillmentEnforcement({
            requestedMode: storedProofMode,
            attestationValue: liveSmokeAttestation?.value,
        })
        config[RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY] = enforcement.effectiveMode
        if (!isRenewalFulfillmentProofMode(storedProofMode)) {
            console.warn('Invalid renewal fulfillment proof mode setting; using REVIEW_ONLY')
        }

        return NextResponse.json({
            ...config,
            renewalFulfillmentEnforcement: {
                requestedMode: enforcement.requestedMode,
                available: enforcement.enforcementAvailable,
                reason: enforcement.reason,
                effectiveMode: enforcement.effectiveMode,
                verifiedAt: enforcement.enforcementAvailable
                    ? enforcement.verifiedAt
                    : null,
            },
            renewalReadiness: await getRenewalReadiness(prisma),
        })

    } catch (error) {
        console.error('Get beIN config error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }
        const adminUser = authResult.user

        const body = await request.json()
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'INVALID_BEIN_CONFIG' }, { status: 400 })
        }

        if (Object.prototype.hasOwnProperty.call(
            body,
            RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY
        )) {
            return NextResponse.json(
                { error: 'RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_READ_ONLY' },
                { status: 400 }
            )
        }

        const hasProofModeUpdate = Object.prototype.hasOwnProperty.call(
            body,
            RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY
        )
        if (
            hasProofModeUpdate
            && !isRenewalFulfillmentProofMode(
                body[RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY]
            )
        ) {
            return NextResponse.json(
                { error: 'INVALID_RENEWAL_FULFILLMENT_PROOF_MODE' },
                { status: 400 }
            )
        }

        if (
            hasProofModeUpdate &&
            body[RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY] === 'ENFORCE'
        ) {
            const liveSmokeAttestation = await prisma.setting.findUnique({
                where: { key: RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY },
                select: { value: true },
            })
            const enforcement = evaluateRenewalFulfillmentEnforcement({
                requestedMode: 'ENFORCE',
                attestationValue: liveSmokeAttestation?.value,
            })
            if (!enforcement.enforcementAvailable) {
                return NextResponse.json(
                    {
                        error: 'RENEWAL_FULFILLMENT_ENFORCEMENT_UNAVAILABLE',
                        reason: enforcement.reason,
                    },
                    { status: 409 }
                )
            }
        }

        const invalidBound =
            (Object.prototype.hasOwnProperty.call(body, SOLD_REPORT_PAGE_CAP_SETTING_KEY) &&
                !isValidSoldReportPageCap(body[SOLD_REPORT_PAGE_CAP_SETTING_KEY])) ||
            (Object.prototype.hasOwnProperty.call(body, SOLD_REPORT_SCAN_ATTEMPTS_SETTING_KEY) &&
                !isValidSoldReportScanAttempts(body[SOLD_REPORT_SCAN_ATTEMPTS_SETTING_KEY])) ||
            (Object.prototype.hasOwnProperty.call(body, RENEWAL_VERIFICATION_DELAYS_SETTING_KEY) &&
                !isValidRenewalVerificationDelays(body[RENEWAL_VERIFICATION_DELAYS_SETTING_KEY]))
        if (invalidBound) {
            return NextResponse.json(
                { error: 'INVALID_RENEWAL_FULFILLMENT_BOUNDS' },
                { status: 400 }
            )
        }

        const hasLoginUrlUpdate = Object.prototype.hasOwnProperty.call(body, 'bein_login_url')
        const hasReportUrlUpdate = Object.prototype.hasOwnProperty.call(
            body,
            SOLD_PACKAGES_REPORT_URL_SETTING_KEY
        )
        if (hasLoginUrlUpdate || hasReportUrlUpdate) {
            const storedUrls = await prisma.setting.findMany({
                where: {
                    key: { in: ['bein_login_url', SOLD_PACKAGES_REPORT_URL_SETTING_KEY] },
                },
                select: { key: true, value: true },
            })
            const currentUrls = new Map(storedUrls.map((setting) => [setting.key, setting.value]))
            const loginUrl = hasLoginUrlUpdate
                ? body.bein_login_url
                : currentUrls.get('bein_login_url') ||
                    'https://sbs.beinsports.net/Dealers/NLogin.aspx'
            const reportUrl = hasReportUrlUpdate
                ? body[SOLD_PACKAGES_REPORT_URL_SETTING_KEY]
                : currentUrls.get(SOLD_PACKAGES_REPORT_URL_SETTING_KEY) ||
                    DEFAULT_SOLD_PACKAGES_REPORT_PATH
            if (typeof loginUrl !== 'string' || typeof reportUrl !== 'string') {
                return NextResponse.json(
                    { error: 'INVALID_SOLD_PACKAGES_REPORT_URL' },
                    { status: 400 }
                )
            }
            try {
                resolveSoldPackagesReportUrl(loginUrl, reportUrl)
            } catch {
                return NextResponse.json(
                    { error: 'INVALID_SOLD_PACKAGES_REPORT_URL' },
                    { status: 400 }
                )
            }
        }

        // Filter to only allow known keys
        const updates = Object.entries(body).filter(([key]) =>
            BEIN_SETTINGS_KEYS.includes(key)
        )

        // Skip masked values (don't overwrite with masked data)
        const validUpdates = updates.filter(([key, value]) => {
            const val = value as string
            if (key === 'captcha_2captcha_key' && val.startsWith('••••••••')) return false
            return true
        })

        // Upsert all settings
        const upserts = validUpdates.map(([key, value]) => {
            return prisma.setting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) }
            })
        })

        await prisma.$transaction(upserts)

        // Log activity
        await prisma.activityLog.create({
            data: {
                userId: adminUser.id,
                action: 'ADMIN_UPDATE_BEIN_CONFIG',
                details: JSON.stringify({ keysUpdated: validUpdates.map(([k]) => k) }),
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        return NextResponse.json({ success: true, message: 'beIN settings saved successfully' })

    } catch (error) {
        console.error('Update beIN config error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
