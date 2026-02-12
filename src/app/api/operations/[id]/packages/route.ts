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
 * Fetch available packages for operation
 * - Verifies operation is in AWAITING_PACKAGE state
 * - Returns packages extracted from beIN
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
                { error: 'Unauthorized' },
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
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // 3. Check ownership (user can only see their own operations)
        if (operation.userId !== authUser.id && authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized access to this operation' },
                { status: 403 }
            )
        }

        // 4. Check status
        if (operation.status === 'AWAITING_CAPTCHA') {
            return NextResponse.json({
                success: true,
                status: 'AWAITING_CAPTCHA',
                message: 'Waiting for CAPTCHA solution',
            })
        }

        if (operation.status === 'PENDING' || operation.status === 'PROCESSING') {
            return NextResponse.json({
                success: true,
                status: operation.status,
                message: 'Loading packages...',
                responseMessage: operation.responseMessage,
            })
        }

        if (operation.status === 'FAILED') {
            return NextResponse.json({
                success: false,
                status: 'FAILED',
                message: operation.responseMessage || 'Operation failed',
            })
        }

        if (operation.status === 'COMPLETING') {
            return NextResponse.json({
                success: true,
                status: 'COMPLETING',
                message: 'Completing purchase...',
                responseMessage: operation.responseMessage,
            })
        }

        if (operation.status === 'COMPLETED') {
            return NextResponse.json({
                success: true,
                status: 'COMPLETED',
                message: operation.responseMessage || 'Renewal successful!',
            })
        }

        // Handle AWAITING_FINAL_CONFIRM - return package info for confirmation dialog
        if (operation.status === 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json({
                success: true,
                status: 'AWAITING_FINAL_CONFIRM',
                message: 'Awaiting final confirmation',
                cardNumber: operation.cardNumber,
                stbNumber: operation.stbNumber,
                selectedPackage: operation.selectedPackage,
                finalConfirmExpiry: operation.finalConfirmExpiry,
            })
        }

        if (operation.status !== 'AWAITING_PACKAGE') {
            return NextResponse.json({
                success: false,
                status: operation.status,
                message: 'Operation is not in package selection stage',
            })
        }

        // 5. Return packages
        return NextResponse.json({
            success: true,
            status: 'AWAITING_PACKAGE',
            cardNumber: operation.cardNumber,
            stbNumber: operation.stbNumber,
            packages: operation.availablePackages || [],
            message: 'Choose the appropriate package',
        })

    } catch (error) {
        console.error('Get packages error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
