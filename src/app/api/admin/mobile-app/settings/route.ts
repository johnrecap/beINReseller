/**
 * GET/PUT /api/admin/mobile-app/settings
 * 
 * Mobile app configuration settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

// Default settings
const DEFAULT_SETTINGS = {
    appEnabled: true,
    maintenanceMode: false,
    appVersion: '1.0.0',
    minWalletTopup: 50,
    maxWalletTopup: 5000,
    subscriptionMarkupPercent: 10,
    signalRefreshPrice: 0,
    shippingCostSA: 30,
    shippingCostEG: 50
}

// Settings keys mapping to database table
const SETTINGS_KEYS: Record<string, string> = {
    appEnabled: 'mobile_app_enabled',
    maintenanceMode: 'mobile_maintenance_mode',
    appVersion: 'mobile_app_version',
    minWalletTopup: 'mobile_min_wallet_topup',
    maxWalletTopup: 'mobile_max_wallet_topup',
    subscriptionMarkupPercent: 'mobile_subscription_markup',
    signalRefreshPrice: 'mobile_signal_refresh_price',
    shippingCostSA: 'mobile_shipping_cost_sa',
    shippingCostEG: 'mobile_shipping_cost_eg'
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Fetch all mobile app settings from database
        const dbSettings = await prisma.setting.findMany({
            where: {
                key: { in: Object.values(SETTINGS_KEYS) }
            }
        })

        // Build settings object with defaults
        const settings = { ...DEFAULT_SETTINGS }

        for (const [key, dbKey] of Object.entries(SETTINGS_KEYS)) {
            const dbSetting = dbSettings.find(s => s.key === dbKey)
            if (dbSetting) {
                const value = dbSetting.value
                // Parse boolean values
                if (key === 'appEnabled' || key === 'maintenanceMode') {
                    (settings as Record<string, unknown>)[key] = value === 'true'
                }
                // Parse numeric values
                else if (['minWalletTopup', 'maxWalletTopup', 'subscriptionMarkupPercent', 'signalRefreshPrice', 'shippingCostSA', 'shippingCostEG'].includes(key)) {
                    (settings as Record<string, unknown>)[key] = parseFloat(value) || 0
                }
                // String values
                else {
                    (settings as Record<string, unknown>)[key] = value
                }
            }
        }

        return NextResponse.json({
            success: true,
            settings
        })

    } catch (error) {
        console.error('Admin get settings error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const body = await request.json()

        // Update each setting
        const updates = []
        for (const [key, dbKey] of Object.entries(SETTINGS_KEYS)) {
            if (body[key] !== undefined) {
                const value = String(body[key])
                updates.push(
                    prisma.setting.upsert({
                        where: { key: dbKey },
                        update: { value },
                        create: { key: dbKey, value }
                    })
                )
            }
        }

        await prisma.$transaction(updates)

        return NextResponse.json({
            success: true,
            message: 'Settings updated successfully'
        })

    } catch (error) {
        console.error('Admin update settings error:', error)
        return NextResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
        )
    }
}
