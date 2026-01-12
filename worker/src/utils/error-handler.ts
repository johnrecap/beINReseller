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
        return { type: 'LOGIN_FAILED', message: 'فشل تسجيل الدخول - تحقق من بيانات الحساب', recoverable: false }
    }

    if (message.includes('captcha')) {
        return { type: 'CAPTCHA_FAILED', message: 'فشل حل الكابتشا', recoverable: true }
    }

    if (message.includes('timeout') || message.includes('navigation')) {
        return { type: 'TIMEOUT', message: 'انتهت مهلة الاتصال', recoverable: true }
    }

    if (message.includes('net::') || message.includes('network')) {
        return { type: 'NETWORK', message: 'خطأ في الاتصال بالشبكة', recoverable: true }
    }

    if (message.includes('selector') || message.includes('element')) {
        return { type: 'ELEMENT_NOT_FOUND', message: 'عنصر غير موجود - قد تكون الصفحة تغيرت', recoverable: false }
    }

    return { type: 'UNKNOWN', message: error.message || 'خطأ غير معروف', recoverable: true }
}

export async function refundUser(operationId: string, userId: string, amount: number, reason: string): Promise<void> {
    await prisma.$transaction(async (tx: any) => {
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
                notes: `استرداد تلقائي: ${reason}`
            }
        })

        console.log(`💰 Refunded ${amount} to user ${userId} for operation ${operationId}`)
    })
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
