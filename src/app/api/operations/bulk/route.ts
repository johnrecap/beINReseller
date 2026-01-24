import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getOperationPriceFromDB } from '@/lib/pricing'
import { addOperationJob } from '@/lib/queue'
import { createNotification } from '@/lib/notification'
import { roleHasPermission } from '@/lib/auth-utils'
import { PERMISSIONS } from '@/lib/permissions'

const MAX_CARDS_PER_REQUEST = 10

// Validation schema
const bulkOperationSchema = z.object({
    type: z.enum(['RENEW', 'CHECK_BALANCE', 'SIGNAL_REFRESH']),
    cardNumbers: z.array(z.string().min(10).max(16).regex(/^\d+$/))
        .min(1)
        .max(MAX_CARDS_PER_REQUEST),
    duration: z.string().optional(),
})

export async function POST(request: Request) {
    try {
        // Check authentication
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        // Check permission - only users with SUBSCRIPTION_BULK can access
        if (!roleHasPermission(session.user.role, PERMISSIONS.SUBSCRIPTION_BULK)) {
            return NextResponse.json(
                { error: 'صلاحيات غير كافية' },
                { status: 403 }
            )
        }

        // Parse and validate input
        const body = await request.json()
        const validationResult = bulkOperationSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { type, cardNumbers, duration } = validationResult.data

        // Remove duplicates
        const uniqueCardNumbers = [...new Set(cardNumbers)]

        // Calculate total price
        const pricePerOperation = await getOperationPriceFromDB(type, duration)
        const totalPrice = pricePerOperation * uniqueCardNumbers.length

        // Get user and check balance
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, balance: true },
        })

        if (!user) {
            return NextResponse.json(
                { error: 'المستخدم غير موجود' },
                { status: 404 }
            )
        }

        if (user.balance < totalPrice) {
            return NextResponse.json({
                error: 'رصيد غير كافي',
                required: totalPrice,
                available: user.balance,
                perCard: pricePerOperation,
                cardCount: uniqueCardNumbers.length,
            }, { status: 400 })
        }

        // Check for existing pending/processing operations
        const existingOperations = await prisma.operation.findMany({
            where: {
                cardNumber: { in: uniqueCardNumbers },
                status: { in: ['PENDING', 'PROCESSING'] },
            },
            select: { cardNumber: true },
        })

        const blockedCards = existingOperations.map(op => op.cardNumber)
        const availableCards = uniqueCardNumbers.filter(card => !blockedCards.includes(card))

        if (availableCards.length === 0) {
            return NextResponse.json({
                error: 'جميع الكروت لديها عمليات جارية',
                blockedCards,
            }, { status: 400 })
        }

        const actualTotalPrice = pricePerOperation * availableCards.length

        // Create operations in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Deduct total balance
            await tx.user.update({
                where: { id: user.id },
                data: { balance: { decrement: actualTotalPrice } },
            })

            const operations = []

            for (const cardNumber of availableCards) {
                // Create operation
                const operation = await tx.operation.create({
                    data: {
                        userId: user.id,
                        type: type as 'RENEW' | 'CHECK_BALANCE' | 'SIGNAL_REFRESH',
                        cardNumber,
                        amount: pricePerOperation,
                        status: 'PENDING',
                        duration: duration || null,
                    },
                })

                operations.push({
                    cardNumber,
                    operationId: operation.id,
                })

                // Create transaction record
                await tx.transaction.create({
                    data: {
                        userId: user.id,
                        type: 'OPERATION_DEDUCT',
                        amount: -pricePerOperation,
                        balanceAfter: user.balance - (operations.length * pricePerOperation),
                        operationId: operation.id,
                        notes: `خصم عملية جملة - ${cardNumber.slice(-4)}****`,
                    },
                })
            }

            // Log activity
            await tx.activityLog.create({
                data: {
                    userId: user.id,
                    action: 'BULK_OPERATION_CREATED',
                    details: `إنشاء ${operations.length} عملية جملة من نوع ${type}`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })

            return operations
        })

        // Add jobs to queue (async)
        for (const op of result) {
            try {
                await addOperationJob({
                    operationId: op.operationId,
                    type,
                    cardNumber: op.cardNumber,
                    duration,
                    userId: user.id,
                    amount: pricePerOperation,
                })
            } catch (err) {
                console.error(`Failed to queue operation ${op.operationId}:`, err)
            }
        }

        // Notify Success
        await createNotification({
            userId: user.id,
            title: 'تم استلام طلب الجملة',
            message: `جاري معالجة ${result.length} عملية`,
            type: 'info',
            link: '/dashboard/history'
        })

        return NextResponse.json({
            success: true,
            operations: result,
            totalDeducted: actualTotalPrice,
            newBalance: user.balance - actualTotalPrice,
            blockedCards: blockedCards.length > 0 ? blockedCards : undefined,
        })

    } catch (error) {
        console.error('Bulk operation error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
