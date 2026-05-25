import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import { getPointProgramSettings } from '@/lib/points/settings'
import { EID_REWARD_SETTINGS_ID } from '@/lib/eid-rewards/calculation'
import {
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

        const [settings, conversion] = await Promise.all([
            getEidRewardSettings(prisma),
            getPointProgramSettings(prisma),
        ])

        return NextResponse.json({
            settings: serializeEidSettings(settings),
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

        await prisma.$transaction(async (tx) => {
            await tx.eidRewardSettings.upsert({
                where: { id: EID_REWARD_SETTINGS_ID },
                create: {
                    id: EID_REWARD_SETTINGS_ID,
                    enabled: parsed.data.enabled,
                    eventKey: parsed.data.eventKey,
                    startsAt,
                    endsAt,
                    claimPolicy: parsed.data.claimPolicy,
                    minPoints: parsed.data.minPoints,
                    maxPoints: parsed.data.maxPoints,
                    minRedeemPoints: parsed.data.minRedeemPoints,
                    showPopupAfterLogin: parsed.data.showPopupAfterLogin,
                    allowLaterDismiss: parsed.data.allowLaterDismiss,
                    closeDelaySeconds: parsed.data.closeDelaySeconds,
                    beforeText: parsed.data.beforeText,
                    afterText: parsed.data.afterText,
                    updatedByAdminId: authResult.user.id,
                },
                update: {
                    enabled: parsed.data.enabled,
                    eventKey: parsed.data.eventKey,
                    startsAt,
                    endsAt,
                    claimPolicy: parsed.data.claimPolicy,
                    minPoints: parsed.data.minPoints,
                    maxPoints: parsed.data.maxPoints,
                    minRedeemPoints: parsed.data.minRedeemPoints,
                    showPopupAfterLogin: parsed.data.showPopupAfterLogin,
                    allowLaterDismiss: parsed.data.allowLaterDismiss,
                    closeDelaySeconds: parsed.data.closeDelaySeconds,
                    beforeText: parsed.data.beforeText,
                    afterText: parsed.data.afterText,
                    updatedByAdminId: authResult.user.id,
                },
            })

            await tx.eidRewardTier.deleteMany({ where: { settingsId: EID_REWARD_SETTINGS_ID } })
            if (parsed.data.tiers.length > 0) {
                await tx.eidRewardTier.createMany({
                    data: parsed.data.tiers.map((tier) => ({
                        settingsId: EID_REWARD_SETTINGS_ID,
                        points: tier.points,
                        probabilityWeight: tier.probabilityWeight,
                        label: tier.label?.trim() || null,
                        isActive: tier.isActive,
                    })),
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
                        tiers: parsed.data.tiers.length,
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
