import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { addOperationJob } from '@/lib/queue'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'
import { roleHasPermission } from '@/lib/auth-utils'
import { PERMISSIONS } from '@/lib/permissions'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    // Try web session first
    const session = await auth()
    if (session?.user?.id) {
        return session.user
    }
    // Fall back to mobile token
    return getMobileUserFromRequest(request)
}

// Validation schema
const signalRefreshSchema = z.object({
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'رقم الكارت يجب أن يحتوي على أرقام فقط'),
})

/**
 * POST /api/operations/signal-refresh
 * 
 * بدء عملية تجديد الإشارة (Signal Refresh)
 * - يُنشئ Operation بنوع SIGNAL_REFRESH
 * - يرسل Job للـ Worker لتجديد الإشارة
 * - يُرجع operationId للمتابعة
 */
export async function POST(request: NextRequest) {
    try {
        // 1. Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        // 2. Check permission - only users with SIGNAL_ACTIVATE can access
        if (!roleHasPermission(authUser.role, PERMISSIONS.SIGNAL_ACTIVATE)) {
            return NextResponse.json(
                { error: 'صلاحيات غير كافية' },
                { status: 403 }
            )
        }

        // 3. Check rate limit
        const { allowed, result: rateLimitResult } = await withRateLimit(
            `operations:${authUser.id}`,
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
        const validationResult = signalRefreshSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'رقم الكارت غير صحيح', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { cardNumber } = validationResult.data

        // 4. Check for duplicate pending/processing signal refresh operations for this card
        const existingOperation = await prisma.operation.findFirst({
            where: {
                cardNumber,
                type: 'SIGNAL_REFRESH',
                status: { in: ['PENDING', 'PROCESSING'] },
            },
        })

        if (existingOperation) {
            return NextResponse.json(
                { error: 'هناك عملية تجديد إشارة جارية لهذا الكارت', operationId: existingOperation.id },
                { status: 400 }
            )
        }

        // 5. Create operation (Signal refresh is free - no balance deduction)
        const operation = await prisma.operation.create({
            data: {
                userId: authUser.id,
                type: 'SIGNAL_REFRESH',
                cardNumber,
                amount: 0, // تجديد الإشارة مجاني
                status: 'PENDING',
            },
        })

        // 6. Log activity
        await prisma.activityLog.create({
            data: {
                userId: authUser.id,
                action: 'SIGNAL_REFRESH_STARTED',
                details: `بدء تجديد إشارة للكارت ****${cardNumber.slice(-4)}`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            },
        })

        // 7. Add job to queue
        try {
            await addOperationJob({
                operationId: operation.id,
                type: 'SIGNAL_REFRESH',
                cardNumber,
                userId: authUser.id,
            })
        } catch (queueError) {
            console.error('Failed to add signal refresh job to queue:', queueError)
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
            message: 'جاري تجديد الإشارة...',
        })

    } catch (error) {
        console.error('Signal refresh error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
