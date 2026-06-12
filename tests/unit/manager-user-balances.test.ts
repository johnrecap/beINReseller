import test from 'node:test'
import assert from 'node:assert/strict'
import {
    applyManagerUserBalanceMutation,
    assertManagedUserForBalanceMutation,
    buildManagerBalanceDebitWhere,
    buildManagerBalanceWriteWhere,
    buildManagedUserBalanceDebitWhere,
    buildManagedUserBalanceCreditWhere,
    buildManagedUserDeleteWhere,
    deleteManagedUserBalanceWithRefund,
} from '@/lib/manager-user-balances'

type FakeUser = {
    id: string
    username: string
    role: string
    balance: number
    deletedAt: Date | null
    isActive?: boolean
    deletedBalance?: number | null
    deletedByUserId?: string | null
}

function createFakeTx(input: {
    manager?: Partial<FakeUser>
    user?: Partial<FakeUser>
    link?: boolean
    beforeUserUpdateMany?: (where: unknown) => void
}) {
    const manager: FakeUser = {
        id: 'manager-1',
        username: 'manager',
        role: 'MANAGER',
        balance: 100,
        deletedAt: null,
        isActive: true,
        ...input.manager,
    }
    const user: FakeUser = {
        id: 'user-1',
        username: 'user',
        role: 'USER',
        balance: 10,
        deletedAt: null,
        isActive: true,
        deletedBalance: null,
        deletedByUserId: null,
        ...input.user,
    }
    const users = new Map<string, FakeUser>([
        [manager.id, manager],
        [user.id, user],
    ])
    const linkActive = input.link !== false

    const matchesWhere = (record: FakeUser | undefined, where: Record<string, unknown>) => {
        if (!record) return false
        if (where.id !== undefined && where.id !== record.id) return false
        if (typeof where.role === 'string' && where.role !== record.role) return false
        if (where.role && typeof where.role === 'object' && 'in' in where.role) {
            const allowedRoles = where.role.in as string[]
            if (!allowedRoles.includes(record.role)) return false
        }
        if (where.isActive !== undefined && where.isActive !== record.isActive) return false
        if (where.deletedAt === null && record.deletedAt !== null) return false
        const managerLink = where.managerLink
        if (managerLink && typeof managerLink === 'object' && 'some' in managerLink) {
            const some = managerLink.some as { managerId?: string }
            if (!linkActive || some.managerId !== manager.id || record.id !== user.id) return false
        }
        const balance = where.balance
        if (typeof balance === 'number' && record.balance !== balance) return false
        if (balance && typeof balance === 'object' && 'gte' in balance && record.balance < Number(balance.gte)) return false
        if (balance && typeof balance === 'object' && 'gt' in balance && record.balance <= Number(balance.gt)) return false
        return true
    }

    const applyData = (record: FakeUser, data: Record<string, unknown>) => {
        const balance = data.balance
        if (balance && typeof balance === 'object' && 'decrement' in balance) {
            record.balance -= Number(balance.decrement)
        } else if (balance && typeof balance === 'object' && 'increment' in balance) {
            record.balance += Number(balance.increment)
        } else if (typeof balance === 'number') {
            record.balance = balance
        }
        if ('deletedAt' in data) record.deletedAt = data.deletedAt as Date
        if ('deletedBalance' in data) record.deletedBalance = data.deletedBalance as number
        if ('deletedByUserId' in data) record.deletedByUserId = data.deletedByUserId as string
        if ('isActive' in data) record.isActive = data.isActive as boolean
    }

    const tx = {
        user: {
            findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
            findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
                const record = users.get(where.id)
                if (!record) throw new Error('not found')
                return record
            },
            updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                input.beforeUserUpdateMany?.(where)
                const record = users.get(String(where.id))
                if (!matchesWhere(record, where)) return { count: 0 }
                applyData(record!, data)
                return { count: 1 }
            },
            update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const record = users.get(where.id)
                if (!record) throw new Error('not found')
                applyData(record, data)
                return record
            },
        },
        managerUser: {
            findFirst: async ({ where }: { where: { managerId: string; userId: string } }) => (
                !linkActive || where.managerId !== manager.id || where.userId !== user.id
                    ? null
                    : { id: 'link-1' }
            ),
        },
    }

    return { tx, manager, user }
}

test('manager deposit guard only matches when manager has enough balance', () => {
    assert.deepEqual(buildManagerBalanceDebitWhere('manager-1', 100), {
        id: 'manager-1',
        role: { in: ['ADMIN', 'MANAGER'] },
        isActive: true,
        deletedAt: null,
        balance: { gte: 100 },
    })
})

test('manager credit guard requires an active manager-like account', () => {
    assert.deepEqual(buildManagerBalanceWriteWhere('manager-1'), {
        id: 'manager-1',
        role: { in: ['ADMIN', 'MANAGER'] },
        isActive: true,
        deletedAt: null,
    })
})

test('user withdrawal guard requires active managed user balance', () => {
    assert.deepEqual(buildManagedUserBalanceDebitWhere('user-1', 'manager-1', 75), {
        id: 'user-1',
        role: 'USER',
        deletedAt: null,
        managerLink: { some: { managerId: 'manager-1' } },
        balance: { gte: 75 },
    })
})

test('user credit guard requires the user to still belong to the manager', () => {
    assert.deepEqual(buildManagedUserBalanceCreditWhere('user-1', 'manager-1'), {
        id: 'user-1',
        role: 'USER',
        deletedAt: null,
        managerLink: { some: { managerId: 'manager-1' } },
    })
})

test('delete guard matches the exact captured balance before refunding manager', () => {
    assert.deepEqual(buildManagedUserDeleteWhere('user-1', 'manager-1', 63.27), {
        id: 'user-1',
        role: 'USER',
        deletedAt: null,
        managerLink: { some: { managerId: 'manager-1' } },
        balance: 63.27,
    })
})

test('in-transaction ownership guard rejects non-user targets', async () => {
    const tx = {
        user: {
            findUnique: async () => ({
                id: 'agent-1',
                username: 'agent',
                role: 'AGENT',
                balance: 0,
                deletedAt: null,
            }),
        },
        managerUser: {
            findFirst: async () => ({ id: 'link-1' }),
        },
    }

    await assert.rejects(
        () => assertManagedUserForBalanceMutation(tx, {
            managerId: 'manager-1',
            userId: 'agent-1',
        }),
        /INVALID_TARGET_USER/
    )
})

test('rejects deposit above manager balance before crediting user', async () => {
    const { tx, manager, user } = createFakeTx({
        manager: { balance: 100 },
        user: { balance: 10 },
    })

    await assert.rejects(
        () => applyManagerUserBalanceMutation(tx, {
            managerId: manager.id,
            userId: user.id,
            amount: 101,
        }),
        /INSUFFICIENT_MANAGER_BALANCE/
    )

    assert.equal(manager.balance, 100)
    assert.equal(user.balance, 10)
})

test('guarded manager debit prevents sequential double spend beyond manager balance', async () => {
    const { tx, manager, user } = createFakeTx({
        manager: { balance: 100 },
        user: { balance: 0 },
    })

    await applyManagerUserBalanceMutation(tx, {
        managerId: manager.id,
        userId: user.id,
        amount: 70,
    })
    await assert.rejects(
        () => applyManagerUserBalanceMutation(tx, {
            managerId: manager.id,
            userId: user.id,
            amount: 70,
        }),
        /INSUFFICIENT_MANAGER_BALANCE/
    )

    assert.equal(manager.balance, 30)
    assert.equal(user.balance, 70)
})

test('rejects non-owned target before moving either balance', async () => {
    const { tx, manager, user } = createFakeTx({
        manager: { balance: 100 },
        user: { balance: 5 },
        link: false,
    })

    await assert.rejects(
        () => applyManagerUserBalanceMutation(tx, {
            managerId: manager.id,
            userId: user.id,
            amount: 20,
        }),
        /USER_NOT_MANAGED/
    )

    assert.equal(manager.balance, 100)
    assert.equal(user.balance, 5)
})

test('rejects withdrawal above user balance before crediting manager', async () => {
    const { tx, manager, user } = createFakeTx({
        manager: { balance: 100 },
        user: { balance: 10 },
    })

    await assert.rejects(
        () => applyManagerUserBalanceMutation(tx, {
            managerId: manager.id,
            userId: user.id,
            amount: -11,
        }),
        /INSUFFICIENT_USER_BALANCE/
    )

    assert.equal(manager.balance, 100)
    assert.equal(user.balance, 10)
})

test('delete refund aborts when user balance changes after capture', async () => {
    let raceApplied = false
    const { tx, manager, user } = createFakeTx({
        manager: { balance: 100 },
        user: { balance: 25 },
        beforeUserUpdateMany: (where) => {
            if (!raceApplied && typeof where === 'object' && where && 'balance' in where) {
                raceApplied = true
                user.balance = 0
            }
        },
    })

    await assert.rejects(
        () => deleteManagedUserBalanceWithRefund(tx, {
            managerId: manager.id,
            userId: user.id,
            deletedByUserId: manager.id,
        }),
        /DELETE_TARGET_CHANGED/
    )

    assert.equal(manager.balance, 100)
    assert.equal(user.deletedAt, null)
})

test('in-transaction ownership guard rejects users outside the manager', async () => {
    const tx = {
        user: {
            findUnique: async () => ({
                id: 'user-1',
                username: 'user',
                role: 'USER',
                balance: 0,
                deletedAt: null,
            }),
        },
        managerUser: {
            findFirst: async () => null,
        },
    }

    await assert.rejects(
        () => assertManagedUserForBalanceMutation(tx, {
            managerId: 'manager-1',
            userId: 'user-1',
        }),
        /USER_NOT_MANAGED/
    )
})
