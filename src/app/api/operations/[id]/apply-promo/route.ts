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

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const { promoCode } = await request.json()

        if (!promoCode) {
            return NextResponse.json({ error: 'Please enter a promo code' }, { status: 400 })
        }

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
        })

        if (!operation) {
            return NextResponse.json({ error: 'Operation not found' }, { status: 404 })
        }

        // Check ownership
        if (operation.userId !== authUser.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Must be awaiting package selection
        if (operation.status !== 'AWAITING_PACKAGE') {
            return NextResponse.json(
                { error: 'Operation is not in package selection stage' },
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
            userId: authUser.id,
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
                            message: 'Promo code applied',
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
            error: 'Timeout - please try again',
        }, { status: 408 })

    } catch (error) {
        console.error('Apply promo error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
