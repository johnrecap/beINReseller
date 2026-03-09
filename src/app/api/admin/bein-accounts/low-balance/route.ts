import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        // Get low balance threshold from settings
        let threshold = 300
        try {
            const setting = await prisma.setting.findUnique({
                where: { key: 'min_dealer_balance_alert' }
            })
            if (setting?.value) threshold = parseFloat(setting.value)
        } catch { /* use default */ }

        // Find accounts that are disabled AND have low balance
        const accounts = await prisma.beinAccount.findMany({
            where: {
                isActive: false,
                lowBalanceAlertEnabled: true,
                dealerBalance: { lt: threshold }
            },
            orderBy: [
                { balanceUpdatedAt: 'desc' },
                { updatedAt: 'desc' }
            ],
            select: {
                id: true,
                username: true,
                label: true,
                isActive: true,
                dealerBalance: true,
                balanceUpdatedAt: true,
                lowBalanceAlertEnabled: true,
            }
        })

        return NextResponse.json({
            success: true,
            threshold,
            accounts,
        })
    } catch (error) {
        console.error('Get beIN low balance accounts error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
