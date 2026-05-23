import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { recoverOperationIfNeeded } from '@/lib/operations/recovery'
import { runDispatchWatchdog } from '@/lib/operation-dispatch'

// This endpoint should be called by a cron job every 5 minutes
// Example: Vercel Cron, or external service like cron-job.org

export async function GET(request: Request) {
    try {
        // ===== MANDATORY: Verify cron secret for security =====
        const authHeader = request.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        // CRITICAL: Fail if secret is not configured
        if (!cronSecret) {
            console.error('CRON_SECRET is not configured - refusing to process')
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            )
        }

        // CRITICAL: Always require valid authorization
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const dispatchWatchdog = await runDispatchWatchdog({
            maxAttempts: 3,
            limit: 50,
        })

        // Timeout settings (in minutes)
        const PROCESSING_TIMEOUT = 5        // 5 minutes for PROCESSING
        const AWAITING_PACKAGE_TIMEOUT = 15 // 15 minutes for AWAITING_PACKAGE (user must choose)
        const COMPLETING_TIMEOUT = 2        // 2 minutes for COMPLETING (purchase takes <30s normally)
        // AWAITING_FINAL_CONFIRM uses finalConfirmExpiry field (2 minutes set by worker)

        const now = Date.now()
        const nowDate = new Date()

        // Find operations stuck in various statuses
        const stuckOperations = await prisma.operation.findMany({
            where: {
                OR: [
                    // PROCESSING: stuck for more than 5 minutes
                    {
                        status: 'PROCESSING',
                        updatedAt: { lt: new Date(now - PROCESSING_TIMEOUT * 60 * 1000) },
                    },
                    // AWAITING_PACKAGE: user didn't choose for 15 minutes
                    {
                        status: 'AWAITING_PACKAGE',
                        updatedAt: { lt: new Date(now - AWAITING_PACKAGE_TIMEOUT * 60 * 1000) },
                    },
                    // COMPLETING: stuck for more than 5 minutes
                    {
                        status: 'COMPLETING',
                        updatedAt: { lt: new Date(now - COMPLETING_TIMEOUT * 60 * 1000) },
                    },
                    // AWAITING_FINAL_CONFIRM: expired based on finalConfirmExpiry field
                    {
                        status: 'AWAITING_FINAL_CONFIRM',
                        finalConfirmExpiry: { lt: nowDate },
                    },
                ],
            },
            include: {
                user: { select: { id: true, balance: true } },
            },
        })

        console.log(`Found ${stuckOperations.length} stuck/expired operations`)

        let changedCount = 0
        let refundedCount = dispatchWatchdog.refunded
        let reviewCount = dispatchWatchdog.review
        let skippedCount = dispatchWatchdog.skipped
        let retryCount = dispatchWatchdog.retried
        const errors: string[] = []

        for (const operation of stuckOperations) {
            try {
                const recovery = await recoverOperationIfNeeded(operation.id, 'timeout', {
                    now: nowDate,
                })
                if (recovery.changed) changedCount++
                if (recovery.refundApplied) refundedCount++
                if (recovery.reviewRequired) reviewCount++
                if (recovery.decision === 'RETRY_DISPATCH') retryCount++
                if (recovery.skipped || !recovery.changed) skippedCount++
            } catch (err) {
                console.error(`Failed to recover operation ${operation.id}:`, err)
                errors.push(operation.id)
            }
        }

        return NextResponse.json({
            success: true,
            processed: stuckOperations.length + dispatchWatchdog.scanned,
            changed: changedCount + dispatchWatchdog.recovered,
            retried: retryCount,
            reviewRequired: reviewCount,
            refunded: refundedCount,
            skipped: skippedCount,
            dispatchWatchdog,
            errors: errors.length > 0 || dispatchWatchdog.errors.length > 0
                ? [...errors, ...dispatchWatchdog.errors]
                : undefined,
            timestamp: new Date().toISOString(),
        })

    } catch (error) {
        console.error('Timeout operations cron error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
