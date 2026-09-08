import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAuditOwner } from '../../shared/operations/audit-financial-context'
test('provider owner is exactly one immutable operation owner', () => {
    assert.deepEqual(resolveAuditOwner({ customerId: 'customer' }), { kind: 'CUSTOMER', id: 'customer' })
    assert.throws(() => resolveAuditOwner({ userId: 'reseller' }, { customerId: 'customer' }), /CONFLICT/)
    assert.throws(() => resolveAuditOwner({ userId: 'reseller', customerId: 'customer' }), /INVALID/)
})
