import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'

const escalationSchema = z.object({
    action: z.enum(['ESCALATE', 'RESOLVE']),
    note: z.string().trim().max(500).optional().or(z.literal('')),
})

class EscalationError extends Error {
    constructor(message: string, readonly status: number) {
        super(message)
    }
}

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

        const body = await request.json().catch(() => null)
        const parsed = escalationSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid escalation data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const note = parsed.data.note?.trim() || null
        if (parsed.data.action === 'ESCALATE' && !note) {
            return NextResponse.json({ error: 'Escalation note is required' }, { status: 400 })
        }

        const result = await prisma.$transaction(async (tx) => {
            const creditRequest = await tx.creditRequest.findUnique({
                where: { id: params.id },
                select: {
                    id: true,
                    requestNumber: true,
                    usernameSnapshot: true,
                    amountUsd: true,
                    status: true,
                    escalated: true,
                    agentIdSnapshot: true,
                },
            })

            if (!creditRequest) {
                throw new EscalationError('Credit request not found', 404)
            }

            const nextEscalated = parsed.data.action === 'ESCALATE'
            await tx.creditRequest.update({
                where: { id: creditRequest.id },
                data: {
                    escalated: nextEscalated,
                    escalationNote: note,
                },
            })

            await tx.creditRequestStatusHistory.create({
                data: {
                    creditRequestId: creditRequest.id,
                    fromStatus: creditRequest.status,
                    toStatus: creditRequest.status,
                    actorId: authResult.user.id,
                    actorRole: authResult.user.role,
                    note: nextEscalated
                        ? `Escalated for admin attention: ${note}`
                        : note
                            ? `Escalation resolved: ${note}`
                            : 'Escalation resolved',
                },
            })

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: nextEscalated ? 'ADMIN_CREDIT_REQUEST_ESCALATED' : 'ADMIN_CREDIT_REQUEST_ESCALATION_RESOLVED',
                    targetId: creditRequest.id,
                    targetType: 'CreditRequest',
                    details: {
                        requestNumber: creditRequest.requestNumber,
                        statusBefore: creditRequest.status,
                        statusAfter: creditRequest.status,
                        escalated: nextEscalated,
                        note,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    userAgent: request.headers.get('user-agent'),
                },
            })

            return {
                id: creditRequest.id,
                requestNumber: creditRequest.requestNumber,
                username: creditRequest.usernameSnapshot,
                amountUsd: creditRequest.amountUsd,
                status: creditRequest.status,
                escalated: nextEscalated,
                escalationNote: note,
                agentId: creditRequest.agentIdSnapshot,
            }
        })

        return NextResponse.json({
            success: true,
            request: {
                id: result.id,
                requestNumber: result.requestNumber,
                status: result.status,
                escalated: result.escalated,
                escalationNote: result.escalationNote,
            },
        })
    } catch (error) {
        if (error instanceof EscalationError) {
            return NextResponse.json({ error: error.message }, { status: error.status })
        }

        console.error('Admin credit request escalation error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
