import type { Role } from '@prisma/client'

export type ManagerUserBalanceErrorCode =
    | 'USER_NOT_FOUND'
    | 'USER_DELETED'
    | 'USER_NOT_MANAGED'
    | 'INVALID_TARGET_USER'
    | 'MANAGER_NOT_AVAILABLE'
    | 'DELETE_TARGET_CHANGED'
    | 'INSUFFICIENT_MANAGER_BALANCE'
    | 'INSUFFICIENT_USER_BALANCE'

export class ManagerUserBalanceError extends Error {
    readonly code: ManagerUserBalanceErrorCode
    readonly currentBalance: number | null

    constructor(code: ManagerUserBalanceErrorCode, currentBalance: number | null = null) {
        super(currentBalance === null ? code : `${code}:${currentBalance.toFixed(2)}`)
        this.name = 'ManagerUserBalanceError'
        this.code = code
        this.currentBalance = currentBalance
    }
}

type ManagedUserRecord = {
    id: string
    username: string
    role: string
    balance: number
    deletedAt: Date | string | null
}

type ManagerBalanceTx = {
    user: {
        findUnique(args: {
            where: { id: string }
            select: {
                id: true
                username: true
                role: true
                balance: true
                deletedAt: true
            }
        }): Promise<ManagedUserRecord | null>
    }
    managerUser: {
        findFirst(args: {
            where: { managerId: string; userId: string }
            select: { id: true }
        }): Promise<{ id: string } | null>
    }
}

type ManagerBalanceMutationTx = ManagerBalanceTx & {
    user: ManagerBalanceTx['user'] & {
        updateMany(args: {
            where: Record<string, unknown>
            data: Record<string, unknown>
        }): Promise<{ count: number }>
        findUniqueOrThrow(args: {
            where: { id: string }
            select: { balance: true }
        }): Promise<{ balance: number }>
    }
}

type BalanceMutationInput = {
    managerId: string
    userId: string
    amount: number
}

const MANAGER_BALANCE_WRITE_ROLES: Role[] = ['ADMIN', 'MANAGER']

export function buildManagerBalanceDebitWhere(managerId: string, amount: number) {
    return {
        ...buildManagerBalanceWriteWhere(managerId),
        balance: { gte: amount },
    }
}

export function buildManagerBalanceWriteWhere(managerId: string) {
    return {
        id: managerId,
        role: { in: [...MANAGER_BALANCE_WRITE_ROLES] },
        isActive: true,
        deletedAt: null,
    }
}

function buildManagedUserOwnershipWhere(managerId: string) {
    return {
        managerLink: { some: { managerId } },
    }
}

export function buildManagedUserBalanceDebitWhere(userId: string, managerId: string, amount: number) {
    return {
        id: userId,
        role: 'USER' as const,
        deletedAt: null,
        ...buildManagedUserOwnershipWhere(managerId),
        balance: { gte: amount },
    }
}

export function buildManagedUserBalanceCreditWhere(userId: string, managerId: string) {
    return {
        id: userId,
        role: 'USER' as const,
        deletedAt: null,
        ...buildManagedUserOwnershipWhere(managerId),
    }
}

export function buildManagedUserDeleteWhere(userId: string, managerId: string, balance: number) {
    return {
        id: userId,
        role: 'USER' as const,
        deletedAt: null,
        ...buildManagedUserOwnershipWhere(managerId),
        balance,
    }
}

function selectManagedUserBalanceRecord() {
    return {
        id: true,
        username: true,
        role: true,
        balance: true,
        deletedAt: true,
    } as const
}

async function findManagedUserBalanceRecord(tx: ManagerBalanceTx, userId: string) {
    return tx.user.findUnique({
        where: { id: userId },
        select: selectManagedUserBalanceRecord(),
    })
}

export async function assertManagedUserForBalanceMutation(
    tx: ManagerBalanceTx,
    input: { managerId: string; userId: string }
) {
    const targetUser = await findManagedUserBalanceRecord(tx, input.userId)

    if (!targetUser) {
        throw new ManagerUserBalanceError('USER_NOT_FOUND')
    }
    if (targetUser.deletedAt) {
        throw new ManagerUserBalanceError('USER_DELETED')
    }
    if (targetUser.role !== 'USER') {
        throw new ManagerUserBalanceError('INVALID_TARGET_USER')
    }

    const managerUserLink = await tx.managerUser.findFirst({
        where: {
            managerId: input.managerId,
            userId: input.userId,
        },
        select: { id: true },
    })

    if (!managerUserLink) {
        throw new ManagerUserBalanceError('USER_NOT_MANAGED')
    }

    return targetUser
}

async function depositManagerBalanceToUser(
    tx: ManagerBalanceMutationTx,
    input: BalanceMutationInput
) {
    const absAmount = Math.abs(input.amount)
    const managerDebit = await tx.user.updateMany({
        where: buildManagerBalanceDebitWhere(input.managerId, absAmount),
        data: { balance: { decrement: absAmount } },
    })

    if (managerDebit.count !== 1) {
        const currentManager = await findManagedUserBalanceRecord(tx, input.managerId)
        throw new ManagerUserBalanceError('INSUFFICIENT_MANAGER_BALANCE', currentManager?.balance ?? 0)
    }

    return {
        updatedManager: await tx.user.findUniqueOrThrow({
            where: { id: input.managerId },
            select: { balance: true },
        }),
        updatedUser: await creditManagedUserBalance(tx, input.userId, input.managerId, absAmount),
    }
}

async function creditManagedUserBalance(
    tx: ManagerBalanceMutationTx,
    userId: string,
    managerId: string,
    amount: number
) {
    const userCredit = await tx.user.updateMany({
        where: buildManagedUserBalanceCreditWhere(userId, managerId),
        data: { balance: { increment: amount } },
    })

    if (userCredit.count !== 1) {
        throw new ManagerUserBalanceError('USER_DELETED')
    }

    return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { balance: true },
    })
}

async function creditManagerBalance(
    tx: ManagerBalanceMutationTx,
    managerId: string,
    amount: number
) {
    const managerCredit = await tx.user.updateMany({
        where: buildManagerBalanceWriteWhere(managerId),
        data: { balance: { increment: amount } },
    })

    if (managerCredit.count !== 1) {
        throw new ManagerUserBalanceError('MANAGER_NOT_AVAILABLE')
    }

    return tx.user.findUniqueOrThrow({
        where: { id: managerId },
        select: { balance: true },
    })
}

async function withdrawManagedUserBalance(
    tx: ManagerBalanceMutationTx,
    input: BalanceMutationInput
) {
    const absAmount = Math.abs(input.amount)
    const userDebit = await tx.user.updateMany({
        where: buildManagedUserBalanceDebitWhere(input.userId, input.managerId, absAmount),
        data: { balance: { decrement: absAmount } },
    })

    if (userDebit.count !== 1) {
        const currentUser = await findManagedUserBalanceRecord(tx, input.userId)
        if (!currentUser) throw new ManagerUserBalanceError('USER_NOT_FOUND')
        if (currentUser.deletedAt) throw new ManagerUserBalanceError('USER_DELETED')
        if (currentUser.role !== 'USER') throw new ManagerUserBalanceError('INVALID_TARGET_USER')
        throw new ManagerUserBalanceError('INSUFFICIENT_USER_BALANCE', currentUser.balance)
    }

    return {
        updatedUser: await tx.user.findUniqueOrThrow({
            where: { id: input.userId },
            select: { balance: true },
        }),
        updatedManager: await creditManagerBalance(tx, input.managerId, absAmount),
    }
}

export async function applyManagerUserBalanceMutation(
    tx: ManagerBalanceMutationTx,
    input: BalanceMutationInput
) {
    const targetUser = await assertManagedUserForBalanceMutation(tx, input)
    const balances = input.amount > 0
        ? await depositManagerBalanceToUser(tx, input)
        : await withdrawManagedUserBalance(tx, input)

    return {
        targetUser,
        updatedUserBalance: balances.updatedUser.balance,
        updatedManagerBalance: balances.updatedManager.balance,
    }
}

export async function deleteManagedUserBalanceWithRefund(
    tx: ManagerBalanceMutationTx,
    input: { managerId: string; userId: string; deletedByUserId: string }
) {
    const targetUser = await assertManagedUserForBalanceMutation(tx, input)
    const refundedBalance = targetUser.balance

    const deletedUser = await tx.user.updateMany({
        where: buildManagedUserDeleteWhere(input.userId, input.managerId, refundedBalance),
        data: {
            deletedAt: new Date(),
            deletedBalance: refundedBalance,
            deletedByUserId: input.deletedByUserId,
            isActive: false,
            balance: 0,
        },
    })

    if (deletedUser.count !== 1) {
        throw new ManagerUserBalanceError('DELETE_TARGET_CHANGED')
    }

    const updatedManager = refundedBalance > 0
        ? await creditManagerBalance(tx, input.managerId, refundedBalance)
        : null

    return {
        targetUser,
        refundedBalance,
        updatedManagerBalance: updatedManager?.balance ?? null,
    }
}
