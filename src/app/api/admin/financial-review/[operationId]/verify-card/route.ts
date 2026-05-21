import { NextRequest, NextResponse } from 'next/server'
import { OperationStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    parseJsonRecord,
    toNullableNumber,
    withFinancialReviewMetadata,
} from '@/lib/financial-review/evidence'
import type { CardVerificationOutcome } from '@/lib/financial-review/types'

type RouteContext = {
    params: Promise<{ operationId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { operationId } = await context.params
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                status: true,
                amount: true,
                responseData: true,
                responseMessage: true,
            },
        })

        if (!operation || operation.status !== OperationStatus.REVIEW_REQUIRED) {
            return NextResponse.json({ error: 'Operation is not reviewable' }, { status: 409 })
        }

        const responseData = parseJsonRecord(operation.responseData)
        const auditSnapshot = parseJsonRecord(responseData?.auditSnapshot)
        const beinDelta = toNullableNumber(auditSnapshot?.beinDelta)
        const successMessage = `${operation.responseMessage || ''}`.toLowerCase().includes('success')
        const likelyRenewed = Boolean(
            successMessage ||
            (typeof beinDelta === 'number' && Math.abs(beinDelta) >= Math.max(1, operation.amount * 0.5))
        )

        const outcome: CardVerificationOutcome = likelyRenewed ? 'LIKELY_RENEWED' : 'NOT_CONFIRMED'
        const summary = likelyRenewed
            ? 'الدليل المسجل يشير أن بين نفذت خصم/تجديد. راجع رقم الكارت قبل قرار عدم رد الفلوس.'
            : 'لا يوجد دليل كافي في اللوج المسجل يؤكد أن التجديد تم. يفضل فحص الكارت من موقع بين قبل القرار.'

        const check = {
            outcome,
            summary,
            checkedBy: authResult.user.id,
            checkedByUsername: authResult.user.username,
            checkedAt: new Date().toISOString(),
        }

        const nextResponseData = withFinancialReviewMetadata(operation.responseData, (current) => ({
            ...current,
            latestCardVerification: check,
            cardChecks: [...(current.cardChecks || []), check],
        }))

        await prisma.operation.update({
            where: { id: operationId },
            data: { responseData: nextResponseData },
        })

        return NextResponse.json({ success: true, check })
    } catch (error) {
        console.error('Financial review card verification error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
