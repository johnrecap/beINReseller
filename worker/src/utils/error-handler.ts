/**
 * Error Handler - Centralized error handling and refund logic
 */

import { prisma } from '../lib/prisma'

export interface OperationError {
    type: 'LOGIN_FAILED' | 'CAPTCHA_FAILED' | 'TIMEOUT' | 'NETWORK' | 'ELEMENT_NOT_FOUND' | 'UNKNOWN'
    message: string
    recoverable: boolean
}

export function classifyError(error: any): OperationError {
    const message = error.message?.toLowerCase() || ''

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

    return { type: 'UNKNOWN', message: error.message || 'Unknown error', recoverable: true }
}

import { createNotification } from './notification'

export async function refundUser(operationId: string, userId: string, amount: number, reason: string): Promise<boolean> {
    // Guard: skip if no money to refund
    if (!amount || amount <= 0) {
        console.log(`⚠️ Skipping refund for operation ${operationId}: amount is ${amount}`)
        return false
    }

    try {
        await prisma.$transaction(async (tx: any) => {
            // Check INSIDE transaction for atomicity (prevents race condition)
            const existingRefund = await tx.transaction.findFirst({
                where: {
                    operationId,
                    type: 'REFUND'
                }
            })

            if (existingRefund) {
                console.log(`⚠️ Refund already exists for operation ${operationId}, skipping to prevent double refund`)
                throw new Error('REFUND_EXISTS')
            }

            // Update user balance
            const user = await tx.user.update({
                where: { id: userId },
                data: {
                    balance: { increment: amount }
                }
            })

            // Create refund transaction
            await tx.transaction.create({
                data: {
                    userId,
                    operationId,
                    type: 'REFUND',
                    amount: amount,
                    balanceAfter: user.balance,
                    notes: `Auto-refund: ${reason}`
                }
            })

            // Create notification within transaction
            await tx.notification.create({
                data: {
                    userId,
                    title: 'Amount refunded',
                    message: `Amount refunded: ${amount} SAR. Reason: ${reason}`,
                    type: 'info',
                    link: '/dashboard/transactions'
                }
            })

            console.log(`💰 Refunded ${amount} to user ${userId} for operation ${operationId}`)
        })

        return true
    } catch (error: any) {
        if (error.message === 'REFUND_EXISTS') return false
        throw error
    }
}

export async function markOperationFailed(
    operationId: string,
    error: OperationError,
    retryCount: number
): Promise<void> {
    await prisma.operation.update({
        where: { id: operationId },
        data: {
            status: 'FAILED',
            retryCount,
            responseMessage: error.message,
            completedAt: new Date()
        }
    })
}
