import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { OPERATION_TYPES, OPERATION_STATUSES } from '@/lib/constants'
import { getOperationPriceFromDB } from '@/lib/pricing'
import { addOperationJob } from '@/lib/queue'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { createNotification } from '@/lib/notification'

// Validation schema
const createOperationSchema = z.object({
    type: z.enum(['RENEW', 'CHECK_BALANCE', 'SIGNAL_REFRESH']),
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'رقم الكارت يجب أن يحتوي على أرقام فقط'),
    duration: z.string().optional(),
})

export async function POST(request: Request) {
    try {
        // 1. Check authentication
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        // 2. Check rate limit
        const { allowed, result: rateLimitResult } = await withRateLimit(
            `operations:${session.user.id}`,
            RATE_LIMITS.operations
        )

        if (!allowed) {
            return NextResponse.json(
                { error: 'تجاوزت الحد المسموح من الطلبات، انتظر قليلاً' },
                { status: 429, headers: rateLimitHeaders(rateLimitResult) }
            )
        }

        // 2. Parse and validate input
        const body = await request.json()
        const validationResult = createOperationSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { type, cardNumber, duration } = validationResult.data

        // 4. Calculate price
        const price = await getOperationPriceFromDB(type, duration)
        if (price <= 0) {
            return NextResponse.json(
                { error: 'نوع العملية غير صالح' },
                { status: 400 }
            )
        }

        // 5. Get user (basic check)
        const userExists = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true },
        })

        if (!userExists) {
            return NextResponse.json(
                { error: 'المستخدم غير موجود' },
                { status: 404 }
            )
        }

        // 6. Create operation in a transaction with balance check INSIDE
        const result = await prisma.$transaction(async (tx) => {
            // Get fresh user balance inside transaction (prevents race condition)
            const user = await tx.user.findUnique({
                where: { id: session.user.id },
                select: { id: true, balance: true },
            })

            if (!user || user.balance < price) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            // Check for duplicate pending/processing operations
            const existingOperation = await tx.operation.findFirst({
                where: {
                    cardNumber,
                    status: { in: ['PENDING', 'PROCESSING'] },
                },
            })

            if (existingOperation) {
                throw new Error('DUPLICATE_OPERATION')
            }

            // Deduct balance (atomic with balance check above)
            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: { balance: { decrement: price } },
            })

            // Double-check balance didn't go negative (safety net)
            if (updatedUser.balance < 0) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            // Create operation
            const operation = await tx.operation.create({
                data: {
                    userId: user.id,
                    type: type as any,
                    cardNumber,
                    amount: price,
                    status: 'PENDING',
                    duration: duration || null,
                },
            })

            // Create transaction record
            await tx.transaction.create({
                data: {
                    userId: user.id,
                    type: 'OPERATION_DEDUCT',
                    amount: -price,
                    balanceAfter: updatedUser.balance,
                    operationId: operation.id,
                    notes: `خصم عملية ${type === 'RENEW' ? 'تجديد' : type === 'CHECK_BALANCE' ? 'استعلام' : 'تنشيط إشارة'}`,
                },
            })

            // Log activity
            await tx.activityLog.create({
                data: {
                    userId: user.id,
                    action: 'OPERATION_CREATED',
                    details: `إنشاء عملية ${type} للكارت ${cardNumber.slice(-4)}****`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })

            return { operation, newBalance: updatedUser.balance }
        })

        // 7. Add job to queue (async, don't await)
        try {
            await addOperationJob({
                operationId: result.operation.id,
                type,
                cardNumber,
                duration,
                userId: session.user.id,
                amount: price,
            })

            // Send notification
            await createNotification({
                userId: session.user.id,
                title: 'تم استلام طلبك',
                message: `جاري معالجة عملية ${type === 'RENEW' ? 'التجديد' : type === 'CHECK_BALANCE' ? 'الاستعلام' : 'تنشيط الإشارة'}`,
                type: 'info',
                link: '/dashboard/history'
            })

        } catch (queueError) {
            console.error('Failed to add job to queue:', queueError)
            // Don't fail the request, the operation is saved in DB
        }



        // 8. Return success
        return NextResponse.json({
            success: true,
            operationId: result.operation.id,
            deducted: price,
            newBalance: result.newBalance,
        })

    } catch (error: any) {
        console.error('Create operation error:', error)

        if (error.message === 'INSUFFICIENT_BALANCE') {
            return NextResponse.json(
                { error: 'رصيد غير كافي' },
                { status: 400 }
            )
        }

        if (error.message === 'DUPLICATE_OPERATION') {
            return NextResponse.json(
                { error: 'هناك عملية جارية لهذا الكارت' },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
