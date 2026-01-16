import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { addOperationJob } from '@/lib/queue'

/**
 * POST /api/operations/[id]/confirm-purchase
 * 
 * تأكيد الدفع النهائي
 * - يتحقق أن العملية في حالة AWAITING_FINAL_CONFIRM
 * - يرسل Job للـ Worker لضغط زر Ok
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 1. Check authentication
        const session = await auth()
        if (!session?.user?.id) {
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
                selectedPackage: true,
                finalConfirmExpiry: true,
            },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'العملية غير موجودة' },
                { status: 404 }
            )
        }

        // Check ownership
        if (operation.userId !== session.user.id) {
            return NextResponse.json(
                { error: 'غير مصرح بالوصول لهذه العملية' },
                { status: 403 }
            )
        }

        // Check status
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { error: 'العملية ليست في مرحلة التأكيد النهائي' },
                { status: 400 }
            )
        }

        // Check if expired
        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            return NextResponse.json(
                { error: 'انتهت مهلة التأكيد - يرجى بدء عملية جديدة' },
                { status: 400 }
            )
        }

        // 3. Add CONFIRM_PURCHASE job to queue
        await addOperationJob({
            operationId: id,
            type: 'CONFIRM_PURCHASE',
            cardNumber: operation.cardNumber,
            userId: session.user.id,
        })

        // 4. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            message: 'جاري تأكيد الدفع...',
        })

    } catch (error) {
        console.error('Confirm purchase error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
