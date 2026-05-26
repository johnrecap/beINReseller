import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessPointsWallet } from '@/lib/points/access'

test('allows all point-owning account roles to access the points wallet', () => {
    assert.equal(canAccessPointsWallet('USER'), true)
    assert.equal(canAccessPointsWallet('AGENT'), true)
    assert.equal(canAccessPointsWallet('MANAGER'), true)
    assert.equal(canAccessPointsWallet('ADMIN'), true)
})

test('rejects non point-owning roles from the points wallet', () => {
    assert.equal(canAccessPointsWallet('TECH_SUPPORT'), false)
})
