import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { detectAndRecordOperationIntegrity } from '@/lib/integrity/detector'

const scanSchema = z.object({
    days: z.number().int().min(1).max(90).optional(),
    limit: z.number().int().min(1).max(1000).optional()
})

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json().catch(() => ({}))
        const parsed = scanSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const days = parsed.data.days || 7
        const limit = parsed.data.limit || 300
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const operations = await prisma.operation.findMany({
            where: {
                status: 'COMPLETED',
                amount: { gt: 0 },
                completedAt: { gte: startDate }
            },
            select: { id: true },
            orderBy: { completedAt: 'desc' },
            take: limit
        })

        for (const operation of operations) {
            await detectAndRecordOperationIntegrity(operation.id)
        }

        return NextResponse.json({
            success: true,
            scanned: operations.length,
            days,
            limit
        })
    } catch (error) {
        console.error('Integrity scan error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

