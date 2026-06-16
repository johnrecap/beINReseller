import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const routeSource = () => readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'admin', 'financial-review', '[operationId]', 'verify-card', 'route.ts'),
    'utf8'
)

test('financial review live card check uses one pending timestamp while polling worker result', () => {
    const source = routeSource()

    assert.match(source, /const checkedAt = new Date\(\)\.toISOString\(\)/)
    assert.match(source, /const check = \{[\s\S]*checkedAt,[\s\S]*\}/)
    assert.doesNotMatch(source, /const check = \{[\s\S]*checkedAt: new Date\(\)\.toISOString\(\),[\s\S]*\}/)
    assert.match(source, /latest\?\.checkedAt && latest\.checkedAt !== checkedAt/)
})
