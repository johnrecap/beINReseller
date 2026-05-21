/**
 * Auto-refund REVIEW_REQUIRED operations that have clear evidence beIN was not charged.
 *
 * Usage:
 *   npx tsx scripts/refund-safe-review-not-charged.ts --dry-run
 *   npx tsx scripts/refund-safe-review-not-charged.ts --apply
 *
 * A review item is considered safe to refund only when:
 * - operation is still REVIEW_REQUIRED
 * - no confirmed beIN spend ledger exists
 * - beIN balance before/after are both readable
 * - beIN balance did not decrease
 * - customer/user was charged
 * - no prior refund exists
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import 'dotenv/config'

const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 100) : 500

type JsonRecord = Record<string, unknown>

function parseJsonRecord(value: unknown): JsonRecord {
    if (!value) return {}
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value) as unknown
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : {}
        } catch {
            return {}
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function getAuditSnapshot(responseData: unknown): JsonRecord {
    const response = parseJsonRecord(responseData)
    const snapshot = response.auditSnapshot
    return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot as JsonRecord : {}
}

function toNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function hasTransaction(transactions: Array<{ type: string }>, type: string) {
    return transactions.some((transaction) => transaction.type === type)
}

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    let scanned = 0
    let eligible = 0
    let refunded = 0
    let skipped = 0

    try {
        const operations = await prisma.operation.findMany({
            where: {
                status: 'REVIEW_REQUIRED',
                amount: { gt: 0 },
                chargedBeinSpendLedger: null,
            },
            orderBy: { updatedAt: 'asc' },
            take: limit,
            select: {
                id: true,
                userId: true,
                customerId: true,
                amount: true,
                responseData: true,
                responseMessage: true,
                transactions: { select: { type: true } },
            },
        })

        for (const operation of operations) {
            scanned++
            const snapshot = getAuditSnapshot(operation.responseData)
            const before = toNumber(snapshot.beinBalanceBefore)
            const after = toNumber(snapshot.beinBalanceAfter)
            const userDeducted = hasTransaction(operation.transactions, 'OPERATION_DEDUCT')
            const userRefunded = hasTransaction(operation.transactions, 'REFUND')

            if (before === null || after === null || after < before) {
                skipped++
                continue
            }

            if (operation.userId && (!userDeducted || userRefunded)) {
                skipped++
                continue
            }

            eligible++
            console.log(`${apply ? 'Refunding' : 'Would refund'} ${operation.id}: beIN ${before} -> ${after}, amount=${operation.amount}`)

            if (!apply) continue

            await prisma.$transaction(async (tx) => {
                const lockedOperation = await tx.operation.findUnique({
                    where: { id: operation.id },
                    select: {
                        id: true,
                        status: true,
                        userId: true,
                        customerId: true,
                        amount: true,
                        responseData: true,
                        chargedBeinSpendLedger: { select: { id: true } },
                        transactions: { select: { type: true } },
                    },
                })

                if (!lockedOperation || lockedOperation.status !== 'REVIEW_REQUIRED') return
                if (lockedOperation.chargedBeinSpendLedger) return

                const latestSnapshot = getAuditSnapshot(lockedOperation.responseData)
                const latestBefore = toNumber(latestSnapshot.beinBalanceBefore)
                const latestAfter = toNumber(latestSnapshot.beinBalanceAfter)
                if (latestBefore === null || latestAfter === null || latestAfter < latestBefore) return

                if (lockedOperation.userId) {
                    if (!hasTransaction(lockedOperation.transactions, 'OPERATION_DEDUCT')) return
                    if (hasTransaction(lockedOperation.transactions, 'REFUND')) return

                    const updatedUser = await tx.user.update({
                        where: { id: lockedOperation.userId },
                        data: { balance: { increment: lockedOperation.amount } },
                        select: { balance: true },
                    })

                    await tx.transaction.create({
                        data: {
                            userId: lockedOperation.userId,
                            type: 'REFUND',
                            amount: lockedOperation.amount,
                            balanceAfter: updatedUser.balance,
                            operationId: lockedOperation.id,
                            notes: 'Auto-refund: beIN balance did not decrease during review cleanup',
                        },
                    })
                } else if (lockedOperation.customerId) {
                    const existingRefund = await tx.walletTransaction.findFirst({
                        where: {
                            customerId: lockedOperation.customerId,
                            referenceId: lockedOperation.id,
                            referenceType: 'REFUND',
                        },
                        select: { id: true },
                    })
                    if (existingRefund) return

                    const updatedCustomer = await tx.customer.update({
                        where: { id: lockedOperation.customerId },
                        data: { walletBalance: { increment: lockedOperation.amount } },
                        select: { walletBalance: true },
                    })

                    await tx.walletTransaction.create({
                        data: {
                            customerId: lockedOperation.customerId,
                            type: 'REFUND',
                            amount: lockedOperation.amount,
                            balanceBefore: updatedCustomer.walletBalance - lockedOperation.amount,
                            balanceAfter: updatedCustomer.walletBalance,
                            description: 'Auto-refund: beIN balance did not decrease during review cleanup',
                            referenceType: 'REFUND',
                            referenceId: lockedOperation.id,
                        },
                    })
                } else {
                    return
                }

                await tx.operation.update({
                    where: { id: lockedOperation.id },
                    data: {
                        status: 'FAILED',
                        responseMessage: `Auto-refunded from review: beIN balance did not decrease. Previous message: ${operation.responseMessage || '-'}`,
                        finalConfirmExpiry: null,
                    },
                })
            })

            refunded++
        }

        console.log('')
        console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`)
        console.log(`Scanned: ${scanned}`)
        console.log(`Eligible: ${eligible}`)
        console.log(`Refunded: ${refunded}`)
        console.log(`Skipped: ${skipped}`)
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
