import test from 'node:test'
import assert from 'node:assert/strict'
import {
    parseOperationSpendCutoverArgs,
    parseOperationSpendAuditArgs,
} from '../../shared/points/operation-spend-release-commands'

test('snapshot cutover is dry-run by default', () => {
    assert.deepEqual(parseOperationSpendCutoverArgs([]), {
        ok: true,
        activate: false,
        confirmedRelease: null,
    })
})

test('snapshot cutover refuses activation without a release attestation', () => {
    assert.deepEqual(parseOperationSpendCutoverArgs(['--activate']), {
        ok: false,
        code: 'CONFIRMED_RELEASE_REQUIRED',
    })
    assert.deepEqual(parseOperationSpendCutoverArgs(['--confirmed-release=web-only']), {
        ok: false,
        code: 'ACTIVATE_FLAG_REQUIRED',
    })
})

test('snapshot cutover accepts an explicit non-empty compatible release id', () => {
    assert.deepEqual(parseOperationSpendCutoverArgs([
        '--activate',
        '--confirmed-release=release-2026-08-06.1',
    ]), {
        ok: true,
        activate: true,
        confirmedRelease: 'release-2026-08-06.1',
    })
})

test('snapshot cutover rejects unknown and duplicate command arguments', () => {
    assert.deepEqual(parseOperationSpendCutoverArgs(['--force']), {
        ok: false,
        code: 'UNKNOWN_ARGUMENT',
    })
    assert.deepEqual(parseOperationSpendCutoverArgs(['--activate', '--activate']), {
        ok: false,
        code: 'DUPLICATE_ARGUMENT',
    })
    assert.deepEqual(parseOperationSpendCutoverArgs(['--confirmed-release=']), {
        ok: false,
        code: 'INVALID_RELEASE_ID',
    })
    assert.deepEqual(parseOperationSpendCutoverArgs([
        '--activate',
        '--confirmed-release=release-a',
        '--confirmed-release=release-b',
    ]), {
        ok: false,
        code: 'DUPLICATE_ARGUMENT',
    })
})

test('audit bounds identifiers and defaults to a safe batch', () => {
    assert.deepEqual(parseOperationSpendAuditArgs([]), { ok: true, limit: 100 })
    assert.deepEqual(parseOperationSpendAuditArgs(['--limit=25']), { ok: true, limit: 25 })
    assert.deepEqual(parseOperationSpendAuditArgs(['--limit=0']), {
        ok: false,
        code: 'INVALID_LIMIT',
    })
    assert.deepEqual(parseOperationSpendAuditArgs(['--limit=1001']), {
        ok: false,
        code: 'INVALID_LIMIT',
    })
    assert.deepEqual(parseOperationSpendAuditArgs(['--apply']), {
        ok: false,
        code: 'UNKNOWN_ARGUMENT',
    })
    assert.deepEqual(parseOperationSpendAuditArgs(['--limit=5', '--limit=10']), {
        ok: false,
        code: 'INVALID_LIMIT',
    })
})
