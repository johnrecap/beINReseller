/**
 * GET /api/mobile/subscriptions/status/[operationId]
 * 
 * Get operation status
 * - Return operation status
 * - Return packages if available
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'

interface RouteParams {
    params: Promise<{ operationId: string }>
}

export const GET = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload, routeContext?: RouteParams) => {
    try {
        // Extract operationId from URL path
        const url = new URL(request.url)
        const pathParts = url.pathname.split('/')
        const operationId = pathParts[pathParts.length - 1]

        if (!operationId) {
            return NextResponse.json(
                { success: false, error: 'معرف العملية مطلوب' },
                { status: 400 }
            )
        }

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id: operationId }
        })

        if (!operation) {
            return NextResponse.json(
                { success: false, error: 'العملية غير موجودة' },
                { status: 404 }
            )
        }

        // Verify ownership
        if (operation.customerId !== customer.customerId) {
            return NextResponse.json(
                { success: false, error: 'غير مصرح' },
                { status: 403 }
            )
        }

        // Build response based on status
        const response: Record<string, unknown> = {
            success: true,
            operation: {
                id: operation.id,
                status: operation.status,
                cardNumber: operation.cardNumber,
                type: operation.type,
                createdAt: operation.createdAt
            }
        }

        // Include packages if available (AWAITING_PACKAGE status)
        if (operation.status === 'AWAITING_PACKAGE' && operation.availablePackages) {
            response.packages = operation.availablePackages
            response.stbNumber = operation.stbNumber
        }

        // Include error message if failed
        if (operation.status === 'FAILED') {
            response.error = operation.responseMessage || operation.error || 'حدث خطأ'
        }

        // Include result if completed
        if (operation.status === 'COMPLETED') {
            response.result = operation.responseData
            response.message = operation.responseMessage
        }

        return NextResponse.json(response)

    } catch (error) {
        console.error('Get operation status error:', error)
        return NextResponse.json(
            { success: false, error: 'حدث خطأ في جلب حالة العملية' },
            { status: 500 }
        )
    }
})
