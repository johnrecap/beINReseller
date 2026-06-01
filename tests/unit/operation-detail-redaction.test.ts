import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildChargedBeinAccountAudit,
    redactOperationResponseData,
} from '@/lib/operation-detail-audit'

test('redacts session and provider secrets from operation response data', () => {
    const redacted = redactOperationResponseData({
        ok: true,
        password: 'secret',
        totpSecret: 'totp',
        providerToken: 'provider',
        nested: {
            cookies: ['cookie'],
            __VIEWSTATE: 'view-state',
            safe: 'value',
        },
    }) as Record<string, unknown>

    assert.equal(redacted.ok, true)
    assert.equal('password' in redacted, false)
    assert.equal('totpSecret' in redacted, false)
    assert.equal('providerToken' in redacted, false)
    assert.deepEqual(redacted.nested, { safe: 'value' })
})

test('prefers confirmed ledger account evidence over operation account fallback', () => {
    const chargedAt = new Date('2026-05-25T10:00:00.000Z')
    const audit = buildChargedBeinAccountAudit({
        chargedBeinSpendLedger: {
            id: 'ledger-1',
            beinAccountId: 'charged-account',
            beinUsernameSnapshot: 'charged@example.test',
            beinLabelSnapshot: 'Charged',
            spendAmount: 145,
            dealerBalanceBefore: 500,
            dealerBalanceAfter: 355,
            chargedAt,
            evidenceSource: 'BALANCE_DELTA',
        },
        beinAccount: {
            id: 'operation-account',
            username: 'operation@example.test',
            label: 'Operation',
        },
    }, true)

    assert.deepEqual(audit, {
        ledgerId: 'ledger-1',
        beinAccountId: 'charged-account',
        username: 'charged@example.test',
        label: 'Charged',
        spendAmount: 145,
        dealerBalanceBefore: 500,
        dealerBalanceAfter: 355,
        chargedAt,
        evidenceSource: 'BALANCE_DELTA',
    })
})

test('hides confirmed beIN account evidence from non-admin operation owners', () => {
    const audit = buildChargedBeinAccountAudit({
        chargedBeinSpendLedger: {
            id: 'ledger-1',
            beinAccountId: 'charged-account',
            beinUsernameSnapshot: 'charged@example.test',
            beinLabelSnapshot: 'Charged',
            spendAmount: 145,
            dealerBalanceBefore: 500,
            dealerBalanceAfter: 355,
            chargedAt: new Date('2026-05-25T10:00:00.000Z'),
            evidenceSource: 'BALANCE_DELTA',
        },
        beinAccount: null,
    }, false)

    assert.equal(audit, null)
})

test('returns operation account fallback only for admins', () => {
    const source = {
        chargedBeinSpendLedger: null,
        beinAccount: {
            id: 'operation-account',
            username: 'operation@example.test',
            label: 'Operation',
        },
    }

    assert.deepEqual(buildChargedBeinAccountAudit(source, true), {
        ledgerId: null,
        beinAccountId: 'operation-account',
        username: 'operation@example.test',
        label: 'Operation',
        spendAmount: null,
        dealerBalanceBefore: null,
        dealerBalanceAfter: null,
        chargedAt: null,
        evidenceSource: 'OPERATION_ACCOUNT',
    })
    assert.equal(buildChargedBeinAccountAudit(source, false), null)
})
