import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { validateGateResult } = require('../../scripts/run-audit-gates.cjs')
const manifest = require('../../scripts/audit-gate-manifest.cjs')
test('T048 skipped, empty, failed or missing suites cannot become a green audit gate', () => {
    for (const stdout of ['', '# tests 0\n# fail 0', '# tests 1\n# fail 0\nok 1 # SKIP unavailable', '# tests 1\n# fail 1']) {
        assert.equal(validateGateResult({ status: 0, stdout }), false)
    }
    assert.equal(validateGateResult({ status: 1, stdout: '# tests 1\n# fail 0' }), false)
    assert.equal(validateGateResult({ status: 0, stdout: '# tests 1\n# fail 0\n# skipped 0' }), true)
    for (const group of Object.values(manifest) as Array<() => string[]>) assert.ok(group().length && group().every(existsSync))
})
