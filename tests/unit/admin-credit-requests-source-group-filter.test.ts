import test from 'node:test'
import assert from 'node:assert/strict'
import {
    applyCreditRequestSourceGroupFilter,
    decodeCreditRequestSourceGroupOption,
    encodeCreditRequestSourceGroupOption,
    parseCreditRequestSourceGroupFilter,
    type CreditRequestSourceGroupSelection,
} from '@/lib/credit-requests/source-group-filter'

test('explicit NONE mode selects null snapshots without colliding with a real NONE group', () => {
    const withoutGroup = parseCreditRequestSourceGroupFilter({
        sourceGroup: null,
        sourceGroupMode: 'NONE',
    })
    const realNoneGroup = parseCreditRequestSourceGroupFilter({
        sourceGroup: 'NONE',
        sourceGroupMode: null,
    })

    assert.deepEqual(withoutGroup, {
        ok: true,
        selection: { mode: 'NONE' },
        where: { sourceGroupSnapshot: null },
    })
    assert.deepEqual(realNoneGroup, {
        ok: true,
        selection: { mode: 'VALUE', value: 'NONE' },
        where: { sourceGroupSnapshot: 'NONE' },
    })
})

test('invalid or conflicting source group modes are rejected', () => {
    for (const input of [
        { sourceGroup: null, sourceGroupMode: 'UNKNOWN' },
        { sourceGroup: 'VIP', sourceGroupMode: 'NONE' },
    ]) {
        const result = parseCreditRequestSourceGroupFilter(input)
        assert.equal(result.ok, false)
        if (!result.ok) assert.equal(result.code, 'INVALID_SOURCE_GROUP_FILTER')
    }
})

test('client option and query encoding preserve all, none, and literal group values', () => {
    const selections: CreditRequestSourceGroupSelection[] = [
        { mode: 'ALL' },
        { mode: 'NONE' },
        { mode: 'VALUE', value: 'NONE' },
        { mode: 'VALUE', value: 'Facebook / Retail' },
    ]

    for (const selection of selections) {
        const optionValue = encodeCreditRequestSourceGroupOption(selection)
        const decoded = decodeCreditRequestSourceGroupOption(optionValue)
        const params = new URLSearchParams()
        applyCreditRequestSourceGroupFilter(params, decoded)

        assert.deepEqual(decoded, selection)
        if (selection.mode === 'NONE') {
            assert.equal(params.get('sourceGroupMode'), 'NONE')
            assert.equal(params.has('sourceGroup'), false)
        } else if (selection.mode === 'VALUE') {
            assert.equal(params.get('sourceGroup'), selection.value)
            assert.equal(params.has('sourceGroupMode'), false)
        } else {
            assert.equal(params.has('sourceGroup'), false)
            assert.equal(params.has('sourceGroupMode'), false)
        }
    }
})
