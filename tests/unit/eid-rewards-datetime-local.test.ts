import test from 'node:test'
import assert from 'node:assert/strict'
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/eid-rewards/datetime-local'

test('round-trips ISO instants through datetime-local without shifting the saved instant', () => {
    const savedIso = '2026-05-25T21:00:00.000Z'
    const localValue = toDateTimeLocalValue(savedIso)

    assert.match(localValue, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    assert.equal(fromDateTimeLocalValue(localValue), savedIso)
})

test('handles empty and invalid datetime-local values safely', () => {
    assert.equal(toDateTimeLocalValue(null), '')
    assert.equal(toDateTimeLocalValue('not-a-date'), '')
    assert.equal(fromDateTimeLocalValue(''), null)
    assert.equal(fromDateTimeLocalValue('not-a-date'), null)
})
