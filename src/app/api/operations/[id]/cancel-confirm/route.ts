import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { addOperationJob } from '@/lib/queue'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

/**
 * POST /api/operations/[id]/cancel-confirm
 * 
 * إلغاء التأكيد النهائي
 * - يتحقق أن العملية في حالة AWAITING_FINAL_CONFIRM
 * - يرسل Job للـ Worker لضغط زر Cancel في popup
 * - يتم إرجاع الرصيد للمستخدم
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 1. Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        const { id } = await params

        // 2. Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                cardNumber: true,
                status: true,
                amount: true,
                selectedPackage: true,
            },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'العملية غير موجودة' },
                { status: 404 }
            )
        }

        // Check ownership
        if (operation.userId !== authUser.id) {
            return NextResponse.json(
                { error: 'غير مصرح بالوصول لهذه العملية' },
                { status: 403 }
            )
        }

        // Check status - only allow cancel from AWAITING_FINAL_CONFIRM
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { error: 'العملية ليست في مرحلة التأكيد النهائي' },
                { status: 400 }
            )
        }

        // 3. CRITICAL: Atomically change status to prevent duplicate cancel jobs
        // Uses updateMany with status filter - if two cancel calls arrive simultaneously,
        // only the first one matches AWAITING_FINAL_CONFIRM and succeeds (count=1).
        // The second call finds status=COMPLETING and gets count=0 → rejected.
        const updated = await prisma.operation.updateMany({
            where: { id, status: 'AWAITING_FINAL_CONFIRM' },
            data: { status: 'COMPLETING', responseMessage: 'جاري إلغاء العملية...' }
        })

        if (updated.count === 0) {
            // Another cancel request already changed the status
            return NextResponse.json(
                { error: 'العملية قيد الإلغاء بالفعل' },
                { status: 409 }
            )
        }

        // 4. Add CANCEL_CONFIRM job to queue (only one will ever reach here)
        await addOperationJob({
            operationId: id,
            type: 'CANCEL_CONFIRM',
            cardNumber: operation.cardNumber,
            userId: authUser.id,
            amount: operation.amount,
        })

        // 5. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            message: 'جاري إلغاء العملية...',
        })

    } catch (error) {
        console.error('Cancel confirm error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
