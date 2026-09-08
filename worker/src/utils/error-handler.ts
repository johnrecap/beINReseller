/**
 * Error Handler - Centralized error handling and refund logic
 */

import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'

export interface OperationError {
    type: 'LOGIN_FAILED' | 'CAPTCHA_FAILED' | 'TIMEOUT' | 'NETWORK' | 'ELEMENT_NOT_FOUND' | 'UNKNOWN'
    message: string
    recoverable: boolean
}

export function classifyError(error: unknown): OperationError {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const message = errorMessage.toLowerCase()

    if (message.includes('login') || message.includes('credentials')) {
        return { type: 'LOGIN_FAILED', message: 'Login failed - check account credentials', recoverable: false }
    }

    if (message.includes('captcha')) {
        return { type: 'CAPTCHA_FAILED', message: 'CAPTCHA solving failed', recoverable: true }
    }

    if (message.includes('timeout') || message.includes('navigation')) {
        return { type: 'TIMEOUT', message: 'Connection timeout', recoverable: true }
    }

    if (message.includes('net::') || message.includes('network')) {
        return { type: 'NETWORK', message: 'Network connection error', recoverable: true }
    }

    if (message.includes('selector') || message.includes('element')) {
        return { type: 'ELEMENT_NOT_FOUND', message: 'Element not found - page may have changed', recoverable: false }
    }

    return { type: 'UNKNOWN', message: errorMessage || 'Unknown error', recoverable: true }
}

function parseResponseData(responseData: unknown): Record<string, unknown> {
    if (!responseData) return {}
    if (typeof responseData === 'string') {
        try {
            const parsed = JSON.parse(responseData)
            return parsed && typeof parsed === 'object' ? parsed : {}
        } catch {
            return {}
        }
    }
    return typeof responseData === 'object' ? responseData as Record<string, unknown> : {}
}

function finalPayMayHaveStarted(status: string, responseData: unknown): boolean {
    const data = parseResponseData(responseData)
    const phase = data.operationPhase ?? data.phase

    if (data.finalPaySubmitted === true) return true
    if (
        phase === 'FINAL_PROVIDER_MUTATION_STARTED' ||
        phase === 'FINAL_PAY_REQUEST_STARTED' ||
        phase === 'FINAL_PAY_SUBMITTED' ||
        phase === 'POST_FINAL_PAY_REVIEW'
    ) return true
    if (
        phase === 'PACKAGE_PREPARATION' ||
        phase === 'CANCELLATION_CONFIRM' ||
        phase === 'FINAL_CONFIRMATION' ||
        phase === 'FINAL_CONFIRMATION_REQUESTED' ||
        phase === 'CUSTOMER_DEDUCTED' ||
        phase === 'DISPATCH_PENDING' ||
        phase === 'DISPATCH_FAILED' ||
        phase === 'RECOVERY_TIMEOUT'
    ) return false

    return status === 'COMPLETING'
}

export function decideWorkerRefundSafety(params: {
    status: string
    amount: number
    responseData: unknown
    existingRefund: boolean
    allowFinalPayRefund?: boolean
    operationType?: string
    providerMutationStartedAt?: Date | null
    providerPaymentState?: string | null
    fulfillmentState?: string | null
    fulfillmentVerificationOutcome?: string | null
}): { refundAllowed: boolean; reason: string; finalPayMayHaveStarted: boolean } {
    const finalPayStarted = Boolean(params.providerMutationStartedAt) ||
        finalPayMayHaveStarted(params.status, params.responseData)
    const data = parseResponseData(params.responseData)
    const auditSnapshot = data.auditSnapshot && typeof data.auditSnapshot === 'object'
        ? data.auditSnapshot as Record<string, unknown>
        : {}
    const renewalTypedNonCharge =
        params.operationType === 'RENEW' &&
        params.providerPaymentState === 'NOT_CHARGED' &&
        params.fulfillmentState === 'NOT_FOUND' &&
        params.fulfillmentVerificationOutcome === 'VALID_NO_MATCH'
    const legacyNonCharge =
        params.operationType !== 'RENEW' &&
        (
            params.allowFinalPayRefund === true ||
            data.outcomeCategory === 'CONFIRMED_NOT_CHARGED' ||
            auditSnapshot.outcomeCategory === 'CONFIRMED_NOT_CHARGED'
        )
    const confirmedNonCharge = renewalTypedNonCharge || legacyNonCharge

    if (params.status === 'COMPLETED' || params.status === 'REVIEW_REQUIRED') {
        return { refundAllowed: false, reason: 'terminal_status', finalPayMayHaveStarted: finalPayStarted }
    }
    if (params.existingRefund) {
        return { refundAllowed: false, reason: 'refund_exists', finalPayMayHaveStarted: finalPayStarted }
    }
    if (params.amount <= 0) {
        return { refundAllowed: false, reason: 'no_amount', finalPayMayHaveStarted: finalPayStarted }
    }
    if (finalPayStarted) {
        if (confirmedNonCharge) {
            return { refundAllowed: true, reason: 'confirmed_not_charged_after_final_pay', finalPayMayHaveStarted: true }
        }
        return { refundAllowed: false, reason: 'final_pay_may_have_started', finalPayMayHaveStarted: true }
    }
    return { refundAllowed: true, reason: 'pre_final_payment', finalPayMayHaveStarted: false }
}

export async function refundUser(
    operationId: string,
    userId: string,
    amount: number,
    reason: string,
    options: { allowFinalPayRefund?: boolean } = {}
): Promise<boolean> {
    // Guard: skip if no money to refund
    if (!amount || amount <= 0) {
        console.log(`⚠️ Skipping refund for operation ${operationId}: amount is ${amount}`)
        return false
    }

    try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "operations" WHERE id = ${operationId} FOR UPDATE`

            const operation = await tx.operation.findUnique({
                where: { id: operationId },
                select: {
                    userId: true,
                    type: true,
                    purpose: true,
                    status: true,
                    responseData: true,
                    providerMutationStartedAt: true,
                    providerPaymentState: true,
                    fulfillmentState: true,
                    fulfillmentVerificationOutcome: true,
                }
            })

            if (!operation) {
                throw new Error('REFUND_BLOCKED_MISSING_OPERATION')
            }

            const deductions = await tx.transaction.findMany({
                where: { operationId, type: 'OPERATION_DEDUCT' },
                select: { id: true, userId: true, amount: true },
            })
            const canonicalRefundAmount = operation.type === 'RENEW'
                ? Math.round(Math.abs(deductions.reduce((sum, entry) => sum + entry.amount, 0)) * 100) / 100
                : amount
            if (
                canonicalRefundAmount <= 0 ||
                (operation.type === 'RENEW' && (
                    operation.userId !== userId ||
                    deductions.length !== 1 ||
                    deductions.some((entry) => entry.userId !== userId || entry.amount >= 0)
                ))
            ) {
                throw new Error('REFUND_BLOCKED_CANONICAL_SETTLEMENT')
            }

            // Installment refund/status/points/reservations must commit in its dedicated finalizer.
            if (operation.purpose === 'INSTALLMENT') return false
            const existingRefund = await tx.transaction.findFirst({
                where: {
                    operationId,
                    type: 'REFUND'
                },
                select: { id: true }
            })

            const refundDecision = decideWorkerRefundSafety({
                status: operation.status,
                amount: canonicalRefundAmount,
                responseData: operation.responseData,
                existingRefund: !!existingRefund,
                allowFinalPayRefund: options.allowFinalPayRefund === true,
                operationType: operation.type,
                providerMutationStartedAt: operation.providerMutationStartedAt,
                providerPaymentState: operation.providerPaymentState,
                fulfillmentState: operation.fulfillmentState,
                fulfillmentVerificationOutcome: operation.fulfillmentVerificationOutcome,
            })

            if (!refundDecision.refundAllowed) {
                console.error(
                    `[MONITOR] Worker refund blocked for operation ${operationId}: status=${operation.status}, decision=${refundDecision.reason}, reason=${reason}`
                )
                throw new Error('REFUND_BLOCKED_SAFETY')
            }

            // Update user balance
            const user = await tx.user.update({
                where: { id: userId },
                data: {
                    balance: { increment: canonicalRefundAmount }
                }
            })

            // Create refund transaction
            await tx.transaction.create({
                data: {
                    userId,
                    operationId,
                    type: 'REFUND',
                    amount: canonicalRefundAmount,
                    balanceAfter: user.balance,
                    notes: `Auto-refund: ${reason}`
                }
            })

            // Create notification within transaction
            await tx.notification.create({
                data: {
                    userId,
                    title: 'Amount refunded',
                    message: `Amount refunded: ${canonicalRefundAmount} SAR. Reason: ${reason}`,
                    type: 'info',
                    link: '/dashboard/transactions'
                }
            })

            console.log(`💰 Refunded ${amount} to user ${userId} for operation ${operationId}`)
        })

        return true
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_SAFETY') return false
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_MISSING_OPERATION') return false
        if (error instanceof Error && error.message === 'REFUND_BLOCKED_CANONICAL_SETTLEMENT') return false
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false
        throw error
    }
}

export async function markOperationFailed(
    operationId: string,
    error: OperationError,
    retryCount: number
): Promise<void> {
    await prisma.operation.updateMany({
        where: {
            id: operationId,
            status: { notIn: ['COMPLETED', 'REVIEW_REQUIRED', 'CANCELLED', 'FAILED', 'EXPIRED'] }
        },
        data: {
            status: 'FAILED',
            retryCount,
            responseMessage: error.message,
            completedAt: new Date()
        }
    })
}
