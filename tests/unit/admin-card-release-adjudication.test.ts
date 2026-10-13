import { seedHistoricalCardRelease } from '../helpers/historical-card-release'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Prisma } from '@prisma/client'
import { openPglitePrisma } from '../helpers/pglite-prisma'
import { completeCardRelease, administrativeReleaseDiagnostic } from '../../shared/operations/admin-card-release'

test('administrative archive accepts the original migrated adjudication table', async () => {
    const f = await openPglitePrisma({ adjudicationSchema: 'legacy' })
    try {
        const admin = await f.db.user.create({ data: { username: 'migrated-admin', email: 'migrated@example.test', passwordHash: 'test', role: 'ADMIN' } })
        const operation = await f.db.operation.create({ data: { id: 'migrated-review', cardNumber: '7000000011', type: 'RENEW', status: 'REVIEW_REQUIRED', amount: 0 } })
        const input = { operationIds: [operation.id], actorId: admin.id, note: 'Archive original migrated review',
            decisionKey: 'migrated-adjudication-request' }
        await assert.rejects(seedHistoricalCardRelease(f.db, input), error => {
            const diagnostic = administrativeReleaseDiagnostic(error)
            assert.equal(diagnostic.databaseCode, '23514')
            assert.equal(diagnostic.constraint, 'operation_review_adjudications_check_2')
            return true
        })
        assert.equal(await f.db.cardAdministrativeRelease.count(), 0)
        assert.equal((await f.db.operation.findUniqueOrThrow({ where: { id: operation.id } })).administrativeStopRequestedAt, null)
        await f.engine.exec(readFileSync('prisma/migrations/20261013200000_admin_card_release_adjudication/migration.sql', 'utf8'))
        const saved = await seedHistoricalCardRelease(f.db, input)
        assert.ok(saved.id)
        assert.equal((await completeCardRelease(f.db, saved.id)).state, 'COMPLETED')
        const audit = await f.db.operationReviewAdjudication.findFirstOrThrow({ where: { operationId: operation.id } })
        assert.equal(audit.classification, 'ADMINISTRATIVE_ARCHIVE')
        assert.equal(audit.decisionKind, 'ADMIN_ARCHIVE_AND_UNLOCK_CARD')
        assert.ok(audit.normalizedEvidence)
        const originalAudit = { ...audit, id: undefined, normalizedEvidence: audit.normalizedEvidence as Prisma.InputJsonValue }
        for (const classification of ['MODERN_RENEWAL', 'PRE_MUTATION', 'INSTALLMENT', 'LEGACY_RECONCILABLE', 'LEGACY_EVIDENCE_HOLD', 'CONFLICT']) {
            await f.db.operationReviewAdjudication.create({ data: { ...originalAudit, classification, decisionKey: `legacy-${classification}` } })
        }
        await assert.rejects(f.db.operationReviewAdjudication.create({ data: { ...originalAudit, classification: 'UNKNOWN_CLASSIFICATION', decisionKey: 'invalid-classification' } }), /operation_review_adjudications_check_2/)
        await assert.rejects(f.db.operationReviewAdjudication.create({ data: { ...originalAudit, decisionKind: 'REFUND_CUSTOMER', decisionKey: 'invalid-archive-decision' } }), /operation_review_adjudications_check_2/)
        await assert.rejects(f.db.operationReviewAdjudication.update({ where: { id: audit.id }, data: { decisionNote: 'changed audit' } }), /AUDIT_EVIDENCE_IMMUTABLE/)
        assert.equal(await f.db.transaction.count(), 0)
    } finally { await f.close() }
})
