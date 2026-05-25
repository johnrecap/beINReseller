import { getEidRewardSettings } from '@/lib/eid-rewards/settings'
import { PointCashRedemptionError, redeemPointsForBalance } from '@/lib/points/cash-redemption'
import prisma from '@/lib/prisma'

export class EidRewardRedeemError extends Error {
    constructor(
        message: string,
        readonly code: 'INVALID_POINTS' | 'INSUFFICIENT_POINTS' | 'INVALID_SETTINGS' | 'INACTIVE_OWNER'
    ) {
        super(message)
    }
}

export async function redeemEidRewardPoints(input: {
    userId: string
    pointsToConvert: number
}) {
    const settings = await getEidRewardSettings(prisma)
    if (
        !Number.isFinite(input.pointsToConvert)
        || input.pointsToConvert <= 0
        || input.pointsToConvert < settings.minRedeemPoints
    ) {
        throw new EidRewardRedeemError('Invalid Eid point conversion request', 'INVALID_POINTS')
    }

    try {
        return await redeemPointsForBalance({
            ownerUserId: input.userId,
            pointsToConvert: input.pointsToConvert,
            notesPrefix: 'Eid reward point conversion',
        })
    } catch (error) {
        if (error instanceof PointCashRedemptionError) {
            if (error.code === 'INSUFFICIENT_POINTS') {
                throw new EidRewardRedeemError('Insufficient points', 'INSUFFICIENT_POINTS')
            }
            if (error.code === 'INACTIVE_OWNER') {
                throw new EidRewardRedeemError('Inactive user cannot convert points', 'INACTIVE_OWNER')
            }
            throw new EidRewardRedeemError('Point conversion settings are invalid', 'INVALID_SETTINGS')
        }
        throw error
    }
}
