import { NextRequest, NextResponse } from 'next/server'
import { OperationStatus, Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    buildFinancialReviewItem,
    type CustomerWalletDebitLookup,
} from '@/lib/financial-review/evidence'
import type { FinancialReviewState } from '@/lib/financial-review/types'
import { classifyFinancialReview, reviewCapabilitySelect } from '@/lib/financial-review/capabilities'
import { projectRenewalHold } from '../../../../../shared/operations/renewal-hold'
import { RENEWAL_BLOCKING_ISSUES } from '../../../../../shared/operations/renewal-pre-payment'

const REVIEW_STATES: FinancialReviewState[] = ['needs_decision', 'follow_up', 'refunded', 'bein_executed', 'archived']
const CLOSED_REVIEW_DECISION_FILTERS: Prisma.OperationWhereInput[] = [
    { responseData: { path: ['financialReview', 'latestDecision', 'action'], equals: 'BEIN_EXECUTED_NO_REFUND' } },
    { responseData: { path: ['financialReview', 'latestDecision', 'action'], equals: 'REFUND_CUSTOMER' } },
    { responseData: { path: ['financialReview', 'latestDecision', 'action'], equals: 'KEEP_UNDER_REVIEW' } },
    { responseData: { path: ['financialReview', 'latestDecision', 'action'], equals: 'RESOLVE_PRE_MUTATION' } },
]

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
        const cursor = searchParams.get('cursor') || ''
        if (cursor.length > 100 || cursor && !/^[a-zA-Z0-9_-]+$/.test(cursor)) {
            return NextResponse.json({ error: 'INVALID_LIST_QUERY' }, { status: 400 })
        }
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const operations = await prisma.operation.findMany({
            where: {
                OR: [
                    { administrativeReleaseId: { not: null } },
                    // Open reviews must remain discoverable for as long as they
                    // block a card; the date window applies to closed history.
                    { status: OperationStatus.REVIEW_REQUIRED },
                    { type: 'RENEW', OR: [
                        { integrityIssues: { some: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, issueType: { in: [...RENEWAL_BLOCKING_ISSUES] } } } },
                        { status: { in: ['FAILED', 'CANCELLED', 'EXPIRED', 'COMPLETED'] }, OR: [
                            { cardLifecycleReservation: { is: { releasedAt: null } } },
                            { providerAccountCausalReservation: { is: { releasedAt: null } } },
                        ] },
                    ] },
                    { AND: [
                        { updatedAt: { gte: startDate } },
                        { OR: CLOSED_REVIEW_DECISION_FILTERS },
                    ] },
                ],
                ...(q ? {
                    AND: [{
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
                        ],
                    }]
                } : {}),
                ...(cursor ? { id: { gt: cursor } } : {}),
            },
            select: {
                ...reviewCapabilitySelect,
                integrityIssues: { where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, issueType: { in: [...RENEWAL_BLOCKING_ISSUES] } },
                    select: { issueType: true } },
                cardLifecycleReservation: { select: { releasedAt: true } },
                providerAccountCausalReservation: { select: { releasedAt: true } },
                id: true,
                type: true,
                cardNumber: true,
                amount: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                responseMessage: true,
                responseData: true,
                fulfillmentAuthority: true,
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
                fulfillmentProof: {
                    select: {
                        id: true,
                        operationId: true,
                        beinAccountId: true,
                        cardNumberSnapshot: true,
                        invoiceNo: true,
                        proofKind: true,
                    },
                },
                manualFulfillmentEvidence: {
                    select: {
                        id: true,
                        invoiceNo: true,
                        beinAccountId: true,
                        cardNumberSnapshot: true,
                        packageNameSnapshot: true,
                        providerAmount: true,
                        currency: true,
                        evidenceSource: true,
                        evidenceNote: true,
                        observedAt: true,
                        actorUserId: true,
                    },
                },
                transactions: { select: { type: true, amount: true, userId: true } },
            },
            orderBy: { id: 'asc' },
            take: 101,
        })

        const page = operations.slice(0, 100)

        const operationIds = page.map((operation) => operation.id)
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

        const allItems = page
            .map((operation) => {
                const item = buildFinancialReviewItem(operation, walletDebitLookup)
                const hold = projectRenewalHold(operation)
                return item ? { ...item, hold, ...(hold && operation.status !== 'REVIEW_REQUIRED'
                    ? { state: 'needs_decision' as const } : {}),
                    ...(operation.administrativeArchivedAt ? { state: 'archived' as const } : {}),
                    administrativeRelease: operation.administrativeRelease,
                    lateProviderObservations: operation.providerRequests,
                    capabilities: classifyFinancialReview(operation) } : null
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item))

        const filteredItems = stateParam && stateParam !== 'all' && REVIEW_STATES.includes(stateParam)
            ? allItems.filter((item) => item.state === stateParam)
            : allItems
        const items = filteredItems.map((item) => ({
            ...item,
            manualEvidenceId: item.evidence.manualEvidenceId,
        }))

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
            nextCursor: operations.length > 100 ? page.at(-1)?.id ?? null : null,
        })
    } catch (error) {
        console.error('Financial review list error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
