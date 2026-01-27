import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
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
 * GET /api/operations/[id]/packages
 * 
 * جلب الباقات المتاحة للعملية
 * - يتحقق أن العملية في حالة AWAITING_PACKAGE
 * - يُرجع الباقات المستخرجة من beIN
 */
export async function GET(
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
                stbNumber: true,
                availablePackages: true,
                responseMessage: true,
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

        // 3. Check ownership (user can only see their own operations)
        if (operation.userId !== authUser.id && authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'غير مصرح بالوصول لهذه العملية' },
                { status: 403 }
            )
        }

        // 4. Check status
        if (operation.status === 'AWAITING_CAPTCHA') {
            return NextResponse.json({
                success: true,
                status: 'AWAITING_CAPTCHA',
                message: 'في انتظار حل الكابتشا',
            })
        }

        if (operation.status === 'PENDING' || operation.status === 'PROCESSING') {
            return NextResponse.json({
                success: true,
                status: operation.status,
                message: 'جاري تحميل الباقات...',
            })
        }

        if (operation.status === 'FAILED') {
            return NextResponse.json({
                success: false,
                status: 'FAILED',
                message: operation.responseMessage || 'فشلت العملية',
            })
        }

        if (operation.status === 'COMPLETING') {
            return NextResponse.json({
                success: true,
                status: 'COMPLETING',
                message: 'جاري إتمام الشراء...',
            })
        }

        if (operation.status === 'COMPLETED') {
            return NextResponse.json({
                success: true,
                status: 'COMPLETED',
                message: operation.responseMessage || 'تم التجديد بنجاح!',
            })
        }

        // Handle AWAITING_FINAL_CONFIRM - return package info for confirmation dialog
        if (operation.status === 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json({
                success: true,
                status: 'AWAITING_FINAL_CONFIRM',
                message: 'في انتظار التأكيد النهائي',
                cardNumber: `****${operation.cardNumber.slice(-4)}`,
                stbNumber: operation.stbNumber,
                selectedPackage: operation.selectedPackage,
                finalConfirmExpiry: operation.finalConfirmExpiry,
            })
        }

        if (operation.status !== 'AWAITING_PACKAGE') {
            return NextResponse.json({
                success: false,
                status: operation.status,
                message: 'العملية ليست في مرحلة اختيار الباقة',
            })
        }

        // 5. Return packages
        return NextResponse.json({
            success: true,
            status: 'AWAITING_PACKAGE',
            cardNumber: `****${operation.cardNumber.slice(-4)}`,
            stbNumber: operation.stbNumber,
            packages: operation.availablePackages || [],
            message: 'اختر الباقة المناسبة',
        })

    } catch (error) {
        console.error('Get packages error:', error)
        return NextResponse.json(
            { error: 'حدث خطأ في الخادم' },
            { status: 500 }
        )
    }
}
