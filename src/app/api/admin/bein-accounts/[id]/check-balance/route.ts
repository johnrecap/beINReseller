/**
 * Check beIN Account Balance API
 * 
 * This endpoint logs into a beIN dealer account and fetches
 * the current credit balance for display in the admin panel.
 * 
 * POST /api/admin/bein-accounts/[id]/check-balance
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { Queue } from 'bullmq'
import redis from '@/lib/redis'

interface RouteParams {
    params: Promise<{ id: string }>
}

// Create a dedicated queue for admin tasks
const getAdminQueue = () => {
    return new Queue('operations', {
        connection: {
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        },
    })
}

// POST /api/admin/bein-accounts/[id]/check-balance
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await auth()

        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params

        // Get account details
        const account = await prisma.beinAccount.findUnique({
            where: { id },
            include: { proxy: true }
        })

        if (!account) {
            return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
        }

        // Check if account is active
        if (!account.isActive) {
            return NextResponse.json({ 
                error: 'الحساب غير نشط - قم بتفعيله أولاً' 
            }, { status: 400 })
        }

        // Add a job to check balance
        // The worker will process this and update the database
        const adminQueue = getAdminQueue()
        
        const job = await adminQueue.add('check-balance', {
            type: 'CHECK_ACCOUNT_BALANCE',
            accountId: id,
            cardNumber: '0000000000', // Dummy card number for balance check
        }, {
            priority: 0, // High priority
            attempts: 1, // Only try once
            removeOnComplete: true,
            removeOnFail: true,
        })

        // Wait for the job to complete (with timeout)
        // Since job has removeOnComplete: true, we check the database for updates
        const MAX_WAIT_MS = 60000 // 60 seconds
        const POLL_INTERVAL_MS = 1000 // 1 second
        const startTime = Date.now()

        // Get the initial balance to detect changes
        const initialBalance = account.dealerBalance
        const initialUpdatedAt = account.balanceUpdatedAt?.getTime() || 0

        while (Date.now() - startTime < MAX_WAIT_MS) {
            // Check if job failed
            const jobState = await job.getState()
            
            if (jobState === 'failed') {
                const failedReason = job.failedReason || 'Unknown error'
                return NextResponse.json({
                    success: false,
                    error: `فشل في جلب الرصيد: ${failedReason}`
                }, { status: 500 })
            }

            // Check if balance was updated in database
            const updatedAccount = await prisma.beinAccount.findUnique({
                where: { id },
                select: {
                    dealerBalance: true,
                    balanceUpdatedAt: true
                }
            })

            const newUpdatedAt = updatedAccount?.balanceUpdatedAt?.getTime() || 0

            // If balanceUpdatedAt changed, the job completed
            if (newUpdatedAt > initialUpdatedAt) {
                return NextResponse.json({
                    success: true,
                    balance: updatedAccount?.dealerBalance ?? null,
                    updatedAt: updatedAccount?.balanceUpdatedAt?.toISOString() ?? null,
                    message: updatedAccount?.dealerBalance !== null && updatedAccount?.dealerBalance !== undefined
                        ? `تم تحديث الرصيد: ${updatedAccount.dealerBalance} USD`
                        : 'لم يتم العثور على الرصيد'
                })
            }

            // Job completed and removed - check if state is null/undefined
            if (jobState === 'completed' || jobState === 'unknown' || !jobState) {
                // Job finished, check database one more time
                const finalAccount = await prisma.beinAccount.findUnique({
                    where: { id },
                    select: {
                        dealerBalance: true,
                        balanceUpdatedAt: true
                    }
                })

                const finalUpdatedAt = finalAccount?.balanceUpdatedAt?.getTime() || 0
                
                if (finalUpdatedAt > initialUpdatedAt) {
                    return NextResponse.json({
                        success: true,
                        balance: finalAccount?.dealerBalance ?? null,
                        updatedAt: finalAccount?.balanceUpdatedAt?.toISOString() ?? null,
                        message: finalAccount?.dealerBalance !== null && finalAccount?.dealerBalance !== undefined
                            ? `تم تحديث الرصيد: ${finalAccount.dealerBalance} USD`
                            : 'لم يتم العثور على الرصيد'
                    })
                }
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        }

        // Timeout
        return NextResponse.json({
            success: false,
            error: 'انتهت مهلة جلب الرصيد - حاول مرة أخرى'
        }, { status: 504 })

    } catch (error) {
        console.error('Check balance error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
