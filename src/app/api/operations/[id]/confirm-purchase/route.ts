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
 * Confirm final payment
 * - Verifies operation is in AWAITING_FINAL_CONFIRM state
 * - Deducts balance from user (deferred payment)
 * - Sends job to Worker to press OK button
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
                { error: 'Unauthorized' },
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
                { error: 'Rate limit exceeded' },
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
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership
        if (operation.userId !== authUser.id) {
            return NextResponse.json(
                { error: 'Unauthorized access to this operation' },
                { status: 403 }
            )
        }

        // Check status
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { error: 'Operation is not in final confirmation stage' },
                { status: 400 }
            )
        }

        // Check if expired
        if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
            return NextResponse.json(
                { error: 'Confirmation timeout - please start a new operation' },
                { status: 400 }
            )
        }

        // Get price from selectedPackage
        const selectedPkg = operation.selectedPackage as { price: number; name: string } | null
        const dealerPrice = selectedPkg?.price

        if (!dealerPrice || dealerPrice <= 0) {
            return NextResponse.json(
                { error: 'Invalid package price' },
                { status: 400 }
            )
        }

        // 3. CRITICAL: Atomically change status to prevent duplicate confirm jobs
        // Must run BEFORE money deduction to prevent double-charging
        const confirmGuard = await prisma.operation.updateMany({
            where: { id, status: 'AWAITING_FINAL_CONFIRM' },
            data: { status: 'COMPLETING', responseMessage: 'Confirming payment...' }
        })

        if (confirmGuard.count === 0) {
            return NextResponse.json(
                { error: 'Operation is already being confirmed' },
                { status: 409 }
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
                        notes: `Renewal ${selectedPkg?.name || 'package'} for card ${operation.cardNumber}`,
                    }
                })
            })
        } else {
            // OLD flow: money was already deducted at select-package (deployment transition)
            console.log(`ℹ️ Operation ${id} already has amount ${operation.amount} — skipping deduction (old flow)`)
            finalAmount = operation.amount
        }

        // 4. Add CONFIRM_PURCHASE job to queue (only one will ever reach here)
        try {
            await addOperationJob({
                operationId: id,
                type: 'CONFIRM_PURCHASE',
                cardNumber: operation.cardNumber,
                userId: authUser.id,
                amount: finalAmount,
            })
        } catch (jobError) {
            // CRITICAL: Job creation failed AFTER money was deducted — refund immediately
            console.error(`❌ addOperationJob failed for ${id}, refunding ${finalAmount}:`, jobError)
            try {
                await prisma.$transaction(async (tx) => {
                    const updatedUser = await tx.user.update({
                        where: { id: authUser.id },
                        data: { balance: { increment: finalAmount } }
                    })
                    await tx.operation.update({
                        where: { id },
                        data: { status: 'FAILED', amount: 0, responseMessage: 'System error - amount refunded' }
                    })
                    await tx.transaction.create({
                        data: {
                            userId: authUser.id,
                            type: 'REFUND',
                            amount: finalAmount,
                            balanceAfter: updatedUser.balance,
                            operationId: id,
                            notes: 'Auto-refund: job queue unavailable'
                        }
                    })
                })
            } catch (refundError) {
                console.error(`❌ CRITICAL: Failed to refund ${id}:`, refundError)
            }
            return NextResponse.json(
                { error: 'System error - amount refunded to your balance' },
                { status: 500 }
            )
        }

        // 5. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            message: 'Confirming payment...',
        })

    } catch (error) {
        const msg = error instanceof Error ? error.message : ''
        if (msg === 'INSUFFICIENT_BALANCE') {
            // Revert status — money was NOT deducted ($transaction rolled back)
            // but status was already changed to COMPLETING at line 113
            try {
                await prisma.operation.update({
                    where: { id: (await params).id },
                    data: { status: 'AWAITING_FINAL_CONFIRM', responseMessage: 'Insufficient balance - please top up' }
                })
            } catch { /* best effort */ }
            return NextResponse.json(
                { error: 'Insufficient balance' },
                { status: 400 }
            )
        }
        console.error('Confirm purchase error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
