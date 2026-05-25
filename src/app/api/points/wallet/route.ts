import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuthAPI } from '@/lib/auth-utils'
import { summarizePointBalance } from '@/lib/points/balance'
import { getConversionReadiness, getPointProgramSettings } from '@/lib/points/settings'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireAuthAPI(request)
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        if (!['USER', 'AGENT', 'MANAGER'].includes(authResult.user.role)) {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
        }

        const [settings, ledgerEntries, recentConversions] = await Promise.all([
            getPointProgramSettings(prisma),
            prisma.pointLedgerEntry.findMany({
                where: { ownerUserId: authResult.user.id },
                select: { sourceType: true, status: true, points: true },
            }),
            prisma.pointCashRedemption.findMany({
                where: { ownerUserId: authResult.user.id },
                orderBy: { requestedAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    pointsConverted: true,
                    balanceAmountUsd: true,
                    requestedAt: true,
                    transactionId: true,
                },
            }),
        ])

        const summary = summarizePointBalance(ledgerEntries)
        const conversionReady = getConversionReadiness(settings)

        return NextResponse.json({
            points: summary,
            conversion: {
                enabled: conversionReady.ok,
                points: settings.cashConversionPoints,
                amountUsd: settings.cashConversionAmountUsd,
                disabledReason: conversionReady.ok ? null : conversionReady.reason,
            },
            recentConversions: recentConversions.map((conversion) => ({
                ...conversion,
                requestedAt: conversion.requestedAt.toISOString(),
            })),
        })
    } catch (error) {
        console.error('Points wallet error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
