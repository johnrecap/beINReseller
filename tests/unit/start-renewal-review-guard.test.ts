import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('start renewal blocks cards with unresolved review operations', () => {
    const source = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'operations', 'start-renewal', 'route.ts'),
        'utf8'
    )

    assert.match(source, /const UNRESOLVED_REVIEW_STATUS = 'REVIEW_REQUIRED' as const/)
    assert.match(source, /status: UNRESOLVED_REVIEW_STATUS/)
    assert.match(source, /unresolved review operation/)
})
