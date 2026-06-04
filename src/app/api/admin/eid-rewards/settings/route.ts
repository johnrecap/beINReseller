import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { getPointProgramSettings } from '@/lib/points/settings'
import { EID_REWARD_SETTINGS_ID } from '@/lib/eid-rewards/calculation'
import {
    buildEidRewardSettingsPersistence,
    eidRewardSettingsSchema,
    getEidRewardSettings,
    serializeEidSettings,
} from '@/lib/eid-rewards/settings'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const [settings, conversion, audienceOverrides] = await Promise.all([
            getEidRewardSettings(prisma),
            getPointProgramSettings(prisma),
            prisma.eidRewardAudienceOverride.findMany({
                where: { settingsId: EID_REWARD_SETTINGS_ID },
                orderBy: { createdAt: 'asc' },
                select: {
                    userId: true,
                    effect: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            role: true,
                            isActive: true,
                        },
                    },
                },
            }),
        ])

        return NextResponse.json({
            settings: {
                ...serializeEidSettings(settings),
                audienceOverrides,
            },
            conversion: {
                points: conversion.cashConversionPoints,
                amount: conversion.cashConversionAmountUsd,
                enabled: conversion.pointsEnabled && Boolean(conversion.pointsStartAt),
            },
            tiers: settings.tiers.map((tier) => ({
                id: tier.id,
                points: tier.points,
                probabilityWeight: tier.probabilityWeight,
                label: tier.label,
                isActive: tier.isActive,
            })),
        })
    } catch (error) {
        console.error('Admin Eid settings GET error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = eidRewardSettingsSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid Eid reward settings', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null
        const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
        const overrideUserIds = [...new Set(parsed.data.audienceOverrides.map((override) => override.userId))]
        if (overrideUserIds.length > 0) {
            const existingUsers = await prisma.user.count({ where: { id: { in: overrideUserIds } } })
            if (existingUsers !== overrideUserIds.length) {
                return NextResponse.json(
                    { error: 'Invalid Eid reward audience users' },
                    { status: 400 }
                )
            }
        }
        const persistence = buildEidRewardSettingsPersistence(parsed.data, {
            adminUserId: authResult.user.id,
            startsAt,
            endsAt,
        })
        const settingsUpdateData = { ...persistence.settingsData } as Omit<typeof persistence.settingsData, 'id'> & { id?: string }
        delete settingsUpdateData.id

        await prisma.$transaction(async (tx) => {
            await tx.eidRewardSettings.upsert({
                where: { id: EID_REWARD_SETTINGS_ID },
                create: persistence.settingsData,
                update: settingsUpdateData,
            })

            await tx.eidRewardTier.deleteMany({ where: { settingsId: EID_REWARD_SETTINGS_ID } })
            if (persistence.tiers.length > 0) {
                await tx.eidRewardTier.createMany({
                    data: persistence.tiers,
                })
            }

            await tx.eidRewardAudienceOverride.deleteMany({ where: { settingsId: EID_REWARD_SETTINGS_ID } })
            if (persistence.audienceOverrides.length > 0) {
                await tx.eidRewardAudienceOverride.createMany({
                    data: persistence.audienceOverrides,
                })
            }

            await tx.activityLog.create({
                data: {
                    userId: authResult.user.id,
                    action: 'ADMIN_EID_REWARDS_UPDATED',
                    targetType: 'EidRewardSettings',
                    targetId: EID_REWARD_SETTINGS_ID,
                    details: {
                        enabled: parsed.data.enabled,
                        eventKey: parsed.data.eventKey,
                        claimPolicy: parsed.data.claimPolicy,
                        tiers: persistence.tiers.length,
                        audienceRoles: persistence.settingsData.audienceRoles,
                        audienceOverrides: persistence.audienceOverrides.length,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                },
            })
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Admin Eid settings PUT error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
