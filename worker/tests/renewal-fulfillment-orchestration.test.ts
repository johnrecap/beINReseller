import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'), 'utf8')
const fulfillmentConfigSource = readFileSync(
    join(process.cwd(), 'worker', 'src', 'lib', 'fulfillment-baseline.ts'),
    'utf8'
)

function functionSource(startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start + startMarker.length)
    assert.ok(start >= 0, `missing ${startMarker}`)
    assert.ok(end > start, `missing ${endMarker}`)
    return source.slice(start, end)
}

test('captures a complete Sold Report baseline before package preparation on the final account', () => {
    const attemptSource = functionSource(
        'async function attemptPurchaseWithAccount',
        'async function handleConfirmPurchaseHttp'
    )
    const reserveIndex = attemptSource.indexOf('reserveProviderAccountForFulfillment(')
    const baselineIndex = attemptSource.indexOf('captureRenewalFulfillmentBaseline(')
    const loadPackagesIndex = attemptSource.indexOf('client.loadPackages(')

    assert.ok(reserveIndex >= 0)
    assert.ok(baselineIndex > reserveIndex)
    assert.ok(loadPackagesIndex > baselineIndex)
    assert.match(attemptSource.slice(baselineIndex, loadPackagesIndex), /baseline.*complete|complete.*baseline/i)
})

test('safe failover supersedes causal context and rematches package and promotion', () => {
    const completeSource = functionSource(
        'async function handleCompletePurchaseHttp',
        'async function attemptPurchaseWithAccount'
    )

    assert.match(completeSource, /providerMutationMayHaveStarted/)
    assert.match(completeSource, /supersedeRenewalFulfillmentBaseline/)
    assert.match(completeSource, /releaseProviderAccountReservation/)
    assert.match(completeSource, /rematchSelectedPackage/)
    assert.match(completeSource, /promo/i)
    assert.doesNotMatch(
        completeSource,
        /providerMutationMayHaveStarted[\s\S]{0,300}getNextAvailableAccountExcluding\(/
    )
})

test('durable final-provider marker is claimed before confirmPurchase can send OK', () => {
    const confirmSource = functionSource(
        'async function handleConfirmPurchaseHttp',
        'async function handleVerifyReviewCardHttp'
    )
    const markerIndex = confirmSource.indexOf('claimSameDayFinalMutation : claimFinalProviderMutationStart')
    const confirmIndex = confirmSource.indexOf('client.confirmPurchase(', markerIndex)

    assert.ok(markerIndex >= 0)
    assert.ok(confirmIndex > markerIndex)
    assert.match(confirmSource, /FINAL_PROVIDER_MUTATION_STARTED/)
    assert.match(confirmSource, /FINAL_PAY_REQUEST_STARTED/)
    assert.match(confirmSource, /verificationOnly/)
})

test('2026-08-24 regression: reopened reservation generation blocks an old baseline before final OK', () => {
    const confirmSource = functionSource(
        'async function handleConfirmPurchaseHttp',
        'async function handleVerifyReviewCardHttp'
    )
    const markerStart = fulfillmentConfigSource.indexOf(
        'export async function claimFinalProviderMutationStart'
    )
    const markerEnd = fulfillmentConfigSource.indexOf(
        'export async function recordFulfillmentVerificationAttempt',
        markerStart
    )
    const markerSource = fulfillmentConfigSource.slice(markerStart, markerEnd)

    assert.ok(markerStart >= 0 && markerEnd > markerStart)
    assert.match(confirmSource, /claimSameDayFinalMutation : claimFinalProviderMutationStart\)\(\{[\s\S]*reservationGeneration:\s*reserved\.reservationGeneration/)
    assert.match(markerSource, /reservationGeneration:\s*number/)
    assert.match(markerSource, /account_reservation\."reservation_generation"\s*=\s*\$\{input\.reservationGeneration\}/)
    assert.match(markerSource, /baseline\."session_generation"\s*=\s*\$\{String\(input\.reservationGeneration\)\}/)
})

test('post-mutation path verifies report plus same-invoice contract before finalization', () => {
    const confirmSource = functionSource(
        'async function handleConfirmPurchaseHttp',
        'async function handleVerifyReviewCardHttp'
    )
    const verifyIndex = confirmSource.indexOf('verifyRenewalFulfillmentWithProvider(')
    const finalizeIndex = confirmSource.indexOf('finalizeRenewalFulfillment(', verifyIndex)

    assert.ok(verifyIndex >= 0)
    assert.ok(finalizeIndex > verifyIndex)
    assert.doesNotMatch(confirmSource, /CONTRACT_VERIFIED_SUCCESS[\s\S]{0,500}status: 'COMPLETED'/)
    assert.doesNotMatch(confirmSource, /claimOperationFulfillmentProof\([\s\S]{0,800}status: 'COMPLETED'/)
})

test('REVIEW_ONLY stores a matched attempt without claiming automated proof or completing', () => {
    const confirmSource = functionSource(
        'async function handleConfirmPurchaseHttp',
        'async function handleVerifyReviewCardHttp'
    )
    const modeIndex = confirmSource.indexOf("proofMode === 'REVIEW_ONLY'")
    const enforceIndex = confirmSource.indexOf("proofMode === 'ENFORCE'")

    assert.ok(modeIndex >= 0)
    assert.ok(enforceIndex >= 0)
    assert.match(confirmSource.slice(modeIndex, enforceIndex), /recordFulfillmentVerificationAttempt/)
    assert.match(confirmSource.slice(modeIndex, enforceIndex), /REVIEW_REQUIRED/)
    assert.doesNotMatch(confirmSource.slice(modeIndex, enforceIndex), /claimOperationFulfillmentProof/)
})

test('2026-08-24 regression: Worker cannot honor ENFORCE without the shared live-smoke gate', () => {
    assert.match(
        fulfillmentConfigSource,
        /RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY/
    )
    assert.match(fulfillmentConfigSource, /evaluateRenewalFulfillmentEnforcement/)
    assert.match(fulfillmentConfigSource, /proofMode: enforcement\.effectiveMode/)
    assert.doesNotMatch(
        fulfillmentConfigSource,
        /proofMode:\s*parseRenewalFulfillmentProofMode/
    )
})

test('verification-only retries have no callable sale-mutation dependency', () => {
    const verifySource = functionSource(
        'async function handleVerifyRenewalFulfillmentHttp',
        'async function handleVerifyReviewCardHttp'
    )

    assert.match(verifySource, /verifyRenewalFulfillmentWithProvider/)
    assert.doesNotMatch(verifySource, /confirmPurchase|completePurchase|payInstallment|refreshSignal/)
})

test('provider reads and persistence are fenced by the current execution lease', () => {
    const providerReadSource = functionSource(
        'async function verifyRenewalFulfillmentWithProvider',
        'async function finalizeRenewalFulfillment'
    )
    const retrySource = functionSource(
        'async function handleVerifyRenewalFulfillmentHttp',
        'async function handleVerifyReviewCardHttp'
    )
    const verifyIndex = retrySource.indexOf('verifyRenewalFulfillmentWithProvider(')
    const postReadFenceIndex = retrySource.indexOf('await heartbeat.assertCurrent()', verifyIndex)
    const recordIndex = retrySource.indexOf('recordFulfillmentVerificationAttempt(', verifyIndex)
    const finalizerIndex = retrySource.indexOf('finalizeRenewalFulfillment(', recordIndex)
    const preFinalizerFenceIndex = retrySource.lastIndexOf('await heartbeat.assertCurrent()', finalizerIndex)

    assert.match(providerReadSource, /scanSoldPackagesReport\([\s\S]*assertExecutionCurrent\(\)/)
    assert.match(providerReadSource, /checkCardForSignal\([\s\S]*executionLease[\s\S]*assertExecutionCurrent\(\)/)
    assert.ok(postReadFenceIndex > verifyIndex && postReadFenceIndex < recordIndex)
    assert.ok(preFinalizerFenceIndex > recordIndex && preFinalizerFenceIndex < finalizerIndex)
    assert.match(fulfillmentConfigSource, /FULFILLMENT_VERIFICATION_STALE_WRITE_BLOCKED/)
    assert.match(fulfillmentConfigSource, /active_baseline_id/)
    assert.match(fulfillmentConfigSource, /FOR UPDATE/)
})

test('2026-08-24 regression: a duplicate verification attempt cannot reuse different evidence', () => {
    const recorderStart = fulfillmentConfigSource.indexOf(
        'export async function recordFulfillmentVerificationAttempt'
    )
    const recorderEnd = fulfillmentConfigSource.indexOf(
        'export async function markFulfillmentVerificationAttemptProofConflict',
        recorderStart
    )
    const recorderSource = fulfillmentConfigSource.slice(recorderStart, recorderEnd)

    assert.ok(recorderStart >= 0 && recorderEnd > recorderStart)
    assert.match(recorderSource, /FULFILLMENT_VERIFICATION_ATTEMPT_REPLAY_MISMATCH/)
    assert.match(recorderSource, /baselineId[\s\S]*outcome[\s\S]*candidateInvoiceNo/)
    assert.match(recorderSource, /replayed:\s*true/)
    assert.match(recorderSource, /replayed:\s*false/)
})

test('baseline capture rechecks the execution lease and locks terminal proof and reservation context', () => {
    const scanIndex = fulfillmentConfigSource.indexOf('input.client.scanSoldPackagesReport(')
    const postScanFenceIndex = fulfillmentConfigSource.indexOf(
        'await input.assertExecutionCurrent()',
        scanIndex
    )
    const transactionIndex = fulfillmentConfigSource.indexOf(
        'prisma.$transaction(',
        postScanFenceIndex
    )

    assert.ok(scanIndex >= 0)
    assert.ok(postScanFenceIndex > scanIndex)
    assert.ok(transactionIndex > postScanFenceIndex)
    assert.match(fulfillmentConfigSource, /FROM "operations"[\s\S]*FOR UPDATE/)
    assert.match(fulfillmentConfigSource, /FROM "card_lifecycle_reservations"[\s\S]*FOR UPDATE/)
    assert.match(fulfillmentConfigSource, /FROM "provider_account_causal_reservations"[\s\S]*FOR UPDATE/)
    assert.match(fulfillmentConfigSource, /reservationGeneration !== input\.reservationGeneration/)
    assert.match(fulfillmentConfigSource, /FULFILLMENT_BASELINE_PROOF_ALREADY_EXISTS/)
    assert.match(fulfillmentConfigSource, /FULFILLMENT_BASELINE_VERIFICATION_TERMINAL/)
})

test('package preparation cannot persist a confirmation session after execution lease loss', () => {
    const attemptSource = functionSource(
        'async function attemptPurchaseWithAccount',
        'async function handleConfirmPurchaseHttp'
    )
    const providerPreparation = attemptSource.indexOf('await client.completePurchase(')
    const postPreparationFence = attemptSource.indexOf(
        'await leaseHeartbeat.assertCurrent();',
        providerPreparation
    )
    const fencedSessionSave = attemptSource.indexOf(
        'saveOperationSessionToCacheFenced(',
        postPreparationFence
    )
    const finalStateUpdate = attemptSource.indexOf(
        "status: 'AWAITING_FINAL_CONFIRM'",
        fencedSessionSave
    )

    assert.ok(providerPreparation >= 0)
    assert.ok(postPreparationFence > providerPreparation)
    assert.ok(fencedSessionSave > postPreparationFence)
    assert.ok(finalStateUpdate > fencedSessionSave)
})

test('2026-08-25 regression: re-login fences every provider login, CAPTCHA submit, export, and session save', () => {
    const reLoginSource = functionSource(
        'async function performReLogin(',
        'async function withSessionRetry'
    )
    const loopIndex = reLoginSource.indexOf('for (let attempt = 1;')
    const attemptFenceIndex = reLoginSource.indexOf(
        'await runtime.assertExecutionLeaseCurrent(executionLease);',
        loopIndex
    )
    const loginIndex = reLoginSource.indexOf('await httpClient.login(', attemptFenceIndex)
    const postLoginFenceIndex = reLoginSource.indexOf(
        'await runtime.assertExecutionLeaseCurrent(executionLease);',
        loginIndex
    )
    const captchaSubmitIndex = reLoginSource.indexOf(
        'await httpClient.submitLogin(',
        postLoginFenceIndex
    )
    const preCaptchaFenceIndex = reLoginSource.lastIndexOf(
        'await runtime.assertExecutionLeaseCurrent(executionLease);',
        captchaSubmitIndex
    )
    const postCaptchaFenceIndex = reLoginSource.indexOf(
        'await runtime.assertExecutionLeaseCurrent(executionLease);',
        captchaSubmitIndex
    )
    const exportIndex = reLoginSource.indexOf('await httpClient.exportSession()', postCaptchaFenceIndex)
    const preExportFenceIndex = reLoginSource.lastIndexOf(
        'await runtime.assertExecutionLeaseCurrent(executionLease);',
        exportIndex
    )
    const postExportFenceIndex = reLoginSource.indexOf(
        'await runtime.assertExecutionLeaseCurrent(executionLease);',
        exportIndex
    )
    const saveIndex = reLoginSource.indexOf('await runtime.saveSessionToCacheFenced(', postExportFenceIndex)
    const preSaveFenceIndex = reLoginSource.lastIndexOf(
        'await runtime.assertExecutionLeaseCurrent(executionLease);',
        saveIndex
    )
    const postSaveFenceIndex = reLoginSource.indexOf(
        'await runtime.assertExecutionLeaseCurrent(executionLease);',
        saveIndex
    )

    assert.ok(attemptFenceIndex > loopIndex && attemptFenceIndex < loginIndex)
    assert.ok(postLoginFenceIndex > loginIndex && postLoginFenceIndex < captchaSubmitIndex)
    assert.ok(preCaptchaFenceIndex > postLoginFenceIndex && preCaptchaFenceIndex < captchaSubmitIndex)
    assert.ok(postCaptchaFenceIndex > captchaSubmitIndex)
    assert.ok(preExportFenceIndex > postCaptchaFenceIndex && preExportFenceIndex < exportIndex)
    assert.ok(postExportFenceIndex > exportIndex && postExportFenceIndex < saveIndex)
    assert.ok(preSaveFenceIndex > postExportFenceIndex && preSaveFenceIndex < saveIndex)
    assert.ok(postSaveFenceIndex > saveIndex)
})

test('2026-08-25 regression: CAPTCHA or fenced-save lease loss escapes before a second login attempt', () => {
    const reLoginSource = functionSource(
        'async function performReLogin(',
        'async function withSessionRetry'
    )
    const captchaCatchIndex = reLoginSource.indexOf('catch (captchaError: unknown)')
    const captchaEscapeIndex = reLoginSource.indexOf(
        'if (isProviderExecutionLeaseLostError(captchaError)) throw captchaError;',
        captchaCatchIndex
    )
    const captchaRetryIndex = reLoginSource.indexOf('await waitForReLoginRetry(', captchaCatchIndex)
    const saveLostIndex = reLoginSource.indexOf(
        "throw new Error('PROVIDER_EXECUTION_LEASE_LOST_DURING_SESSION_SAVE')"
    )
    const outerCatchIndex = reLoginSource.indexOf('catch (error: unknown)', saveLostIndex)
    const outerEscapeIndex = reLoginSource.indexOf(
        'if (isProviderExecutionLeaseLostError(error)) throw error;',
        outerCatchIndex
    )
    const outerRetryIndex = reLoginSource.indexOf('await waitForReLoginRetry(', outerCatchIndex)
    const retryGuardSource = functionSource(
        'async function waitForReLoginRetry(',
        'async function performReLogin('
    )
    const firstRetryFenceIndex = retryGuardSource.indexOf(
        'await assertExecutionLeaseCurrent(executionLease);'
    )
    const delayIndex = retryGuardSource.indexOf('await new Promise')
    const secondRetryFenceIndex = retryGuardSource.indexOf(
        'await assertExecutionLeaseCurrent(executionLease);',
        firstRetryFenceIndex + 1
    )

    assert.ok(captchaCatchIndex >= 0)
    assert.ok(captchaEscapeIndex > captchaCatchIndex && captchaEscapeIndex < captchaRetryIndex)
    assert.ok(saveLostIndex >= 0)
    assert.ok(outerEscapeIndex > outerCatchIndex && outerEscapeIndex < outerRetryIndex)
    assert.ok(firstRetryFenceIndex >= 0 && firstRetryFenceIndex < delayIndex)
    assert.ok(secondRetryFenceIndex > delayIndex)
})

test('database proof-claim conflicts overwrite the matched attempt and persisted operation state', () => {
    const confirmSource = functionSource(
        'async function handleConfirmPurchaseHttp',
        'async function handleVerifyReviewCardHttp'
    )
    const retrySource = functionSource(
        'async function handleVerifyRenewalFulfillmentHttp',
        'async function handleVerifyReviewCardHttp'
    )
    const adminSource = functionSource(
        'async function handleVerifyReviewCardHttp',
        'async function handleCancelConfirmHttp'
    )

    for (const pathSource of [confirmSource, retrySource, adminSource]) {
        assert.match(pathSource, /markFulfillmentVerificationAttemptProofConflict/)
        assert.match(pathSource, /effectiveVerificationOutcome/)
        assert.match(pathSource, /effectiveFulfillmentState/)
    }
    assert.match(fulfillmentConfigSource, /state:\s*'CONFLICT'/)
    assert.match(fulfillmentConfigSource, /lastOutcome:\s*'PROOF_CONFLICT'/)
})

test('read-only verification retries contention and a new durable claim is compensated on lease failure', () => {
    const verifySource = functionSource(
        'async function handleVerifyRenewalFulfillmentHttp',
        'async function handleVerifyReviewCardHttp'
    )
    const reserveSource = functionSource(
        'async function reserveProviderAccountForFulfillment',
        'async function releaseProviderAccountReservation'
    )
    const scheduleSource = functionSource(
        'async function scheduleRenewalFulfillmentVerification',
        'function storedFinalMutationStartedAt'
    )

    assert.doesNotMatch(verifySource, /if \(!reserved\) return;/)
    assert.match(verifySource, /PROVIDER_ACCOUNT_EXECUTION_UNAVAILABLE/)
    assert.match(reserveSource, /compensateNewProviderReservation/)
    assert.match(reserveSource, /claim\.status\s*===\s*'ACQUIRED'/)
    assert.match(scheduleSource, /attempts:\s*[2-9]\d*/)
    assert.match(scheduleSource, /backoff:/)
})

test('retry and admin finalization remain blocked by a spend-ledger account mismatch', () => {
    const retrySource = functionSource(
        'async function handleVerifyRenewalFulfillmentHttp',
        'async function handleVerifyReviewCardHttp'
    )
    const adminSource = functionSource(
        'async function handleVerifyReviewCardHttp',
        'async function handleCancelConfirmHttp'
    )

    for (const pathSource of [retrySource, adminSource]) {
        assert.match(pathSource, /chargedBeinSpendLedger/)
        assert.match(pathSource, /spendLedgerAccountMismatch/)
        assert.match(pathSource, /FULFILLMENT_PROOF_CONFLICT/)
    }
})

test('live admin verification requires an active non-superseded baseline and mode-aware finalization', () => {
    const liveSource = functionSource(
        'async function handleVerifyReviewCardHttp',
        'async function handleCancelConfirmHttp'
    )

    assert.match(liveSource, /activeBaseline|non-superseded|supersededAt/)
    assert.match(liveSource, /verifyRenewalFulfillmentWithProvider/)
    assert.match(liveSource, /fulfillmentProofMode/)
    assert.doesNotMatch(liveSource, /CONTRACT_VERIFIED_SUCCESS[\s\S]{0,500}status: 'COMPLETED'/)
})
