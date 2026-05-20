import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { addOperationJob, operationsQueue } from '@/lib/queue'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'
import { mergeOperationPhaseEvidence } from '@/lib/operation-safety'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

function isDuplicateJobError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    return message.includes('already exists') || message.includes('jobid')
}

/**
 * POST /api/operations/[id]/cancel-confirm
 * 
 * Cancel final confirmation
 * - Verifies operation is in AWAITING_FINAL_CONFIRM state
 * - Sends job to Worker to press Cancel button in popup
 * - Refunds balance to user
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

        const { id } = await params

        // 2. Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                cardNumber: true,
                status: true,
                amount: true,
                selectedPackage: true,
                responseData: true,
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

        // Check status - only allow cancel from AWAITING_FINAL_CONFIRM
        if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
            return NextResponse.json(
                { error: 'Operation is not in final confirmation stage' },
                { status: 400 }
            )
        }

        // 3. CRITICAL: Atomically change status to prevent duplicate cancel jobs
        // Uses updateMany with status filter - if two cancel calls arrive simultaneously,
        // only the first one matches AWAITING_FINAL_CONFIRM and succeeds (count=1).
        // The second call finds status=COMPLETING and gets count=0 → rejected.
        const updated = await prisma.operation.updateMany({
            where: { id, status: 'AWAITING_FINAL_CONFIRM' },
            data: {
                status: 'COMPLETING',
                responseMessage: 'Cancelling operation...',
                responseData: mergeOperationPhaseEvidence(operation.responseData, {
                    phase: 'CANCELLATION_CONFIRM',
                    jobType: 'CANCEL_CONFIRM',
                    finalPaySubmitted: false,
                    cancelRequestedAt: new Date().toISOString(),
                }),
            }
        })

        if (updated.count === 0) {
            // Another cancel request already changed the status
            return NextResponse.json(
                { error: 'Operation is already being cancelled' },
                { status: 409 }
            )
        }

        // 4. Add CANCEL_CONFIRM job to queue (only one will ever reach here)
        const cancelJobId = `CANCEL_CONFIRM--${id}`
        const existingJob = await operationsQueue.getJob(cancelJobId).catch(() => null)

        try {
            if (!existingJob) {
                await addOperationJob({
                    operationId: id,
                    type: 'CANCEL_CONFIRM',
                    cardNumber: operation.cardNumber,
                    userId: authUser.id,
                    amount: operation.amount,
                })
            }
        } catch (queueError) {
            if (!isDuplicateJobError(queueError)) {
                console.error('Failed to queue cancel-confirm job:', queueError)

                await prisma.operation.updateMany({
                    where: { id, status: 'COMPLETING' },
                    data: {
                        status: 'AWAITING_FINAL_CONFIRM',
                        responseMessage: 'Awaiting final confirmation'
                    }
                })

                return NextResponse.json(
                    { error: 'Could not start cancellation right now. Please try again.' },
                    { status: 503 }
                )
            }
        }

        // 5. Return success
        return NextResponse.json({
            success: true,
            operationId: id,
            message: 'Cancelling operation...',
        })

    } catch (error) {
        console.error('Cancel confirm error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
