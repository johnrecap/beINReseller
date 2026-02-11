import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { addOperationJob } from '@/lib/queue'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'
import { withRateLimit, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limiter'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

/**
 * POST /api/operations/[id]/confirm-purchase
 * 
 * تأكيد الدفع النهائي
 * - يتحقق أن العملية في حالة AWAITING_FINAL_CONFIRM
 * - يخصم الرصيد من المستخدم (deferred payment)
 * - يرسل Job للـ Worker لضغط زر Ok
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

        // Rate limit check
        const { allowed, result: rateLimitResult } = await withRateLimit(
            `financial:${authUser.id}`,
            RATE_LIMITS.financial
        )
        if (!allowed) {
            return NextResponse.json(
                { error: 'تم تجاوز الحد المسموح من الطلبات' },
                { status: 429, headers: rateLimitHeaders(rateLimitResult) }
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
                amount: true,
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

        // Get price from selectedPackage
        const selectedPkg = operation.selectedPackage as { price: number; name: string } | null
        const dealerPrice = selectedPkg?.price

        if (!dealerPrice || dealerPrice <= 0) {
            return NextResponse.json(
                { error: 'سعر الباقة غير صالح' },
                { status: 400 }
            )
        }

        // Deduct balance NOW — only if not already deducted (deployment safety)
        let finalAmount = dealerPrice
        if (operation.amount === 0) {
            // NEW flow: deferred payment — deduct at confirm time
            await prisma.$transaction(async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: authUser.id },
                    select: { balance: true }
                })

                if (!user || user.balance < dealerPrice) {
                    throw new Error('INSUFFICIENT_BALANCE')
                }

                const updatedUser = await tx.user.update({
                    where: { id: authUser.id },
                    data: { balance: { decrement: dealerPrice } }
                })

                if (updatedUser.balance < 0) {
                    throw new Error('INSUFFICIENT_BALANCE')
                }

                // Set operation amount (so refund paths have correct amount)
                await tx.operation.update({
                    where: { id },
                    data: { amount: dealerPrice }
                })

                // Create deduction transaction record
                await tx.transaction.create({
                    data: {
                        userId: authUser.id,
                        type: 'OPERATION_DEDUCT',
                        amount: -dealerPrice,
                        balanceAfter: updatedUser.balance,
                        operationId: id,
                        notes: `تجديد ${selectedPkg?.name || 'باقة'} للكارت ${operation.cardNumber}`,
                    }
                })
            })
        } else {
            // OLD flow: money was already deducted at select-package (deployment transition)
            console.log(`ℹ️ Operation ${id} already has amount ${operation.amount} — skipping deduction (old flow)`)
            finalAmount = operation.amount
        }

        // 3. Add CONFIRM_PURCHASE job to queue
        await addOperationJob({
            operationId: id,
            type: 'CONFIRM_PURCHASE',
            cardNumber: operation.cardNumber,
            userId: authUser.id,
            amount: finalAmount,
        })

        // 4. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            message: 'جاري تأكيد الدفع...',
        })

    } catch (error) {
        const msg = error instanceof Error ? error.message : ''
        if (msg === 'INSUFFICIENT_BALANCE') {
            return NextResponse.json(
                { error: 'رصيد غير كافي' },
                { status: 400 }
            )
        }
        console.error('Confirm purchase error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
