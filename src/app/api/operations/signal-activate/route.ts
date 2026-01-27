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
const signalActivateSchema = z.object({
    operationId: z.string().min(1, 'Operation ID is required'),
    cardNumber: z.string().min(10).max(16).regex(/^\d+$/, 'رقم الكارت يجب أن يحتوي على أرقام فقط'),
})

/**
 * POST /api/operations/signal-activate
 * 
 * Step 2: Activate signal for a card (assumes check was done)
 * - Validates the operation exists and is ready for activation
 * - Sends SIGNAL_ACTIVATE job to Worker
 * - Returns operationId for polling
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
        const validationResult = signalActivateSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'بيانات غير صحيحة', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { operationId, cardNumber } = validationResult.data

        // 4. Get the existing operation
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                userId: true,
                cardNumber: true,
                status: true,
                responseData: true,
            },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'العملية غير موجودة' },
                { status: 404 }
            )
        }

        // Verify ownership
        if (operation.userId !== authUser.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 403 }
            )
        }

        // Check if operation is ready for activation
        const responseData = typeof operation.responseData === 'string'
            ? JSON.parse(operation.responseData)
            : operation.responseData

        if (!responseData?.awaitingActivate) {
            return NextResponse.json(
                { error: 'العملية غير جاهزة للتفعيل' },
                { status: 400 }
            )
        }

        // 5. Update operation status back to PENDING for activation
        await prisma.operation.update({
            where: { id: operationId },
            data: { status: 'PENDING' },
        })

        // 6. Log activity
        await prisma.activityLog.create({
            data: {
                userId: authUser.id,
                action: 'SIGNAL_ACTIVATE_STARTED',
                details: `تفعيل إشارة للكارت ****${cardNumber.slice(-4)}`,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            },
        })

        // 7. Add SIGNAL_ACTIVATE job to queue
        try {
            await addOperationJob({
                operationId,
                type: 'SIGNAL_ACTIVATE',
                cardNumber,
                userId: authUser.id,
            })
        } catch (queueError) {
            console.error('Failed to add signal activate job to queue:', queueError)
            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    status: 'FAILED',
                    responseMessage: 'فشل في إضافة العملية للطابور'
                },
            })
            return NextResponse.json(
                { error: 'فشل في بدء التفعيل، حاول مرة أخرى' },
                { status: 500 }
            )
        }

        // 8. Return success
        return NextResponse.json({
            success: true,
            operationId,
            message: 'جاري تفعيل الإشارة...',
        })

    } catch (error) {
        console.error('Signal activate error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
