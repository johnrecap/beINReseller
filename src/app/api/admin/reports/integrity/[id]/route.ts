import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

const updateIssueSchema = z.object({
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE', 'IGNORED']),
    reviewNote: z.string().max(500).optional()
})

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const body = await request.json()
        const parsed = updateIssueSchema.safeParse(body)

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const data = parsed.data
        const reviewerId = authResult.user.id
        const reviewTime = data.status === 'OPEN' ? null : new Date()

        const updated = await prisma.operationIntegrityIssue.update({
            where: { id },
            data: {
                status: data.status,
                reviewNote: data.reviewNote || null,
                reviewedById: data.status === 'OPEN' ? null : reviewerId,
                reviewedAt: reviewTime
            }
        })

        return NextResponse.json({ success: true, issue: updated })
    } catch (error) {
        console.error('Update integrity issue error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

