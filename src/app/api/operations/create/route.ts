import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { getOperationPrice, OPERATION_TYPES, OPERATION_STATUSES } from '@/lib/constants'
import { addOperationJob } from '@/lib/queue'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

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

        // 3. Check for duplicate pending/processing operations for same card
        const existingOperation = await prisma.operation.findFirst({
            where: {
                cardNumber,
                status: { in: ['PENDING', 'PROCESSING'] },
            },
        })

        if (existingOperation) {
            return NextResponse.json(
                { error: 'هناك عملية جارية لهذا الكارت' },
                { status: 400 }
            )
        }

        // 4. Calculate price
        const price = getOperationPrice(type, duration)
        if (price <= 0) {
            return NextResponse.json(
                { error: 'نوع العملية غير صالح' },
                { status: 400 }
            )
        }

        // 5. Get user and check balance
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

        if (user.balance < price) {
            return NextResponse.json(
                { error: 'رصيد غير كافي', required: price, available: user.balance },
                { status: 400 }
            )
        }

        // 6. Create operation in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Deduct balance
            await tx.user.update({
                where: { id: user.id },
                data: { balance: { decrement: price } },
            })

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
                    balanceAfter: user.balance - price,
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

            return operation
        })

        // 7. Add job to queue (async, don't await)
        try {
            await addOperationJob({
                operationId: result.id,
                type,
                cardNumber,
                duration,
            })
        } catch (queueError) {
            console.error('Failed to add job to queue:', queueError)
            // Don't fail the request, the operation is saved in DB
        }

        // 8. Return success
        return NextResponse.json({
            success: true,
            operationId: result.id,
            deducted: price,
            newBalance: user.balance - price,
        })

    } catch (error) {
        console.error('Create operation error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
