import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'

const agentProfileSchema = z.object({
    displayName: z.string().trim().max(120).optional().nullable(),
    whapiGroupId: z.string().trim().max(180).optional().nullable(),
    whapiGroupName: z.string().trim().max(180).optional().nullable(),
    whatsappHandoffGroupUrl: z.string().trim().max(500).optional().nullable(),
    whatsappHandoffPhone: z.string().trim().max(40).optional().nullable(),
    whatsappHandoffLabel: z.string().trim().max(120).optional().nullable(),
    whatsappNotificationsEnabled: z.boolean().optional(),
    defaultSourceGroup: z.string().trim().max(120).optional().nullable(),
    isActive: z.boolean().optional(),
})

function cleanOptional(value: string | null | undefined) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json().catch(() => null)
        const parsed = agentProfileSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid agent profile data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const agent = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true, deletedAt: true },
        })

        if (!agent || agent.deletedAt || agent.role !== 'AGENT') {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        const whatsappNotificationsEnabled = parsed.data.whatsappNotificationsEnabled ?? false

        const profile = await prisma.$transaction(async (tx) => {
            const saved = await tx.agentProfile.upsert({
                where: { agentId: id },
                create: {
                    agentId: id,
                    displayName: cleanOptional(parsed.data.displayName),
                    whapiGroupId: cleanOptional(parsed.data.whapiGroupId),
                    whapiGroupName: cleanOptional(parsed.data.whapiGroupName),
                    whatsappHandoffGroupUrl: cleanOptional(parsed.data.whatsappHandoffGroupUrl),
                    whatsappHandoffPhone: cleanOptional(parsed.data.whatsappHandoffPhone),
                    whatsappHandoffLabel: cleanOptional(parsed.data.whatsappHandoffLabel),
                    whatsappNotificationsEnabled,
                    defaultSourceGroup: cleanOptional(parsed.data.defaultSourceGroup),
                    isActive: parsed.data.isActive ?? true,
                },
                update: {
                    displayName: cleanOptional(parsed.data.displayName),
                    whapiGroupId: cleanOptional(parsed.data.whapiGroupId),
                    whapiGroupName: cleanOptional(parsed.data.whapiGroupName),
                    whatsappHandoffGroupUrl: cleanOptional(parsed.data.whatsappHandoffGroupUrl),
                    whatsappHandoffPhone: cleanOptional(parsed.data.whatsappHandoffPhone),
                    whatsappHandoffLabel: cleanOptional(parsed.data.whatsappHandoffLabel),
                    whatsappNotificationsEnabled,
                    defaultSourceGroup: cleanOptional(parsed.data.defaultSourceGroup),
                    isActive: parsed.data.isActive ?? true,
                },
            })

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'ADMIN_AGENT_PROFILE_UPDATED',
                    targetId: id,
                    targetType: 'AgentProfile',
                    details: {
                        whatsappHandoffLabel: saved.whatsappHandoffLabel,
                        whatsappHandoffGroupConfigured: Boolean(saved.whatsappHandoffGroupUrl),
                        whatsappHandoffPhoneConfigured: Boolean(saved.whatsappHandoffPhone),
                        notificationsEnabled: saved.whatsappNotificationsEnabled,
                        defaultSourceGroup: saved.defaultSourceGroup,
                        isActive: saved.isActive,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })

            return saved
        })

        return NextResponse.json({
            success: true,
            profile: {
                displayName: profile.displayName,
                whapiGroupId: profile.whapiGroupId,
                whapiGroupName: profile.whapiGroupName,
                whatsappHandoffGroupUrl: profile.whatsappHandoffGroupUrl,
                whatsappHandoffPhone: profile.whatsappHandoffPhone,
                whatsappHandoffLabel: profile.whatsappHandoffLabel,
                whatsappNotificationsEnabled: profile.whatsappNotificationsEnabled,
                defaultSourceGroup: profile.defaultSourceGroup,
                isActive: profile.isActive,
            },
        })
    } catch (error) {
        console.error('Admin update agent profile error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
