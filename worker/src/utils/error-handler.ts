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

export async function refundUser(operationId: string, userId: string, amount: number, reason: string): Promise<boolean> {
    // Guard: skip if no money to refund
    if (!amount || amount <= 0) {
        console.log(`⚠️ Skipping refund for operation ${operationId}: amount is ${amount}`)
        return false
    }

    try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
    } catch (error: unknown) {
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
