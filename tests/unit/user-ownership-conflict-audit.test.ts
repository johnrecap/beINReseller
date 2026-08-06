import test from 'node:test'
import assert from 'node:assert/strict'
import { parseUserOwnershipConflictAuditArgs } from '../../shared/db/user-ownership-conflict-audit'

test('ownership conflict audit uses a bounded default sample', () => {
    assert.deepEqual(parseUserOwnershipConflictAuditArgs([]), { ok: true, limit: 100 })
})

test('ownership conflict audit accepts only safe bounded limits', () => {
    assert.deepEqual(parseUserOwnershipConflictAuditArgs(['--limit=25']), { ok: true, limit: 25 })
    assert.deepEqual(parseUserOwnershipConflictAuditArgs(['--limit=0']), {
        ok: false,
        code: 'INVALID_LIMIT',
    })
    assert.deepEqual(parseUserOwnershipConflictAuditArgs(['--limit=1001']), {
        ok: false,
        code: 'INVALID_LIMIT',
    })
    assert.deepEqual(parseUserOwnershipConflictAuditArgs(['--apply']), {
        ok: false,
        code: 'UNKNOWN_ARGUMENT',
    })
})
