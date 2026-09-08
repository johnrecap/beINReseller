import { NextRequest, NextResponse } from 'next/server'
import { OperationStatus } from '@prisma/client'
import { Queue } from 'bullmq'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    parseJsonRecord,
    withFinancialReviewMetadata,
} from '@/lib/financial-review/evidence'

function hasReviewFinalPaymentEvidence(input: {
    responseData: unknown
    providerMutationStartedAt: Date | null
    providerPaymentState: string | null
}): boolean {
    if (input.providerMutationStartedAt) return true
    const responseData = input.responseData
    const data = parseJsonRecord(responseData)
    const auditSnapshot = parseJsonRecord(data?.auditSnapshot)
    const phase = data?.operationPhase ?? data?.phase
    const paymentState = input.providerPaymentState ?? data?.providerPaymentState
    const outcomeCategory = data?.outcomeCategory ?? auditSnapshot?.outcomeCategory
    const providerEvidenceState = data?.providerEvidenceState ?? auditSnapshot?.providerEvidenceState

    return data?.finalPaySubmitted === true ||
        phase === 'FINAL_PAY_REQUEST_STARTED' ||
        phase === 'FINAL_PAY_SUBMITTED' ||
        phase === 'POST_FINAL_PAY_REVIEW' ||
        paymentState === 'CHARGED' ||
        paymentState === 'NOT_CHARGED' ||
        paymentState === 'UNKNOWN' ||
        outcomeCategory === 'CONFIRMED_SUCCESS' ||
        outcomeCategory === 'CONFIRMED_NOT_CHARGED' ||
        outcomeCategory === 'UNCERTAIN_REVIEW_REQUIRED' ||
        providerEvidenceState === 'confirmed-final-pay' ||
        providerEvidenceState === 'contract-verified'
}

type RouteContext = {
    params: Promise<{ operationId: string }>
}

function getOperationsQueue() {
    return new Queue('operations', {
        connection: {
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        },
    })
}

export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { operationId } = await context.params
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                status: true,
                responseData: true,
                cardNumber: true,
                providerMutationStartedAt: true,
                providerPaymentState: true,
                fulfillmentVerification: {
                    select: {
                        activeBaseline: {
                            select: { id: true, supersededAt: true },
                        },
                    },
                },
            },
        })

        if (!operation || operation.status !== OperationStatus.REVIEW_REQUIRED) {
            return NextResponse.json({ error: 'Operation is not reviewable' }, { status: 409 })
        }
        if (!hasReviewFinalPaymentEvidence(operation)) {
            return NextResponse.json({
                error: 'Final payment evidence is required before live fulfillment verification',
                code: 'FINAL_PAY_EVIDENCE_REQUIRED',
                messageKey: 'operations.fulfillmentReviewPending',
            }, { status: 409 })
        }
        const activeBaseline = operation.fulfillmentVerification?.activeBaseline
        if (!activeBaseline || activeBaseline.supersededAt) {
            return NextResponse.json({
                error: 'ACTIVE_FULFILLMENT_BASELINE_REQUIRED',
                code: 'ACTIVE_FULFILLMENT_BASELINE_REQUIRED',
                messageKey: 'operations.fulfillmentReviewPending',
            }, { status: 409 })
        }

        const checkedAt = new Date().toISOString()
        const summary = 'تم إرسال فحص مباشر إلى beIN. سيتم تحديث القرار عند وصول نتيجة worker.'

        const check = {
            outcome: 'NOT_CHECKED' as const,
            summary,
            checkedBy: authResult.user.id,
            checkedByUsername: authResult.user.username,
            checkedAt,
        }

        const nextResponseData = withFinancialReviewMetadata(operation.responseData, (current) => ({
            ...current,
            latestCardVerification: check,
            cardChecks: [...(current.cardChecks || []), check],
        }))

        await prisma.operation.update({
            where: { id: operationId },
            data: { responseData: nextResponseData },
        })

        const queue = getOperationsQueue()
        try {
            const job = await queue.add('verify-review-card', {
                operationId,
                type: 'VERIFY_REVIEW_CARD',
                cardNumber: operation.cardNumber || '',
            }, {
                priority: 0,
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: true,
                jobId: `VERIFY_REVIEW_CARD--${operationId}--${activeBaseline.id}`,
            })

            const maxWaitMs = 45_000
            const pollMs = 1_000
            const startedAt = Date.now()

            while (Date.now() - startedAt < maxWaitMs) {
                const current = await prisma.operation.findUnique({
                    where: { id: operationId },
                    select: {
                        status: true,
                        responseData: true,
                        responseMessage: true,
                    },
                })

                if (!current) break
                const currentData = parseJsonRecord(current.responseData)
                const review = parseJsonRecord(currentData?.financialReview)
                const latest = parseJsonRecord(review?.latestCardVerification)

                if (current.status !== OperationStatus.REVIEW_REQUIRED) {
                    return NextResponse.json({
                        success: true,
                        queued: false,
                        completed: true,
                        status: current.status,
                        message: current.responseMessage,
                        check: latest || check,
                    })
                }

                if (latest?.checkedAt && latest.checkedAt !== checkedAt) {
                    return NextResponse.json({
                        success: true,
                        queued: false,
                        completed: false,
                        status: current.status,
                        message: current.responseMessage,
                        check: latest,
                    })
                }

                const jobState = await job.getState().catch(() => 'unknown')
                if (jobState === 'failed') {
                    return NextResponse.json({
                        success: false,
                        error: job.failedReason || 'Live beIN verification failed',
                        check,
                    }, { status: 500 })
                }

                await new Promise(resolve => setTimeout(resolve, pollMs))
            }

            return NextResponse.json({ success: true, queued: true, check })
        } finally {
            await queue.close().catch(() => undefined)
        }
    } catch (error) {
        console.error('Financial review card verification error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
