import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { parseOperationResponseData } from '@/lib/operation-safety'
import { publicPackageQuote, quoteData } from '../../../../../../shared/operations/package-quote'
import { projectOperationProgress } from '../../../../../../shared/operations/consumer-progress'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    return getAuthenticatedUser(request)
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
                promoCode: true,
                responseMessage: true,
                responseData: true,
                selectedPackage: true,
                finalConfirmExpiry: true,
                providerPaymentState: true,
                fulfillmentState: true,
                transactions: { where: { type: 'REFUND' }, select: { type: true } },
                refundSettlements: { select: { state: true } },
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

        const fulfillmentEvidence = parseOperationResponseData(operation.responseData)
        const progress = projectOperationProgress(operation)
        const respond = (body: Record<string, unknown>) => NextResponse.json({
            ...body, ...progress, messageKey: progress.messageKey ?? body.messageKey,
        })
        if (progress.confirmationExpired) return respond({ success: false, status: operation.status })

        // 4. Check status
        if (operation.status === 'AWAITING_CAPTCHA') {
            return respond({
                success: true,
                status: 'AWAITING_CAPTCHA',
                message: 'Waiting for CAPTCHA solution',
            })
        }

        if (operation.status === 'PENDING' || operation.status === 'PROCESSING') {
            return respond({
                success: true,
                status: operation.status,
                message: 'Loading packages...',
                responseMessage: operation.responseMessage,
            })
        }

        if (operation.status === 'FAILED') {
            return respond({
                success: false,
                status: 'FAILED',
                message: operation.responseMessage || 'Operation failed',
            })
        }

        if (operation.status === 'REVIEW_REQUIRED') {
            return respond({
                success: false,
                status: 'REVIEW_REQUIRED',
                code: 'RENEWAL_FULFILLMENT_REVIEW_REQUIRED',
                messageKey: fulfillmentEvidence.quoteConflict === true ? 'operations.packageQuoteChangedReview'
                    : fulfillmentEvidence.providerPaymentState === 'CHARGED'
                    ? 'operations.providerChargedFulfillmentUnderReview'
                    : 'operations.fulfillmentReviewPending',
                message: operation.responseMessage || 'Operation requires manual verification',
            })
        }

        if (operation.status === 'COMPLETING') {
            return respond({
                success: true,
                status: 'COMPLETING',
                message: 'Completing purchase...',
                messageKey: fulfillmentEvidence.providerPaymentState === 'CHARGED' &&
                    fulfillmentEvidence.fulfillmentState === 'VERIFYING'
                    ? 'operations.providerChargedVerifyingFulfillment'
                    : undefined,
                responseMessage: operation.responseMessage,
            })
        }

        if (operation.status === 'COMPLETED') {
            return respond({
                success: true,
                status: 'COMPLETED',
                message: operation.responseMessage || 'Renewal successful!',
            })
        }

        // Handle AWAITING_FINAL_CONFIRM - return package info for confirmation dialog
        if (operation.status === 'AWAITING_FINAL_CONFIRM') {
            return respond({
                success: true,
                status: 'AWAITING_FINAL_CONFIRM',
                message: 'Awaiting final confirmation',
                cardNumber: operation.cardNumber,
                stbNumber: operation.stbNumber,
                selectedPackage: (() => {
                    const selected = quoteData(operation.selectedPackage)
                    return { index: selected.index, name: selected.name, price: selected.price,
                        quoteRevision: selected.quoteRevision, packageKey: selected.packageKey,
                        appliedPromoCode: selected.appliedPromoCode }
                })(),
                finalConfirmExpiry: operation.finalConfirmExpiry,
            })
        }

        if (operation.status !== 'AWAITING_PACKAGE') {
            return respond({
                success: false,
                status: operation.status,
                message: 'Operation is not in package selection stage',
            })
        }

        // 5. Return packages
        return respond({
            success: true,
            status: 'AWAITING_PACKAGE',
            cardNumber: operation.cardNumber,
            stbNumber: operation.stbNumber,
            ...publicPackageQuote(operation),
            finalConfirmExpiry: operation.finalConfirmExpiry,
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
