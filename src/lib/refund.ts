/**
 * Shared atomic refund logic
 * 
 * Used by both the cancel route (Next.js app) and can be imported
 * by any API route that needs to refund a user or customer.
 * 
 * Key safety features:
 * - DB unique refund guard makes reseller duplicate refunds idempotent
 * - Handles both reseller users and customer mobile app wallets
 * - Automatic notification creation
 */

import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { decideRefundSafety, getOperationPhaseEvidence } from '@/lib/operation-safety'

/**
 * Atomically refund a reseller user's balance.
 * Relies on the DB unique refund guard to prevent double-refund on concurrent requests.
 * 
 * @returns true if refund was applied, false if skipped (already refunded or amount <= 0)
 */
export async function refundUser(
    operationId: string,
    userId: string,
    amount: number,
    reason: string
): Promise<boolean> {
    if (!amount || amount <= 0) {
        console.log(`Skipping refund for operation ${operationId}: amount is ${amount}`)
        return false
    }

    try {
        await prisma.$transaction(async (tx) => {
            const operation = await tx.operation.findUnique({
                where: { id: operationId },
                select: { status: true, amount: true, responseData: true }
            })

            const existingRefund = await tx.transaction.findFirst({
                where: {
                    operationId,
                    type: 'REFUND'
                },
                select: { id: true }
            })

            const deductTx = await tx.transaction.findFirst({
                where: {
                    operationId,
                    type: 'OPERATION_DEDUCT'
                },
                select: { id: true }
            })

            const refundDecision = operation ? decideRefundSafety({
                operationId,
                operationStatus: operation.status,
                operationAmount: operation.amount || amount,
                operationResponseData: operation.responseData,
                phaseEvidence: getOperationPhaseEvidence(operation.responseData),
                customerDeductTransactionExists: !!deductTx || amount > 0,
                refundTransactionExists: !!existingRefund,
            }) : null

            if (refundDecision && !refundDecision.refundAllowed) {
                console.error(
                    `[MONITOR] Refund blocked for operation ${operationId}: status=${operation?.status || 'missing'}, decision=${refundDecision.reason}, reason=${reason}`
                )
                throw new Error('REFUND_BLOCKED_TERMINAL')
            }

            // Update user balance
            const user = await tx.user.update({
                where: { id: userId },
                data: { balance: { increment: amount } }
            })

            // Create refund transaction
            await tx.transaction.create({
                data: {
                    userId,
                    operationId,
                    type: 'REFUND',
                    amount,
                    balanceAfter: user.balance,
                    notes: `Refund: ${reason}`
                }
            })

            // Create notification
            await tx.notification.create({
                data: {
                    userId,
                    title: 'Amount refunded',
                    message: `Amount ${amount} refunded. Reason: ${reason}`,
                    type: 'info',
                    link: '/dashboard/transactions'
                }
            })

            console.log(`Refunded ${amount} to user ${userId} for operation ${operationId}`)
        })

        return true
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_TERMINAL') return false
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false
        throw error
    }
}

/**
 * Atomically refund a customer's wallet balance (mobile app).
 * Same atomic pattern as refundUser but for the customer wallet.
 * 
 * @returns true if refund was applied, false if skipped
 */
export async function refundCustomer(
    operationId: string,
    customerId: string,
    amount: number,
    reason: string
): Promise<boolean> {
    if (!amount || amount <= 0) {
        console.log(`Skipping customer refund for operation ${operationId}: amount is ${amount}`)
        return false
    }

    try {
        await prisma.$transaction(async (tx) => {
            const operation = await tx.operation.findUnique({
                where: { id: operationId },
                select: { status: true, amount: true, responseData: true }
            })

            const refundDecision = operation ? decideRefundSafety({
                operationId,
                operationStatus: operation.status,
                operationAmount: operation.amount || amount,
                operationResponseData: operation.responseData,
                phaseEvidence: getOperationPhaseEvidence(operation.responseData),
                customerDeductTransactionExists: amount > 0,
                refundTransactionExists: false,
            }) : null

            if (refundDecision && !refundDecision.refundAllowed) {
                console.error(
                    `[MONITOR] Customer refund blocked for operation ${operationId}: status=${operation?.status || 'missing'}, decision=${refundDecision.reason}, reason=${reason}`
                )
                throw new Error('REFUND_BLOCKED_TERMINAL')
            }

            // Check for existing customer refund INSIDE transaction
            const existingRefund = await tx.walletTransaction.findFirst({
                where: {
                    referenceId: operationId,
                    referenceType: 'REFUND'
                }
            })

            if (existingRefund) {
                console.log(`Customer refund already exists for operation ${operationId}, skipping`)
                throw new Error('REFUND_EXISTS')
            }

            // Update customer wallet
            const customer = await tx.customer.update({
                where: { id: customerId },
                data: { walletBalance: { increment: amount } }
            })

            // Create wallet refund transaction
            await tx.walletTransaction.create({
                data: {
                    customerId,
                    type: 'CREDIT',
                    amount,
                    balanceBefore: customer.walletBalance - amount,
                    balanceAfter: customer.walletBalance,
                    description: `Refund: ${reason}`,
                    referenceType: 'REFUND',
                    referenceId: operationId,
                }
            })

            console.log(`Refunded ${amount} to customer ${customerId} for operation ${operationId}`)
        })

        return true
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'REFUND_EXISTS') return false
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_TERMINAL') return false
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false
        throw error
    }
}
