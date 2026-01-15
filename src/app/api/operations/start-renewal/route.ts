import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { addOperationJob } from '@/lib/queue'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

// Validation schema
const startRenewalSchema = z.object({
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'رقم الكارت يجب أن يحتوي على أرقام فقط'),
})

/**
 * POST /api/operations/start-renewal
 * 
 * بدء عملية التجديد التفاعلية (Wizard)
 * - يُنشئ Operation بحالة PENDING
 * - يرسل Job للـ Worker لبدء الجلسة واستخراج الباقات
 * - يُرجع operationId للمتابعة
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
        const validationResult = startRenewalSchema.safeParse(body)

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
                status: { in: ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'COMPLETING'] },
            },
        })

        if (existingOperation) {
            return NextResponse.json(
                { error: 'هناك عملية جارية لهذا الكارت', operationId: existingOperation.id },
                { status: 400 }
            )
        }

        // 5. Create operation (no balance deduction yet - will be done after package selection)
        const operation = await prisma.operation.create({
            data: {
                userId: session.user.id,
                type: 'RENEW',
                cardNumber,
                amount: 0, // سيُحدد بعد اختيار الباقة
                status: 'PENDING',
            },
        })

        // 6. Log activity
        await prisma.activityLog.create({
            data: {
                userId: session.user.id,
                action: 'RENEWAL_STARTED',
                details: `بدء تجديد للكارت ****${cardNumber.slice(-4)}`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            },
        })

        // 7. Add job to queue (start-renewal type)
        try {
            await addOperationJob({
                operationId: operation.id,
                type: 'START_RENEWAL',
                cardNumber,
                userId: session.user.id,
            })
        } catch (queueError) {
            console.error('Failed to add job to queue:', queueError)
            // Update operation status to FAILED
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
            message: 'جاري بدء عملية التجديد...',
        })

    } catch (error) {
        console.error('Start renewal error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
