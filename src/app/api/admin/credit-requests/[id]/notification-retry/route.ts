import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { sendCreditRequestTelegramNotification } from '@/lib/credit-requests/notifications'

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const creditRequest = await prisma.creditRequest.findUnique({
            where: { id: params.id },
            select: {
                id: true,
                requestNumber: true,
                usernameSnapshot: true,
                amountUsd: true,
                paymentMethod: true,
                status: true,
                ownerTypeSnapshot: true,
                ownerLabelSnapshot: true,
                agentIdSnapshot: true,
                agentNameSnapshot: true,
                sourceGroupSnapshot: true,
            },
        })

        if (!creditRequest) {
            return NextResponse.json({ error: 'Credit request not found' }, { status: 404 })
        }

        if (creditRequest.status !== 'PENDING') {
            return NextResponse.json(
                { error: 'Only pending credit request notifications can be retried' },
                { status: 409 }
            )
        }

        const notification = await sendCreditRequestTelegramNotification({
            creditRequestId: creditRequest.id,
            requestNumber: creditRequest.requestNumber,
            username: creditRequest.usernameSnapshot,
            amountUsd: creditRequest.amountUsd,
            paymentMethod: creditRequest.paymentMethod,
            ownerType: creditRequest.ownerTypeSnapshot || (creditRequest.agentIdSnapshot ? 'AGENT' : 'UNOWNED'),
            ownerLabel: creditRequest.ownerLabelSnapshot || creditRequest.agentNameSnapshot || null,
            agentId: creditRequest.agentIdSnapshot,
            agentName: creditRequest.agentNameSnapshot,
            sourceGroup: creditRequest.sourceGroupSnapshot,
        })

        await prisma.activityLog.create({
            data: {
                userId: authResult.user.id,
                action: 'ADMIN_CREDIT_REQUEST_TELEGRAM_RETRY',
                targetId: creditRequest.id,
                targetType: 'CreditRequest',
                details: {
                    requestNumber: creditRequest.requestNumber,
                    notificationStatus: notification.status,
                    targetLabel: notification.targetLabel,
                    attempted: notification.attempted,
                },
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                userAgent: request.headers.get('user-agent'),
            },
        })

        return NextResponse.json({
            success: true,
            notification: {
                attempted: notification.attempted,
                provider: notification.provider,
                targetType: notification.targetType,
                targetLabel: notification.targetLabel,
                status: notification.status,
                error: notification.error || null,
            },
        })
    } catch (error) {
        console.error('Admin retry credit request notification error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
