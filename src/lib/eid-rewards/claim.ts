import prisma from '@/lib/prisma'
import { summarizePointBalance } from '@/lib/points/balance'
import { getConversionReadiness, getPointProgramSettings } from '@/lib/points/settings'
import {
    buildCairoClaimDate,
    buildClaimScopeKey,
    calculateEidMoneyPreview,
    DEFAULT_CURRENCY_LABEL,
    isEidEventActive,
    selectRangeReward,
    selectWeightedReward,
} from '@/lib/eid-rewards/calculation'
import { getEidRewardSettings } from '@/lib/eid-rewards/settings'
import { Prisma } from '@prisma/client'

export class EidRewardError extends Error {
    constructor(
        message: string,
        readonly code: 'INACTIVE_EVENT' | 'ALREADY_CLAIMED' | 'INACTIVE_USER' | 'INVALID_SETTINGS'
    ) {
        super(message)
    }
}

export function buildConversionState(input: {
    pointsBalance: number
    minRedeemPoints: number
    conversionPoints: number
    conversionAmountUsd: number
    enabled: boolean
}) {
    const previewAmount = input.enabled && input.conversionPoints > 0 && input.conversionAmountUsd > 0
        ? Math.round((input.pointsBalance / input.conversionPoints) * input.conversionAmountUsd * 100) / 100
        : 0

    return {
        enabled: input.enabled,
        points: input.conversionPoints,
        amount: input.conversionAmountUsd,
        previewAmount,
        currencyLabel: DEFAULT_CURRENCY_LABEL,
        canRedeem: input.enabled && input.pointsBalance >= input.minRedeemPoints,
    }
}

export async function getEidRewardStatus(userId: string, now = new Date()) {
    const [settings, conversionSettings, ledgerEntries] = await Promise.all([
        getEidRewardSettings(prisma),
        getPointProgramSettings(prisma),
        prisma.pointLedgerEntry.findMany({
            where: { ownerUserId: userId },
            select: { sourceType: true, status: true, points: true },
        }),
    ])

    const active = isEidEventActive(settings, now)
    const claimScopeKey = buildClaimScopeKey(settings.eventKey, settings.claimPolicy, now)
    const existingClaim = await prisma.eidRewardClaim.findUnique({
        where: { userId_claimScopeKey: { userId, claimScopeKey } },
        select: { id: true },
    })
    const pointsBalance = summarizePointBalance(ledgerEntries).available
    const readiness = getConversionReadiness(conversionSettings)
    const conversion = buildConversionState({
        pointsBalance,
        minRedeemPoints: settings.minRedeemPoints,
        conversionPoints: conversionSettings.cashConversionPoints,
        conversionAmountUsd: conversionSettings.cashConversionAmountUsd,
        enabled: readiness.ok,
    })

    return {
        enabled: settings.enabled,
        active,
        eligible: active && !existingClaim,
        alreadyClaimed: Boolean(existingClaim),
        claimPolicy: settings.claimPolicy,
        pointsBalance,
        canRedeem: conversion.canRedeem,
        minRedeemPoints: settings.minRedeemPoints,
        conversion,
        popup: {
            show: settings.showPopupAfterLogin && active && !existingClaim,
            allowLaterDismiss: settings.allowLaterDismiss,
            closeDelaySeconds: settings.closeDelaySeconds,
            beforeText: settings.beforeText,
            afterText: settings.afterText,
        },
        message: !settings.enabled || !active
            ? 'انتهت عروض العيد، تابعنا في المناسبات القادمة.'
            : existingClaim
                ? settings.claimPolicy === 'ONCE_PER_DAY'
                    ? 'استلمت عيديتك اليوم، ارجع بكرة لعيدية جديدة 🎁'
                    : 'استلمت عيديتك بالفعل 🎁'
                : null,
    }
}

export async function claimEidReward(input: {
    userId: string
    ipAddress: string | null
    userAgent: string | null
    now?: Date
}) {
    const now = input.now ?? new Date()

    try {
        return await prisma.$transaction(async (tx) => {
            const [user, settings, conversionSettings] = await Promise.all([
                tx.user.findUnique({
                    where: { id: input.userId },
                    select: { id: true, role: true, isActive: true, deletedAt: true },
                }),
                getEidRewardSettings(tx),
                getPointProgramSettings(tx),
            ])

            if (!user || !user.isActive || user.deletedAt) {
                throw new EidRewardError('Inactive user cannot claim Eid reward', 'INACTIVE_USER')
            }
            if (!isEidEventActive(settings, now)) {
                throw new EidRewardError('Eid reward event is not active', 'INACTIVE_EVENT')
            }

            const claimDate = buildCairoClaimDate(now)
            const claimScopeKey = buildClaimScopeKey(settings.eventKey, settings.claimPolicy, now)
            const tierPoints = selectWeightedReward(settings.tiers)
            const points = tierPoints ?? selectRangeReward(settings.minPoints, settings.maxPoints)
            const moneyValue = calculateEidMoneyPreview(points, conversionSettings)

            const claim = await tx.eidRewardClaim.create({
                data: {
                    userId: user.id,
                    points,
                    moneyValue,
                    claimDate: new Date(`${claimDate}T00:00:00.000Z`),
                    eventKey: settings.eventKey,
                    claimScopeKey,
                    ipAddress: input.ipAddress,
                    userAgent: input.userAgent,
                },
                select: { id: true, points: true, moneyValue: true, claimDate: true, eventKey: true },
            })

            const ledgerEntry = await tx.pointLedgerEntry.create({
                data: {
                    ownerUserId: user.id,
                    ownerRoleAtTime: user.role,
                    sourceType: 'EID_REWARD',
                    sourceId: claim.id,
                    points,
                    status: 'AVAILABLE',
                    amountUsdSnapshot: moneyValue,
                    notes: `Eid reward claim ${settings.eventKey}`,
                },
                select: { id: true },
            })

            await tx.eidRewardClaim.update({
                where: { id: claim.id },
                data: { pointLedgerEntryId: ledgerEntry.id },
            })

            const ledgerEntries = await tx.pointLedgerEntry.findMany({
                where: { ownerUserId: user.id },
                select: { sourceType: true, status: true, points: true },
            })
            const pointsBalance = summarizePointBalance(ledgerEntries).available
            const readiness = getConversionReadiness(conversionSettings)
            const conversion = buildConversionState({
                pointsBalance,
                minRedeemPoints: settings.minRedeemPoints,
                conversionPoints: conversionSettings.cashConversionPoints,
                conversionAmountUsd: conversionSettings.cashConversionAmountUsd,
                enabled: readiness.ok,
            })

            return {
                claim: {
                    id: claim.id,
                    points: claim.points,
                    moneyValue: claim.moneyValue,
                    claimDate,
                    eventKey: claim.eventKey,
                },
                pointsBalance,
                conversion,
            }
        })
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === 'P2002'
        ) {
            throw new EidRewardError('Eid reward already claimed', 'ALREADY_CLAIMED')
        }
        throw error
    }
}
