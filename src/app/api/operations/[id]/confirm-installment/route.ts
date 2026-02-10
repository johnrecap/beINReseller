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
    if (session?.user?.id) {
        return session.user
    }
    return getMobileUserFromRequest(request)
}

interface RouteParams {
    params: Promise<{ id: string }>
}

/**
 * POST /api/operations/[id]/confirm-installment
 * 
 * Confirm and execute installment payment
 * User has reviewed the installment details and confirms payment
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: operationId } = await params

        // Check authentication
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'غير مصرح' },
                { status: 401 }
            )
        }

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                userId: true,
                status: true,
                cardNumber: true,
                amount: true,
                responseData: true, // CRITICAL: Need this to get the actual price
                finalConfirmExpiry: true,
            }
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'العملية غير موجودة' },
                { status: 404 }
            )
        }

        // Check ownership
        if (operation.userId !== authUser.id && authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'غير مصرح بالوصول لهذه العملية' },
                { status: 403 }
            )
        }

        // Verify status is awaiting confirmation
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { error: 'العملية ليست في حالة انتظار التأكيد' },
                { status: 400 }
            )
        }

        // Check if confirmation has expired
        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            // Mark as failed
            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    status: 'FAILED',
                    responseMessage: 'انتهت مهلة التأكيد'
                }
            })

            return NextResponse.json(
                { error: 'انتهت مهلة التأكيد' },
                { status: 400 }
            )
        }

        // Get dealer price from responseData
        const responseData = operation.responseData ? JSON.parse(operation.responseData as string) : null
        const dealerPrice = responseData?.installment?.dealerPrice || 0

        if (dealerPrice <= 0) {
            return NextResponse.json(
                { error: 'سعر القسط غير صالح' },
                { status: 400 }
            )
        }

        // Check user balance against dealerPrice
        const user = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: { balance: true }
        })

        if (!user || user.balance < dealerPrice) {
            return NextResponse.json(
                { error: 'رصيد غير كافي' },
                { status: 400 }
            )
        }

        // Deduct balance
        await prisma.user.update({
            where: { id: authUser.id },
            data: {
                balance: { decrement: dealerPrice }
            }
        })

        // Update operation status + set amount NOW (after payment)
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETING',
                amount: dealerPrice // Set amount only AFTER deduction so refund is correct
            }
        })

        // Add job to queue for final payment
        try {
            await addOperationJob({
                operationId: operation.id,
                type: 'CONFIRM_INSTALLMENT',
                cardNumber: operation.cardNumber,
                userId: authUser.id,
                amount: dealerPrice, // Pass the actual price
            })
        } catch (queueError) {
            console.error('Failed to add confirm job to queue:', queueError)

            // Refund on failure
            await prisma.user.update({
                where: { id: authUser.id },
                data: {
                    balance: { increment: dealerPrice }
                }
            })

            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    status: 'FAILED',
                    responseMessage: 'فشل في تأكيد الدفع'
                }
            })

            return NextResponse.json(
                { error: 'فشل في تأكيد الدفع، تم إرجاع المبلغ' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'جاري إتمام الدفع...'
        })

    } catch (error) {
        console.error('Confirm installment error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
