import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { addOperationJob } from '@/lib/queue'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

// Validation schema
const signalCheckSchema = z.object({
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'رقم الكارت يجب أن يحتوي على أرقام فقط'),
})

/**
 * POST /api/operations/signal-check
 * 
 * Step 1: Check card status for signal refresh (WITHOUT activating)
 * - Creates Operation with type SIGNAL_CHECK
 * - Sends Job to Worker to check card and fetch status
 * - Returns operationId for polling
 */
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

        // 3. Parse and validate input
        const body = await request.json()
        const validationResult = signalCheckSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'رقم الكارت غير صحيح', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { cardNumber } = validationResult.data

        // 4. Check for duplicate pending/processing operations for this card
        const existingOperation = await prisma.operation.findFirst({
            where: {
                cardNumber,
                type: 'SIGNAL_REFRESH',
                status: { in: ['PENDING', 'PROCESSING'] },
            },
        })

        if (existingOperation) {
            return NextResponse.json(
                { error: 'هناك عملية جارية لهذا الكارت', operationId: existingOperation.id },
                { status: 400 }
            )
        }

        // 5. Create operation
        const operation = await prisma.operation.create({
            data: {
                userId: session.user.id,
                type: 'SIGNAL_REFRESH', // Use SIGNAL_REFRESH since it's a valid enum value
                cardNumber,
                amount: 0,
                status: 'PENDING',
            },
        })

        // 6. Log activity
        await prisma.activityLog.create({
            data: {
                userId: session.user.id,
                action: 'SIGNAL_CHECK_STARTED',
                details: `فحص كارت ****${cardNumber.slice(-4)}`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            },
        })

        // 7. Add job to queue with SIGNAL_CHECK type
        try {
            await addOperationJob({
                operationId: operation.id,
                type: 'SIGNAL_CHECK',
                cardNumber,
                userId: session.user.id,
            })
        } catch (queueError) {
            console.error('Failed to add signal check job to queue:', queueError)
            await prisma.operation.update({
                where: { id: operation.id },
                data: {
                    status: 'FAILED',
                    responseMessage: 'فشل في إضافة العملية للطابور'
                },
            })
            return NextResponse.json(
                { error: 'فشل في بدء العملية، حاول مرة أخرى' },
                { status: 500 }
            )
        }

        // 8. Return success
        return NextResponse.json({
            success: true,
            operationId: operation.id,
            message: 'جاري فحص الكارت...',
        })

    } catch (error) {
        console.error('Signal check error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
