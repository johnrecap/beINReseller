import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * Public (no auth) endpoint that returns sidebar visibility settings.
 * Returns which admin sidebar links should be shown.
 * Default: both shown (true).
 */
export async function GET() {
    try {
        const keys = ['sidebar_show_login_failures', 'sidebar_show_low_balance']

        const settings = await prisma.setting.findMany({
            where: { key: { in: keys } }
        })

        const map: Record<string, boolean> = {
            sidebar_show_login_failures: true,
            sidebar_show_low_balance: true,
        }

        for (const s of settings) {
            map[s.key] = s.value === 'true'
        }

        return NextResponse.json(map)
    } catch {
        // On error, show everything
        return NextResponse.json({
            sidebar_show_login_failures: true,
            sidebar_show_low_balance: true,
        })
    }
}
