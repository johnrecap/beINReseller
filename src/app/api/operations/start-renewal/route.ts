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

        // 2. Check permission - only users with SUBSCRIPTION_RENEW can access
        if (!roleHasPermission(authUser.role, PERMISSIONS.SUBSCRIPTION_RENEW)) {
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
                userId: authUser.id,
                type: 'RENEW',
                cardNumber,
                amount: 0, // سيُحدد بعد اختيار الباقة
                status: 'PENDING',
            },
        })

        // 6. Log activity
        await prisma.$transaction([
            prisma.activityLog.create({
                data: {
                    userId: authUser.id,
                    action: 'RENEWAL_STARTED',
                    details: `بدء تجديد للكارت ****${cardNumber.slice(-4)}`,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            }),
            prisma.userAction.create({
                data: {
                    userId: authUser.id,
                    actionType: 'RENEWAL_STARTED',
                    details: { cardNumber: cardNumber.slice(-4), operationId: operation.id },
                    // If user has a manager, you might want to link it here, 
                    // but we need to fetch manager info first. 
                    // For now, we rely on the DB relation user.managerLink to join data later.
                }
            })
        ])

        // 7. Add job to queue (start-renewal type)
        try {
            await addOperationJob({
                operationId: operation.id,
                type: 'START_RENEWAL',
                cardNumber,
                userId: authUser.id,
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

        // 8. Return success with full operation object for Flutter
        return NextResponse.json({
            success: true,
            operationId: operation.id,
            message: 'جاري بدء عملية التجديد...',
            // Include full operation for Flutter compatibility
            operation: {
                id: operation.id,
                userId: operation.userId,
                type: operation.type,
                cardNumber: operation.cardNumber,
                amount: operation.amount,
                status: operation.status,
                createdAt: operation.createdAt.toISOString(),
            },
        })

    } catch (error) {
        console.error('Start renewal error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
