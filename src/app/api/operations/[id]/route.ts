import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { projectOperationProgress } from '../../../../../shared/operations/consumer-progress'
import {
    buildChargedBeinAccountAudit,
    redactOperationResponseData,
} from '@/lib/operation-detail-audit'
import { projectRenewalReceipt } from '@/lib/operations/receipt'
import { projectRenewalHold } from '../../../../../shared/operations/renewal-hold'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    return getAuthenticatedUser(request)
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
            select: {
                id: true,
                administrativeStopRequestedAt: true,
                administrativeArchivedAt: true,
                type: true,
                cardNumber: true,
                amount: true,
                status: true,
                responseMessage: true,
                responseData: true,  // Required for signal refresh card status
                stbNumber: true,
                createdAt: true,
                updatedAt: true,
                userId: true,
                finalConfirmExpiry: true,
                providerPaymentState: true,
                providerMutationStartedAt: true,
                providerMutationStage: true,
                renewalFlowVersion: true,
                fulfillmentState: true,
                fulfillmentAuthority: true,
                fulfillmentProof: {
                    select: {
                        proofKind: true, invoiceNo: true, cardNumberSnapshot: true,
                        reportItemType: true, reportPackageName: true, promoCodeSnapshot: true,
                        providerAmount: true, currency: true, contractStartDate: true,
                        contractExpiryDate: true, reportDate: true, reportObservedAt: true,
                        customerChargedAmount: true,
                    },
                },
                transactions: { where: { type: 'REFUND' }, select: { type: true } },
                refundSettlements: { select: { state: true } },
                chargedBeinSpendLedger: {
                    select: {
                        id: true,
                        beinAccountId: true,
                        beinUsernameSnapshot: true,
                        beinLabelSnapshot: true,
                        spendAmount: true,
                        dealerBalanceBefore: true,
                        dealerBalanceAfter: true,
                        chargedAt: true,
                        evidenceSource: true,
                    },
                },
                beinAccount: {
                    select: {
                        id: true,
                        username: true,
                        label: true,
                    },
                },
            },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership (user can only see their own operations)
        if (operation.userId !== authUser.id && authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            )
        }

        // Remove userId from response
        const operationData = {
            ...operation,
            hold: projectRenewalHold(operation),
            ...(authUser.role === 'ADMIN' && operation.status === 'REVIEW_REQUIRED'
                ? { reviewUrl: `/dashboard/admin/financial-review?q=${encodeURIComponent(operation.id)}` } : {}),
            receipt: projectRenewalReceipt(operation),
            chargedBeinAccount: buildChargedBeinAccountAudit(operation, authUser.role === 'ADMIN'),
            ...projectOperationProgress(operation),
        }
        delete (operationData as { userId?: string }).userId
        delete (operationData as { chargedBeinSpendLedger?: unknown }).chargedBeinSpendLedger
        delete (operationData as { beinAccount?: unknown }).beinAccount
        delete (operationData as { fulfillmentProof?: unknown }).fulfillmentProof
        delete (operationData as { transactions?: unknown }).transactions
        delete (operationData as { refundSettlements?: unknown }).refundSettlements

        return NextResponse.json({
            ...operationData,
            responseData: redactOperationResponseData(operationData.responseData),
        })

    } catch (error) {
        console.error('Get operation error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
