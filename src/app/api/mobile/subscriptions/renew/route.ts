/**
 * POST /api/mobile/subscriptions/renew
 * 
 * Renew subscription with selected package
 * - Validate wallet balance
 * - Deduct from wallet
 * - Create WalletTransaction
 * - Queue renewal job
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCustomerAuth, CustomerTokenPayload } from '@/lib/customer-auth'
import { addCustomerOperationJob } from '@/lib/queue'

interface PackageSelection {
    packageId: string
    packageName: string
    price: number
    duration: string
}

export const POST = withCustomerAuth(async (request: NextRequest, customer: CustomerTokenPayload) => {
    try {
        const body = await request.json()
        const { operationId, selectedPackage } = body as {
            operationId: string
            selectedPackage: PackageSelection
        }

        if (!operationId || !selectedPackage) {
            return NextResponse.json(
                { success: false, error: 'Operation ID and package are required' },
                { status: 400 }
            )
        }

        if (!selectedPackage.price || selectedPackage.price <= 0) {
            return NextResponse.json(
                { success: false, error: 'Invalid package price' },
                { status: 400 }
            )
        }

        // Get operation and verify ownership
        const operation = await prisma.operation.findUnique({
            where: { id: operationId }
        })

        if (!operation) {
            return NextResponse.json(
                { success: false, error: 'Operation not found' },
                { status: 404 }
            )
        }

        if (operation.customerId !== customer.customerId) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 403 }
            )
        }

        if (operation.status !== 'AWAITING_PACKAGE') {
            return NextResponse.json(
                { success: false, error: 'Operation is not awaiting package selection' },
                { status: 400 }
            )
        }

        // Get customer wallet balance
        const customerData = await prisma.customer.findUnique({
            where: { id: customer.customerId },
            select: { walletBalance: true, storeCredit: true }
        })

        if (!customerData) {
            return NextResponse.json(
                { success: false, error: 'Account not found' },
                { status: 404 }
            )
        }

        const totalAvailable = customerData.walletBalance + customerData.storeCredit
        const price = selectedPackage.price

        if (totalAvailable < price) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Insufficient balance',
                    code: 'INSUFFICIENT_BALANCE',
                    required: price,
                    available: totalAvailable
                },
                { status: 400 }
            )
        }

        // Deduct from wallet (use storeCredit first, then walletBalance)
        let creditDeduction = Math.min(customerData.storeCredit, price)
        let walletDeduction = price - creditDeduction

        // Transaction: deduct wallet and update operation
        await prisma.$transaction(async (tx) => {
            const balanceBefore = customerData.walletBalance

            // Update customer balance
            await tx.customer.update({
                where: { id: customer.customerId },
                data: {
                    storeCredit: { decrement: creditDeduction },
                    walletBalance: { decrement: walletDeduction }
                }
            })

            // Create wallet transaction
            await tx.walletTransaction.create({
                data: {
                    customerId: customer.customerId,
                    type: 'DEBIT',
                    amount: price,
                    balanceBefore,
                    balanceAfter: balanceBefore - walletDeduction,
                    description: `Subscription renewal - ${selectedPackage.packageName}`,
                    referenceType: 'RENEWAL',
                    referenceId: operationId
                }
            })

            // Update operation with selected package
            await tx.operation.update({
                where: { id: operationId },
                data: {
                    status: 'COMPLETING',
                    amount: price,
                    selectedPackage: selectedPackage as any,
                    duration: selectedPackage.duration
                }
            })
        })

        // Queue renewal job
        await addCustomerOperationJob({
            operationId,
            type: 'RENEW',
            cardNumber: operation.cardNumber,
            duration: selectedPackage.duration,
            customerId: customer.customerId,
            amount: price
        })

        return NextResponse.json({
            success: true,
            message: 'Renewing subscription',
            operationId,
            deducted: price
        })

    } catch (error) {
        console.error('Renew subscription error:', error)
        return NextResponse.json(
            { success: false, error: 'Error renewing subscription' },
            { status: 500 }
        )
    }
})
