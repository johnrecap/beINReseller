import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { addOperationJob, operationsQueue } from '@/lib/queue'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

function parseOperationResponseData(responseData: unknown): Record<string, unknown> {
    if (!responseData) return {}
    if (typeof responseData === 'object') return responseData as Record<string, unknown>
    if (typeof responseData === 'string') {
        try {
            const parsed = JSON.parse(responseData)
            return parsed && typeof parsed === 'object'
                ? parsed as Record<string, unknown>
                : {}
        } catch {
            return {}
        }
    }
    return {}
}

function isDuplicateJobError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    return message.includes('already exists') || message.includes('jobid')
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
        const existingResponseData = parseOperationResponseData(operation.responseData)
        if (existingResponseData.refreshing === true) {
            return NextResponse.json(
                {
                    success: false,
                    processing: true,
                    message: 'Promo code is already being applied. Please wait a few seconds.',
                },
                { status: 202 }
            )
        }

        await prisma.operation.update({
            where: { id },
            data: {
                promoCode,
                responseData: JSON.stringify({
                    ...existingResponseData,
                    promoApplied: false,
                    refreshing: true,
                }),
            },
        })

        // Add job to queue to apply promo
        const promoJobId = `APPLY_PROMO--${id}`
        let existingJob = await operationsQueue.getJob(promoJobId).catch(() => null)

        if (existingJob) {
            const jobState = await existingJob.getState().catch(() => null)
            if (jobState === 'completed' || jobState === 'failed') {
                await existingJob.remove().catch(() => undefined)
                existingJob = null
            }
        }

        try {
            if (!existingJob) {
                await addOperationJob({
                    operationId: id,
                    type: 'APPLY_PROMO',
                    promoCode,
                    userId: authUser.id,
                    cardNumber: operation.cardNumber,
                })
            }
        } catch (queueError) {
            if (!isDuplicateJobError(queueError)) {
                await prisma.operation.update({
                    where: { id },
                    data: {
                        responseData: JSON.stringify({
                            ...existingResponseData,
                            promoApplied: false,
                            refreshing: false,
                            error: 'Could not queue promo request. Please try again.',
                        }),
                    },
                })

                return NextResponse.json(
                    { error: 'Could not apply promo right now. Please try again.' },
                    { status: 503 }
                )
            }
        }

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
                    const data = parseOperationResponseData(updatedOp.responseData)
                    if (data.promoApplied === true && Array.isArray(data.packages)) {
                        return NextResponse.json({
                            success: true,
                            message: 'Promo code applied',
                            packages: data.packages,
                        })
                    }

                    if (
                        data.promoApplied === false &&
                        data.refreshing !== true &&
                        typeof data.error === 'string'
                    ) {
                        return NextResponse.json(
                            {
                                success: false,
                                error: data.error,
                                packages: Array.isArray(data.packages) ? data.packages : [],
                            },
                            { status: 400 }
                        )
                    }
                } catch {
                    // Not valid JSON, continue
                }
            }
        }

        const latestOp = await prisma.operation.findUnique({
            where: { id },
            select: { responseData: true, availablePackages: true },
        })
        const latestData = parseOperationResponseData(latestOp?.responseData)

        if (latestData.refreshing === true) {
            return NextResponse.json(
                {
                    success: false,
                    processing: true,
                    message: 'Promo application is still processing. Please wait and try again.',
                    packages: Array.isArray(latestOp?.availablePackages) ? latestOp?.availablePackages : [],
                },
                { status: 202 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: 'Timeout - please try again',
            },
            { status: 408 }
        )

    } catch (error) {
        console.error('Apply promo error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
