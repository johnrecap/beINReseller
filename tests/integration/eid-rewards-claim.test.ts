import test from 'node:test'
import assert from 'node:assert/strict'

test('documents Eid claim API contract without frontend-selected points', () => {
    const requestBody = {}
    const response = {
        success: true,
        claim: {
            id: 'claim-1',
            points: 250,
            moneyValue: 25,
            claimDate: '2026-05-26',
            eventKey: 'eid-2026',
        },
        pointsBalance: 250,
        conversion: {
            enabled: true,
            points: 100,
            amount: 10,
            previewAmount: 25,
            currencyLabel: 'USD',
        },
    }

    assert.equal('points' in requestBody, false)
    assert.equal(response.claim.points, 250)
    assert.equal('probabilityWeight' in response, false)
})
