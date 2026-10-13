import type { PrismaClient } from '@prisma/client'

// Persist a fixture accepted by the previous release, before creation was retired.
// This is test setup, not an application command or a replacement unlock API.
export async function seedHistoricalCardRelease(db: PrismaClient, input: {
    operationIds: string[]; actorId: string; note: string; decisionKey: string
}) {
    return db.$transaction(async tx => {
        const op = await tx.operation.findUniqueOrThrow({ where: { id: input.operationIds[0] } })
        const release = await tx.cardAdministrativeRelease.create({ data: {
            actorId: input.actorId, note: input.note, decisionKey: input.decisionKey,
            cardNumber: op.cardNumber, fingerprint: 'a'.repeat(64),
        } })
        for (const id of input.operationIds) {
            await tx.operation.update({ where: { id }, data: { administrativeReleaseId: release.id,
                administrativeStopRequestedAt: release.requestedAt } })
            await tx.operationReviewAdjudication.create({ data: { operationId: id, actorId: input.actorId,
                decisionKey: `${release.id}:${id}`, payloadFingerprint: release.fingerprint,
                decisionKind: 'ADMIN_ARCHIVE_AND_UNLOCK_CARD', classification: 'ADMINISTRATIVE_ARCHIVE',
                normalizedEvidence: { operationId: id }, sourceReference: release.id, observedAt: release.requestedAt,
                reasonCode: 'ADMIN_ACCEPTED_UNRESOLVED_FINANCIAL_RESULT', decisionNote: input.note } })
        }
        return release
    })
}
