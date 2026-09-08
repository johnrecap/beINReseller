import { createHash } from 'node:crypto'
import { canonicalJson } from '../../../shared/operations/package-quote'
import { finalizeManualRenewalFulfillment, type ManualFulfillmentFinalizationEvidence } from './manual-fulfillment-finalization'

/** Legacy execution uses the shared invoice claimant and manual authority.
 * It does not fabricate a FINAL_OK timestamp or automated verification. */
export async function finalizeLegacyReview(input: {
    operationId: string; actorUsername: string; decisionNote: string
    evidence: ManualFulfillmentFinalizationEvidence; decisionKey: string; sourceReference: string
}) {
    const decisionKey = input.decisionKey.trim()
    const sourceReference = input.sourceReference.trim()
    if (!decisionKey || decisionKey.length > 200 || !sourceReference || sourceReference.length > 500 ||
        !(input.evidence.observedAt instanceof Date) || !Number.isFinite(input.evidence.observedAt.getTime())) {
        return { status: 'INVALID_EVIDENCE' as const }
    }
    const fingerprint = createHash('sha256').update(canonicalJson({
        operationId: input.operationId, note: input.decisionNote.trim(), sourceReference,
        evidence: { ...input.evidence, observedAt: input.evidence.observedAt.toISOString() },
    })).digest('hex')
    return finalizeManualRenewalFulfillment({ ...input, providerPaymentState: 'UNKNOWN',
        legacyDecision: { decisionKey, sourceReference, payloadFingerprint: fingerprint } })
}
