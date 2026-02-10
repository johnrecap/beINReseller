import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { addOperationJob } from '@/lib/queue'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

// Validation schema
const selectPackageSchema = z.object({
    packageIndex: z.number().int().min(0),
    promoCode: z.string().optional(),
})

interface AvailablePackage {
    index: number
    name: string
    price: number
    checkboxSelector: string
}

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

/**
 * POST /api/operations/[id]/select-package
 * 
 * اختيار الباقة وإتمام الشراء
 * - يتحقق أن العملية في حالة AWAITING_PACKAGE
 * - يخصم الرصيد من المستخدم
 * - يرسل Job للـ Worker لإتمام الشراء
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

        // 2. Parse and validate input
        const body = await request.json()
        const validationResult = selectPackageSchema.safeParse(body)

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'بيانات غير صالحة', details: validationResult.error.flatten() },
                { status: 400 }
            )
        }

        const { packageIndex, promoCode } = validationResult.data

        // 3. Get operation with transaction lock
        const result = await prisma.$transaction(async (tx) => {
            // Get operation
            const operation = await tx.operation.findUnique({
                where: { id },
                select: {
                    id: true,
                    userId: true,
                    cardNumber: true,
                    status: true,
                    stbNumber: true,
                    availablePackages: true,
                },
            })

            if (!operation) {
                throw new Error('OPERATION_NOT_FOUND')
            }

            // Check ownership
            if (operation.userId !== authUser.id) {
                throw new Error('FORBIDDEN')
            }

            // Check status
            if (operation.status !== 'AWAITING_PACKAGE') {
                throw new Error('INVALID_STATUS')
            }

            // Parse and validate package selection
            const packages = operation.availablePackages as AvailablePackage[] | null
            if (!packages || !Array.isArray(packages)) {
                throw new Error('NO_PACKAGES')
            }

            const selectedPackage = packages.find(p => p.index === packageIndex)
            if (!selectedPackage) {
                throw new Error('PACKAGE_NOT_FOUND')
            }

            // Get user balance
            const user = await tx.user.findUnique({
                where: { id: authUser.id },
                select: { id: true, balance: true },
            })

            if (!user) {
                throw new Error('USER_NOT_FOUND')
            }

            // Check balance (use package price from beIN)
            const price = selectedPackage.price
            if (user.balance < price) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            // Deduct balance
            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: { balance: { decrement: price } },
            })

            // Double-check balance didn't go negative
            if (updatedUser.balance < 0) {
                throw new Error('INSUFFICIENT_BALANCE')
            }

            // Update operation
            const updatedOperation = await tx.operation.update({
                where: { id: operation.id },
                data: {
                    status: 'COMPLETING',
                    amount: price,
                    selectedPackage: JSON.parse(JSON.stringify(selectedPackage)),
                    promoCode: promoCode || null,
                },
            })

            // Create transaction record
            await tx.transaction.create({
                data: {
                    userId: user.id,
                    type: 'OPERATION_DEDUCT',
                    amount: -price,
                    balanceAfter: updatedUser.balance,
                    operationId: operation.id,
                    notes: `تجديد ${selectedPackage.name} للكارت ${operation.cardNumber}`,
                },
            })

            return {
                operation: updatedOperation,
                selectedPackage,
                newBalance: updatedUser.balance,
            }
        })

        // 4. Add job to queue to complete purchase
        try {
            await addOperationJob({
                operationId: id,
                type: 'COMPLETE_PURCHASE',
                cardNumber: result.operation.cardNumber,
                promoCode,
                userId: authUser.id,
                amount: result.selectedPackage.price,
            })
        } catch (queueError) {
            console.error('Failed to add complete job to queue:', queueError)
            // We don't rollback the balance here - the operation is in COMPLETING state
            // and can be retried or refunded later
        }

        // 5. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            selectedPackage: result.selectedPackage.name,
            amount: result.selectedPackage.price,
            newBalance: result.newBalance,
            message: 'جاري إتمام الشراء...',
        })

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Select package error:', errorMessage)

        const errorMap: Record<string, { message: string; status: number }> = {
            'OPERATION_NOT_FOUND': { message: 'العملية غير موجودة', status: 404 },
            'FORBIDDEN': { message: 'غير مصرح بالوصول لهذه العملية', status: 403 },
            'INVALID_STATUS': { message: 'العملية ليست في مرحلة اختيار الباقة', status: 400 },
            'NO_PACKAGES': { message: 'لا توجد باقات متاحة', status: 400 },
            'PACKAGE_NOT_FOUND': { message: 'الباقة المختارة غير موجودة', status: 400 },
            'USER_NOT_FOUND': { message: 'المستخدم غير موجود', status: 404 },
            'INSUFFICIENT_BALANCE': { message: 'رصيد غير كافي', status: 400 },
        }

        const errorInfo = errorMap[errorMessage]
        if (errorInfo) {
            return NextResponse.json(
                { error: errorInfo.message },
                { status: errorInfo.status }
            )
        }

        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
