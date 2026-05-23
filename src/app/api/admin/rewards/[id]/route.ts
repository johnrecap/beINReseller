import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'

const updateRewardSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    pointsCost: z.number().positive().max(100000000).optional(),
    fulfillmentNotes: z.string().trim().max(1000).optional().nullable(),
    isActive: z.boolean().optional(),
})

export async function PATCH(
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
        const parsed = updateRewardSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid reward data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const existing = await prisma.reward.findUnique({
            where: { id: params.id },
            select: { id: true },
        })

        if (!existing) {
            return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
        }

        const reward = await prisma.$transaction(async (tx) => {
            const updated = await tx.reward.update({
                where: { id: params.id },
                data: {
                    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
                    ...(parsed.data.description !== undefined
                        ? { description: parsed.data.description?.trim() || null }
                        : {}),
                    ...(parsed.data.pointsCost !== undefined ? { pointsCost: parsed.data.pointsCost } : {}),
                    ...(parsed.data.fulfillmentNotes !== undefined
                        ? { fulfillmentNotes: parsed.data.fulfillmentNotes?.trim() || null }
                        : {}),
                    ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
                },
            })

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'ADMIN_REWARD_UPDATED',
                    targetId: updated.id,
                    targetType: 'Reward',
                    details: {
                        name: updated.name,
                        pointsCost: updated.pointsCost,
                        isActive: updated.isActive,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                    userAgent: request.headers.get('user-agent'),
                },
            })

            return updated
        })

        return NextResponse.json({ success: true, reward })
    } catch (error) {
        console.error('Admin update reward error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
