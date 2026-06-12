import test from 'node:test'
import assert from 'node:assert/strict'
import {
    formatBeinDealerBalanceUsd,
    sumBeinDealerBalances,
} from '@/lib/admin/bein-account-balances'

test('sums persisted beIN balances for active and inactive accounts only when finite', () => {
    const accounts = [
        { dealerBalance: 100, isActive: true },
        { dealerBalance: 229.501, isActive: false },
        { dealerBalance: null, isActive: true },
        { dealerBalance: undefined, isActive: false },
        { dealerBalance: Number.NaN, isActive: true },
        { dealerBalance: Number.POSITIVE_INFINITY, isActive: true },
    ]
    const totalBalance = sumBeinDealerBalances(accounts)

    assert.equal(totalBalance, 329.501)
})

test('formats beIN balances as USD without forcing trailing zero decimals', () => {
    assert.equal(formatBeinDealerBalanceUsd(100), '100 USD')
    assert.equal(formatBeinDealerBalanceUsd(631.639), '631.639 USD')
})
