import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildBalanceMovementReportWhere,
    buildBalanceMovementSummaryWheres,
    getBalanceMovementBucket,
    getBalanceMovementSource,
    parseBalanceMovementReportFilters,
} from '@/lib/balance-movements/report'

test('builds all balance increase filters by default without excluding point conversions', () => {
    const filters = parseBalanceMovementReportFilters(
        new URLSearchParams('range=custom&from=2026-06-10&to=2026-06-12')
    )
    const where = buildBalanceMovementReportWhere(filters)
    const clauses = where.AND as unknown[]

    assert.equal(filters.recipientRole, 'ALL')
    assert.equal(filters.actorRole, 'ALL')
    assert.ok(Array.isArray(clauses))
    assert.ok(clauses.some((entry) => JSON.stringify(entry) === JSON.stringify({ type: 'DEPOSIT' })))
    assert.ok(clauses.some((entry) => JSON.stringify(entry) === JSON.stringify({ amount: { gt: 0 } })))
    assert.ok(!clauses.some((entry) => JSON.stringify(entry).includes('pointCashRedemption')))
})

test('builds admin-to-manager filters with legacy manager report parameters', () => {
    const filters = parseBalanceMovementReportFilters(
        new URLSearchParams('report=manager&managerId=manager-1&actorRole=ADMIN')
    )
    const where = buildBalanceMovementReportWhere(filters)
    const clauses = where.AND as unknown[]

    assert.equal(filters.recipientRole, 'MANAGER')
    assert.equal(filters.recipientId, 'manager-1')
    assert.ok(clauses.some((entry) => JSON.stringify(entry) === JSON.stringify({ userId: 'manager-1' })))
    assert.ok(clauses.some((entry) => JSON.stringify(entry) === JSON.stringify({ admin: { is: { role: 'ADMIN', deletedAt: null } } })))
})

test('builds manager-to-user filters with current owner filters', () => {
    const filters = parseBalanceMovementReportFilters(
        new URLSearchParams('recipientRole=USER&actorRole=MANAGER&actorId=manager-1&ownerType=MANAGER&ownerId=manager-1&recipientId=user-1')
    )
    const where = buildBalanceMovementReportWhere(filters)
    const clauses = where.AND as unknown[]

    assert.equal(filters.recipientRole, 'USER')
    assert.equal(filters.actorRole, 'MANAGER')
    assert.equal(filters.actorId, 'manager-1')
    assert.ok(clauses.some((entry) => JSON.stringify(entry) === JSON.stringify({ userId: 'user-1' })))
    assert.ok(clauses.some((entry) => JSON.stringify(entry) === JSON.stringify({ adminId: 'manager-1' })))
    assert.ok(clauses.some((entry) => JSON.stringify(entry).includes('"managerId":"manager-1"')))
})

test('builds split summary wheres that count only recipient deposit rows', () => {
    const baseWhere = buildBalanceMovementReportWhere(parseBalanceMovementReportFilters(new URLSearchParams()))
    const splitWheres = buildBalanceMovementSummaryWheres(baseWhere)

    assert.ok(JSON.stringify(splitWheres.adminToManagers).includes('"role":"MANAGER"'))
    assert.ok(JSON.stringify(splitWheres.adminToManagers).includes('"role":"ADMIN"'))
    assert.ok(JSON.stringify(splitWheres.adminToUsers).includes('"role":"USER"'))
    assert.ok(JSON.stringify(splitWheres.managerToUsers).includes('"role":"MANAGER"'))
    assert.ok(!JSON.stringify(splitWheres.managerToUsers).includes('"WITHDRAW"'))
})

test('classifies balance movement sources from transaction evidence', () => {
    assert.deepEqual(getBalanceMovementSource({
        admin: { role: 'ADMIN', username: 'admin' },
        creditRequest: null,
        pointCashRedemption: null,
        notes: 'Opening balance by admin admin',
    }), {
        key: 'ADMIN_TOP_UP',
        label: 'Admin top-up by admin',
    })

    assert.deepEqual(getBalanceMovementSource({
        admin: { role: 'MANAGER', username: 'manager' },
        creditRequest: null,
        pointCashRedemption: null,
        notes: 'Initial balance from manager manager',
    }), {
        key: 'MANAGER_TRANSFER',
        label: 'Manager transfer by manager',
    })

    assert.equal(getBalanceMovementSource({
        admin: { role: 'ADMIN', username: 'admin' },
        creditRequest: null,
        pointCashRedemption: null,
        notes: 'Initial Balance',
    }).key, 'INITIAL_BALANCE_CORRECTION')

    assert.equal(getBalanceMovementSource({
        admin: null,
        creditRequest: { requestNumber: 'CR-7' },
        pointCashRedemption: null,
        notes: null,
    }).key, 'CREDIT_REQUEST_APPROVAL')

    assert.equal(getBalanceMovementSource({
        admin: null,
        creditRequest: null,
        pointCashRedemption: { id: 'redemption-1' },
        notes: null,
    }).key, 'POINT_CONVERSION')
})

test('maps source and actor evidence into report buckets', () => {
    assert.equal(getBalanceMovementBucket({
        recipientRole: 'MANAGER',
        actorRole: 'ADMIN',
        sourceKey: 'ADMIN_TOP_UP',
    }).key, 'ADMIN_TO_MANAGERS')

    assert.equal(getBalanceMovementBucket({
        recipientRole: 'USER',
        actorRole: 'ADMIN',
        sourceKey: 'ADMIN_TOP_UP',
    }).key, 'ADMIN_TO_USERS')

    assert.equal(getBalanceMovementBucket({
        recipientRole: 'USER',
        actorRole: 'MANAGER',
        sourceKey: 'MANAGER_TRANSFER',
    }).key, 'MANAGER_TO_USERS')

    assert.equal(getBalanceMovementBucket({
        recipientRole: 'USER',
        actorRole: 'ADMIN',
        sourceKey: 'CREDIT_REQUEST_APPROVAL',
    }).key, 'SYSTEM_INCREASES')

    assert.equal(getBalanceMovementBucket({
        recipientRole: 'USER',
        actorRole: null,
        sourceKey: 'LEGACY_DEPOSIT',
    }).key, 'SYSTEM_INCREASES')
})
