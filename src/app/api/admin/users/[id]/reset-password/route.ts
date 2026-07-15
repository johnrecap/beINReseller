import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        return NextResponse.json({
            error: 'Users must change their own password from profile.',
        }, { status: 403 })

    } catch (error) {
        console.error('Reset password error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
