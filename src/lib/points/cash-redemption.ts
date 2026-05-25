import { calculateCashConversion } from '@/lib/points/calculation'
import prisma from '@/lib/prisma'
import type { Prisma, Role } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { summarizePointBalance } from '@/lib/points/balance'
import { getConversionReadiness, getPointProgramSettings } from '@/lib/points/settings'

export type CashRedemptionWriteInput = {
    ownerUserId: string
    ownerRole: 'USER' | 'AGENT' | 'MANAGER' | 'ADMIN'
    balanceBefore: number
    availablePoints: number
    pointsToConvert: number
    conversionPoints: number
    conversionAmountUsd: number
}

export type CashRedemptionWritePlan =
    | {
        ok: true
        ownerUserId: string
        ledgerEntry: {
            ownerUserId: string
            ownerRoleAtTime: 'USER' | 'AGENT' | 'MANAGER' | 'ADMIN'
            sourceType: 'POINT_CASH_REDEMPTION'
            points: number
            status: 'REDEEMED'
            amountUsdSnapshot: number
        }
        transaction: {
            userId: string
            type: 'DEPOSIT'
            amount: number
            balanceAfter: number
        }
    }
    | {
        ok: false
        reason: 'INVALID_POINTS' | 'INVALID_CONVERSION_RATIO' | 'INSUFFICIENT_POINTS' | 'ZERO_BALANCE_CREDIT'
    }

export function buildCashRedemptionWrites(input: CashRedemptionWriteInput): CashRedemptionWritePlan {
    const conversion = calculateCashConversion({
        pointsToConvert: input.pointsToConvert,
        conversionPoints: input.conversionPoints,
        conversionAmountUsd: input.conversionAmountUsd,
        availablePoints: input.availablePoints,
    })

    if (!conversion.ok) return conversion

    return {
        ok: true,
        ownerUserId: input.ownerUserId,
        ledgerEntry: {
            ownerUserId: input.ownerUserId,
            ownerRoleAtTime: input.ownerRole,
            sourceType: 'POINT_CASH_REDEMPTION',
            points: -conversion.pointsConverted,
            status: 'REDEEMED',
            amountUsdSnapshot: conversion.balanceAmountUsd,
        },
        transaction: {
            userId: input.ownerUserId,
            type: 'DEPOSIT',
            amount: conversion.balanceAmountUsd,
            balanceAfter: input.balanceBefore + conversion.balanceAmountUsd,
        },
    }
}

export type RedeemPointsForBalanceResult = {
    id: string
    pointsConverted: number
    balanceAmountUsd: number
    availablePointsAfter: number
    balanceAfter: number
    transactionId: string
}

export class PointCashRedemptionError extends Error {
    constructor(
        message: string,
        readonly code: 'UNSUPPORTED_ROLE' | 'INACTIVE_OWNER' | 'INVALID_SETTINGS' | 'INVALID_POINTS' | 'INSUFFICIENT_POINTS'
    ) {
        super(message)
    }
}

export async function redeemPointsForBalance(input: {
    ownerUserId: string
    pointsToConvert: number
    notesPrefix?: string
}): Promise<RedeemPointsForBalanceResult> {
    return prisma.$transaction(async (tx) => {
        const owner = await tx.user.findUnique({
            where: { id: input.ownerUserId },
            select: { id: true, role: true, isActive: true, deletedAt: true, balance: true },
        })

        if (!owner || !owner.isActive || owner.deletedAt) {
            throw new PointCashRedemptionError('Inactive owner cannot convert points', 'INACTIVE_OWNER')
        }

        if (!['USER', 'AGENT', 'MANAGER', 'ADMIN'].includes(owner.role)) {
            throw new PointCashRedemptionError('Role cannot convert points', 'UNSUPPORTED_ROLE')
        }

        const settings = await getPointProgramSettings(tx)
        const readiness = getConversionReadiness(settings)
        if (!readiness.ok) {
            throw new PointCashRedemptionError('Point conversion settings are invalid', 'INVALID_SETTINGS')
        }

        const ledgerEntries = await tx.pointLedgerEntry.findMany({
            where: { ownerUserId: owner.id },
            select: { sourceType: true, status: true, points: true },
        })
        const availablePoints = summarizePointBalance(ledgerEntries).available

        const writePlan = buildCashRedemptionWrites({
            ownerUserId: owner.id,
            ownerRole: owner.role as Extract<Role, 'USER' | 'AGENT' | 'MANAGER' | 'ADMIN'>,
            balanceBefore: owner.balance,
            availablePoints,
            pointsToConvert: input.pointsToConvert,
            conversionPoints: settings.cashConversionPoints,
            conversionAmountUsd: settings.cashConversionAmountUsd,
        })

        if (!writePlan.ok) {
            throw new PointCashRedemptionError(
                writePlan.reason === 'INSUFFICIENT_POINTS' ? 'Insufficient points' : 'Invalid point conversion request',
                writePlan.reason === 'INSUFFICIENT_POINTS' ? 'INSUFFICIENT_POINTS' : 'INVALID_POINTS'
            )
        }

        const redemptionId = randomUUID()
        const ledgerEntryId = randomUUID()

        const updatedOwner = await tx.user.update({
            where: { id: owner.id },
            data: { balance: { increment: writePlan.transaction.amount } },
            select: { balance: true },
        })

        const transaction = await tx.transaction.create({
            data: {
                userId: owner.id,
                type: 'DEPOSIT',
                amount: writePlan.transaction.amount,
                balanceAfter: updatedOwner.balance,
                notes: `${input.notesPrefix ?? 'Point cash conversion'}: ${input.pointsToConvert} points`,
            },
            select: { id: true },
        })

        await tx.pointLedgerEntry.create({
            data: {
                id: ledgerEntryId,
                ownerUserId: owner.id,
                ownerRoleAtTime: owner.role,
                sourceType: 'POINT_CASH_REDEMPTION',
                sourceId: redemptionId,
                points: writePlan.ledgerEntry.points,
                status: 'REDEEMED',
                amountUsdSnapshot: writePlan.ledgerEntry.amountUsdSnapshot,
                notes: `${input.notesPrefix ?? 'Converted'} ${input.pointsToConvert} points to $${writePlan.transaction.amount.toFixed(2)} balance`,
            },
        })

        await tx.pointCashRedemption.create({
            data: {
                id: redemptionId,
                ownerUserId: owner.id,
                pointsConverted: input.pointsToConvert,
                balanceAmountUsd: writePlan.transaction.amount,
                conversionPointsSnapshot: settings.cashConversionPoints,
                conversionAmountUsdSnapshot: settings.cashConversionAmountUsd,
                ledgerEntryId,
                transactionId: transaction.id,
            },
        })

        const availablePointsAfter = summarizePointBalance([
            ...ledgerEntries,
            { sourceType: 'POINT_CASH_REDEMPTION', status: 'REDEEMED', points: -input.pointsToConvert },
        ]).available

        return {
            id: redemptionId,
            pointsConverted: input.pointsToConvert,
            balanceAmountUsd: writePlan.transaction.amount,
            availablePointsAfter,
            balanceAfter: updatedOwner.balance,
            transactionId: transaction.id,
        }
    })
}
