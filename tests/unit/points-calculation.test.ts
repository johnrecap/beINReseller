import test from 'node:test'
import assert from 'node:assert/strict'
import {
    calculateCashConversion,
    calculateSpendPoints,
    resolveOwnerRate,
    validatePointProgramSettings,
} from '@/lib/points/calculation'
import { summarizePointBalance } from '@/lib/points/balance'
import { getAgentCreditRequestRate } from '@/lib/credit-requests/points'

test('calculates spend points from operation amount with four decimal rounding', () => {
    assert.deepEqual(calculateSpendPoints({
        amountUsd: 125.55,
        pointsPerThousand: 3.3333,
    }), {
        points: 0.4185,
        amountUsdSnapshot: 125.55,
        ratePerThousandSnapshot: 3.3333,
    })
})

test('treats a zero owner override as an explicit zero rate', () => {
    assert.equal(resolveOwnerRate({
        defaultRate: 8,
        overrideRate: 0,
    }), 0)
})

test('legacy credit request rate lookup also preserves zero overrides', async () => {
    const rates = new Map([
        ['AGENT_OVERRIDE:agent-1', 0],
        ['AGENT_DEFAULT:GLOBAL', 8],
    ])
    const rate = await getAgentCreditRequestRate({
        pointRule: {
            async findFirst(args) {
                const key = `${args.where.ownerType}:${args.where.ownerUserId ?? 'GLOBAL'}`
                const value = rates.get(key)
                return value === undefined ? null : { pointsPerThousand: value }
            },
        },
    }, 'agent-1')

    assert.equal(rate, 0)
})

test('falls back to default rate only when no owner override exists', () => {
    assert.equal(resolveOwnerRate({
        defaultRate: 8,
        overrideRate: null,
    }), 8)
})

test('validates enabled point settings require start date and positive conversion ratio', () => {
    assert.deepEqual(validatePointProgramSettings({
        pointsEnabled: true,
        pointsStartAt: null,
        cashConversionPoints: 100,
        cashConversionAmountUsd: 10,
    }), { ok: false, reason: 'MISSING_START_DATE' })

    assert.deepEqual(validatePointProgramSettings({
        pointsEnabled: true,
        pointsStartAt: new Date('2026-05-25T10:00:00.000Z'),
        cashConversionPoints: 0,
        cashConversionAmountUsd: 10,
    }), { ok: false, reason: 'INVALID_CONVERSION_RATIO' })
})

test('calculates cash conversion from configured ratio', () => {
    assert.deepEqual(calculateCashConversion({
        pointsToConvert: 250,
        conversionPoints: 100,
        conversionAmountUsd: 10,
        availablePoints: 300,
    }), {
        ok: true,
        pointsConverted: 250,
        balanceAmountUsd: 25,
    })
})

test('rejects cash conversion when requested points exceed available points', () => {
    assert.deepEqual(calculateCashConversion({
        pointsToConvert: 301,
        conversionPoints: 100,
        conversionAmountUsd: 10,
        availablePoints: 300,
    }), { ok: false, reason: 'INSUFFICIENT_POINTS' })
})

test('summarizes spend-earned, converted, reversed, and legacy point totals separately', () => {
    const summary = summarizePointBalance([
        { sourceType: 'OPERATION_SPEND', status: 'AVAILABLE', points: 100 },
        { sourceType: 'EID_REWARD', status: 'AVAILABLE', points: 25 },
        { sourceType: 'POINT_CASH_REDEMPTION', status: 'REDEEMED', points: -30 },
        { sourceType: 'POINT_REVERSAL', status: 'REDEEMED', points: -20 },
        { sourceType: 'CREDIT_REQUEST', status: 'AVAILABLE', points: 50 },
    ])

    assert.deepEqual(summary, {
        available: 75,
        lifetimeEarned: 125,
        converted: 30,
        reversed: 20,
        legacy: 50,
    })
})
