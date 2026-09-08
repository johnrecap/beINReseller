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
import { decideRefundSafety, getOperationPhaseEvidence, parseOperationResponseData } from '@/lib/operation-safety'
import { createOperationPointReversalsInTransaction } from '@/lib/points/reversals'

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
            await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "operations" WHERE id = ${operationId} FOR UPDATE`

            const operation = await tx.operation.findUnique({
                where: { id: operationId },
                select: {
                    userId: true,
                    type: true,
                    status: true,
                    amount: true,
                    responseData: true,
                    providerMutationStartedAt: true,
                    providerPaymentState: true,
                    fulfillmentState: true,
                    fulfillmentVerificationOutcome: true,
                }
            })

            if (!operation) {
                console.error(`[MONITOR] Refund blocked for missing operation ${operationId}: reason=${reason}`)
                throw new Error('REFUND_BLOCKED_MISSING_OPERATION')
            }

            const existingRefund = await tx.transaction.findFirst({
                where: {
                    operationId,
                    type: 'REFUND'
                },
                select: { id: true }
            })

            const deductTransactions = await tx.transaction.findMany({
                where: {
                    operationId,
                    type: 'OPERATION_DEDUCT'
                },
                select: { id: true, userId: true, amount: true }
            })

            const canonicalRefundAmount = operation.type === 'RENEW'
                ? Math.round(Math.abs(deductTransactions.reduce((sum, entry) => sum + entry.amount, 0)) * 100) / 100
                : amount
            if (
                canonicalRefundAmount <= 0 ||
                (operation.type === 'RENEW' && (
                    operation.userId !== userId ||
                    deductTransactions.length !== 1 ||
                    deductTransactions.some((entry) => entry.userId !== userId || entry.amount >= 0)
                ))
            ) {
                throw new Error('REFUND_BLOCKED_CANONICAL_SETTLEMENT')
            }

            const phaseEvidence = getOperationPhaseEvidence(operation.responseData)
            const responseData = parseOperationResponseData(operation.responseData)
            const auditSnapshot = responseData.auditSnapshot && typeof responseData.auditSnapshot === 'object'
                ? responseData.auditSnapshot as Record<string, unknown>
                : {}
            const refundDecision = decideRefundSafety({
                operationId,
                operationStatus: operation.status,
                operationAmount: canonicalRefundAmount,
                operationResponseData: operation.responseData,
                phaseEvidence,
                customerDeductTransactionExists: deductTransactions.length > 0,
                refundTransactionExists: !!existingRefund,
                confirmedNonChargeEvidence:
                    phaseEvidence?.outcomeCategory === 'CONFIRMED_NOT_CHARGED' ||
                    responseData.outcomeCategory === 'CONFIRMED_NOT_CHARGED' ||
                    auditSnapshot.outcomeCategory === 'CONFIRMED_NOT_CHARGED',
            })

            const renewalPostMutationRefundAllowed =
                operation.type !== 'RENEW' ||
                !operation.providerMutationStartedAt ||
                (
                    operation.providerPaymentState === 'NOT_CHARGED' &&
                    operation.fulfillmentState === 'NOT_FOUND' &&
                    operation.fulfillmentVerificationOutcome === 'VALID_NO_MATCH'
                )

            if (!refundDecision.refundAllowed || !renewalPostMutationRefundAllowed) {
                console.error(
                    `[MONITOR] Refund blocked for operation ${operationId}: status=${operation?.status || 'missing'}, decision=${refundDecision.reason}, reason=${reason}`
                )
                throw new Error('REFUND_BLOCKED_TERMINAL')
            }

            // Update user balance
            const user = await tx.user.update({
                where: { id: userId },
                data: { balance: { increment: canonicalRefundAmount } }
            })

            // Create refund transaction
            await tx.transaction.create({
                data: {
                    userId,
                    operationId,
                    type: 'REFUND',
                    amount: canonicalRefundAmount,
                    balanceAfter: user.balance,
                    notes: `Refund: ${reason}`
                }
            })

            // Create notification
            await tx.notification.create({
                data: {
                    userId,
                    title: 'Amount refunded',
                    message: `Amount ${canonicalRefundAmount} refunded. Reason: ${reason}`,
                    type: 'info',
                    link: '/dashboard/transactions'
                }
            })

            await createOperationPointReversalsInTransaction({
                db: tx,
                operationId,
                reason: 'refund',
            })

            console.log(`Refunded ${amount} to user ${userId} for operation ${operationId}`)
        })

        return true
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_TERMINAL') return false
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_MISSING_OPERATION') return false
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_CANONICAL_SETTLEMENT') return false
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
            await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "operations" WHERE id = ${operationId} FOR UPDATE`
            const operation = await tx.operation.findUnique({
                where: { id: operationId },
                select: {
                    customerId: true,
                    type: true,
                    status: true,
                    amount: true,
                    responseData: true,
                    providerMutationStartedAt: true,
                    providerPaymentState: true,
                    fulfillmentState: true,
                    fulfillmentVerificationOutcome: true,
                    storeSubscription: { select: { id: true } },
                }
            })

            if (!operation || operation.customerId !== customerId) {
                throw new Error('REFUND_BLOCKED_MISSING_OPERATION')
            }

            const [walletDebits, providerPayments] = await Promise.all([
                tx.walletTransaction.findMany({
                    where: {
                        customerId,
                        referenceId: operationId,
                        type: 'DEBIT',
                    },
                    select: { id: true, customerId: true, amount: true },
                }),
                tx.payment.findMany({
                    where: {
                        customerId,
                        type: 'SUBSCRIPTION',
                        metadata: { path: ['operationId'], equals: operationId },
                    },
                    select: { id: true },
                }),
            ])
            const canonicalRefundAmount = Math.round(
                walletDebits.reduce((sum, entry) => sum + entry.amount, 0) * 100
            ) / 100
            if (
                operation.storeSubscription ||
                providerPayments.length > 0 ||
                canonicalRefundAmount <= 0 ||
                walletDebits.some((entry) => entry.customerId !== customerId || entry.amount <= 0)
            ) {
                throw new Error('REFUND_BLOCKED_CANONICAL_SETTLEMENT')
            }

            const refundDecision = decideRefundSafety({
                operationId,
                operationStatus: operation.status,
                operationAmount: canonicalRefundAmount,
                operationResponseData: operation.responseData,
                phaseEvidence: getOperationPhaseEvidence(operation.responseData),
                customerDeductTransactionExists: amount > 0,
                refundTransactionExists: false,
            })

            const renewalPostMutationRefundAllowed = operation.type !== 'RENEW' ||
                !operation.providerMutationStartedAt ||
                (
                    operation.providerPaymentState === 'NOT_CHARGED' &&
                    operation.fulfillmentState === 'NOT_FOUND' &&
                    operation.fulfillmentVerificationOutcome === 'VALID_NO_MATCH'
                )

            if (!refundDecision.refundAllowed || !renewalPostMutationRefundAllowed) {
                console.error(
                    `[MONITOR] Customer refund blocked for operation ${operationId}: status=${operation?.status || 'missing'}, decision=${refundDecision?.reason || 'RENEWAL_POST_MUTATION_REFUND_BLOCKED'}, reason=${reason}`
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
                data: { walletBalance: { increment: canonicalRefundAmount } }
            })

            // Create wallet refund transaction
            await tx.walletTransaction.create({
                data: {
                    customerId,
                    type: 'CREDIT',
                    amount: canonicalRefundAmount,
                    balanceBefore: customer.walletBalance - canonicalRefundAmount,
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
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_MISSING_OPERATION') return false
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_CANONICAL_SETTLEMENT') return false
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false
        throw error
    }
}
