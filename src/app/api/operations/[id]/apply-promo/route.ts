import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { addOperationJob } from '@/lib/queue'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const { id } = await params
        const { promoCode } = await request.json()

        if (!promoCode) {
            return NextResponse.json({ error: 'الرجاء إدخال كود الخصم' }, { status: 400 })
        }

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
        })

        if (!operation) {
            return NextResponse.json({ error: 'العملية غير موجودة' }, { status: 404 })
        }

        // Check ownership
        if (operation.userId !== session.user.id) {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
        }

        // Must be awaiting package selection
        if (operation.status !== 'AWAITING_PACKAGE') {
            return NextResponse.json(
                { error: 'العملية ليست في مرحلة اختيار الباقة' },
                { status: 400 }
            )
        }

        // Save promo code to operation
        await prisma.operation.update({
            where: { id },
            data: {
                promoCode,
                responseData: JSON.stringify({ promoApplied: false, refreshing: true }),
            },
        })

        // Add job to queue to apply promo
        await addOperationJob({
            operationId: id,
            type: 'APPLY_PROMO',
            promoCode,
            userId: session.user.id,
            cardNumber: operation.cardNumber,
        })

        // Poll for updated packages (wait up to 30 seconds)
        const maxWait = 30000
        const pollInterval = 2000
        let elapsed = 0

        while (elapsed < maxWait) {
            await new Promise(resolve => setTimeout(resolve, pollInterval))
            elapsed += pollInterval

            const updatedOp = await prisma.operation.findUnique({
                where: { id },
            })

            // Check if packages were updated via responseData
            if (updatedOp?.responseData) {
                try {
                    const data = JSON.parse(String(updatedOp.responseData))
                    if (data.promoApplied === true && Array.isArray(data.packages)) {
                        return NextResponse.json({
                            success: true,
                            message: 'تم تطبيق كود الخصم',
                            packages: data.packages,
                        })
                    }
                } catch {
                    // Not valid JSON, continue
                }
            }
        }

        return NextResponse.json({
            success: false,
            error: 'انتهت مهلة الانتظار - حاول مرة أخرى',
        }, { status: 408 })

    } catch (error) {
        console.error('Apply promo error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
