/**
 * PUT /api/mobile/profile/password
 * 
 * Change customer password
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { withCustomerAuth, CustomerTokenPayload, isValidPassword } from '@/lib/customer-auth'

export const PUT = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const body = await request.json()
        const { currentPassword, newPassword } = body

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { success: false, error: 'كلمة المرور الحالية والجديدة مطلوبان' },
                { status: 400 }
            )
        }

        // Validate new password
        const passwordCheck = isValidPassword(newPassword)
        if (!passwordCheck.valid) {
            return NextResponse.json(
                { success: false, error: passwordCheck.message },
                { status: 400 }
            )
        }

        // Get customer
        const customerData = await prisma.customer.findUnique({
            where: { id: customer.customerId },
            select: { passwordHash: true }
        })

        if (!customerData) {
            return NextResponse.json(
                { success: false, error: 'الحساب غير موجود' },
                { status: 404 }
            )
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, customerData.passwordHash)
        if (!isValid) {
            return NextResponse.json(
                { success: false, error: 'كلمة المرور الحالية غير صحيحة' },
                { status: 400 }
            )
        }

        // Check if new password is same as current
        const isSame = await bcrypt.compare(newPassword, customerData.passwordHash)
        if (isSame) {
            return NextResponse.json(
                { success: false, error: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية' },
                { status: 400 }
            )
        }

        // Update password
        const newHash = await bcrypt.hash(newPassword, 12)

        await prisma.customer.update({
            where: { id: customer.customerId },
            data: { passwordHash: newHash }
        })

        return NextResponse.json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح'
        })

    } catch (error) {
        console.error('Change password error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في تغيير كلمة المرور' },
            { status: 500 }
        )
    }
})
