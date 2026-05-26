import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('root layout does not depend on Google font downloads during build', () => {
    const layoutSource = readFileSync('src/app/layout.tsx', 'utf8')

    assert.equal(layoutSource.includes('next/font/google'), false)
})
