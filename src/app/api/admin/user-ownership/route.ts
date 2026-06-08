import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireExactRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    getOwnershipTransferErrorResponse,
    transferUserOwnership,
} from '@/lib/users/ownership-transfer'

const transferSchema = z.object({
    userId: z.string().trim().min(1),
    targetOwnerType: z.enum(['ADMIN', 'MANAGER', 'AGENT']),
    targetOwnerId: z.string().trim().min(1),
    sourceGroup: z.string().trim().max(120).optional().or(z.literal('')),
    whatsappGroupUrl: z.string().trim().max(500).optional().or(z.literal('')),
    reason: z.string().trim().max(500).optional().or(z.literal('')),
})

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireExactRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => null)
        const parsed = transferSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid ownership transfer data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const result = await transferUserOwnership({
            userId: parsed.data.userId,
            targetOwnerType: parsed.data.targetOwnerType,
            targetOwnerId: parsed.data.targetOwnerId,
            sourceGroup: parsed.data.sourceGroup || null,
            whatsappGroupUrl: parsed.data.whatsappGroupUrl || null,
            reason: parsed.data.reason || null,
            adminUserId: authResult.user.id,
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent'),
        })

        return NextResponse.json({
            success: true,
            transfer: result,
        })
    } catch (error) {
        const transferError = getOwnershipTransferErrorResponse(error)
        if (transferError && !transferError.ok) {
            return NextResponse.json({ error: transferError.code }, { status: transferError.status })
        }

        console.error('Transfer user ownership error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
