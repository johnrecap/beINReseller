import test from 'node:test'
import assert from 'node:assert/strict'
import {
    EGYPT_TIME_ZONE,
    cairoDateInputToUtcIso,
    cairoDateRangeToUtcIso,
    cairoDateTimeLocalToUtcIso,
    cairoLocalRangeToUtcIso,
    utcIsoToCairoDateInput,
    utcIsoToCairoDateTimeLocal,
} from '@/lib/egypt-time'

test('formats UTC instants as Egypt datetime-local values', () => {
    assert.equal(EGYPT_TIME_ZONE, 'Africa/Cairo')
    assert.equal(utcIsoToCairoDateTimeLocal('2026-05-26T18:00:00.000Z'), '2026-05-26T21:00')
})

test('parses Egypt datetime-local values into UTC instants', () => {
    assert.equal(cairoDateTimeLocalToUtcIso('2026-05-26T21:00'), '2026-05-26T18:00:00.000Z')
})

test('builds Egypt day boundaries for date inputs', () => {
    assert.equal(utcIsoToCairoDateInput('2026-05-25T21:30:00.000Z'), '2026-05-26')
    assert.equal(cairoDateInputToUtcIso('2026-05-26', 'start'), '2026-05-25T21:00:00.000Z')
    assert.equal(cairoDateInputToUtcIso('2026-05-26', 'end'), '2026-05-26T20:59:59.999Z')
    assert.deepEqual(cairoDateRangeToUtcIso('2026-05-26', '2026-05-27'), {
        from: '2026-05-25T21:00:00.000Z',
        to: '2026-05-27T20:59:59.999Z',
    })
})

test('builds Cairo local ranges with selected minute boundaries', () => {
    assert.deepEqual(cairoLocalRangeToUtcIso('2026-05-26T14:30', '2026-05-26T15:45'), {
        from: '2026-05-26T11:30:00.000Z',
        to: '2026-05-26T12:45:59.999Z',
    })
})

test('uses inclusive UTC instants for repeated Cairo fallback minutes', () => {
    assert.deepEqual(cairoLocalRangeToUtcIso('2026-10-29T23:30', '2026-10-29T23:30'), {
        from: '2026-10-29T20:30:00.000Z',
        to: '2026-10-29T21:30:59.999Z',
    })
})

test('builds mixed Cairo local ranges for date-only and datetime-local inputs', () => {
    assert.deepEqual(cairoLocalRangeToUtcIso('2026-05-26', '2026-05-27T02:05'), {
        from: '2026-05-25T21:00:00.000Z',
        to: '2026-05-26T23:05:59.999Z',
    })
    assert.deepEqual(cairoLocalRangeToUtcIso('2026-05-26T23:58', '2026-05-27'), {
        from: '2026-05-26T20:58:00.000Z',
        to: '2026-05-27T20:59:59.999Z',
    })
})

test('handles empty and invalid values safely', () => {
    assert.equal(utcIsoToCairoDateTimeLocal(null), '')
    assert.equal(utcIsoToCairoDateTimeLocal('not-a-date'), '')
    assert.equal(cairoDateTimeLocalToUtcIso(''), null)
    assert.equal(cairoDateTimeLocalToUtcIso('not-a-date'), null)
    assert.equal(utcIsoToCairoDateInput(null), '')
    assert.equal(cairoDateInputToUtcIso('', 'start'), null)
    assert.deepEqual(cairoLocalRangeToUtcIso('', 'not-a-date'), { from: null, to: null })
})
