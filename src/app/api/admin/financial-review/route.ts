import { NextRequest, NextResponse } from 'next/server'
import { OperationStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    buildFinancialReviewItem,
    type CustomerWalletDebitLookup,
} from '@/lib/financial-review/evidence'
import type { FinancialReviewState } from '@/lib/financial-review/types'

const REVIEW_STATES: FinancialReviewState[] = ['needs_decision', 'follow_up', 'refunded', 'bein_executed']

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const days = Math.max(1, Math.min(365, parseInt(searchParams.get('days') || '60')))
        const stateParam = searchParams.get('state') as FinancialReviewState | 'all' | null
        const q = (searchParams.get('q') || '').trim()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const operations = await prisma.operation.findMany({
            where: {
                status: OperationStatus.REVIEW_REQUIRED,
                updatedAt: { gte: startDate },
                ...(q ? {
                    OR: [
                        { id: { contains: q, mode: 'insensitive' } },
                        { cardNumber: { contains: q, mode: 'insensitive' } },
                        { responseMessage: { contains: q, mode: 'insensitive' } },
                        { user: { username: { contains: q, mode: 'insensitive' } } },
                        { customer: { name: { contains: q, mode: 'insensitive' } } },
                        { customer: { email: { contains: q, mode: 'insensitive' } } },
                        { beinAccount: { username: { contains: q, mode: 'insensitive' } } },
                        { beinAccount: { label: { contains: q, mode: 'insensitive' } } },
                        { chargedBeinSpendLedger: { is: { beinUsernameSnapshot: { contains: q, mode: 'insensitive' } } } },
                        { chargedBeinSpendLedger: { is: { beinLabelSnapshot: { contains: q, mode: 'insensitive' } } } },
                    ]
                } : {}),
            },
            select: {
                id: true,
                type: true,
                cardNumber: true,
                amount: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                responseMessage: true,
                responseData: true,
                selectedPackage: true,
                user: { select: { id: true, username: true } },
                customer: { select: { id: true, name: true, email: true } },
                beinAccount: { select: { id: true, username: true, label: true } },
                chargedBeinSpendLedger: {
                    select: {
                        id: true,
                        beinAccountId: true,
                        dealerBalanceBefore: true,
                        dealerBalanceAfter: true,
                        spendAmount: true,
                        evidenceConfidence: true,
                        beinUsernameSnapshot: true,
                        beinLabelSnapshot: true,
                    },
                },
                transactions: { select: { type: true, amount: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 300,
        })

        const operationIds = operations.map((operation) => operation.id)
        const walletDebits = operationIds.length > 0
            ? await prisma.walletTransaction.findMany({
                where: {
                    referenceId: { in: operationIds },
                    type: 'DEBIT',
                },
                select: { referenceId: true },
            })
            : []

        const walletDebitLookup: CustomerWalletDebitLookup = new Map(
            walletDebits
                .filter((transaction) => transaction.referenceId)
                .map((transaction) => [transaction.referenceId as string, true])
        )

        const allItems = operations
            .map((operation) => buildFinancialReviewItem(operation, walletDebitLookup))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))

        const items = stateParam && stateParam !== 'all' && REVIEW_STATES.includes(stateParam)
            ? allItems.filter((item) => item.state === stateParam)
            : allItems

        const summary = {
            total: allItems.length,
            needsDecision: allItems.filter((item) => item.state === 'needs_decision').length,
            followUp: allItems.filter((item) => item.state === 'follow_up').length,
            refunded: allItems.filter((item) => item.state === 'refunded').length,
            beinExecuted: allItems.filter((item) => item.state === 'bein_executed').length,
            financiallyImpactedTotal: allItems.reduce((sum, item) => sum + item.amount, 0),
        }

        return NextResponse.json({
            period: { days, startDate: startDate.toISOString() },
            summary,
            items,
        })
    } catch (error) {
        console.error('Financial review list error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
