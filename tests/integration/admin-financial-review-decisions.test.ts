import test from 'node:test'
import assert from 'node:assert/strict'
import { appendManualReviewDecision } from '@/lib/financial-review/manual-decisions'
import {
    extractFinancialReviewMetadata,
    withFinancialReviewMetadata,
} from '@/lib/financial-review/evidence'

const runDbIntegration =
    process.env.RUN_DB_INTEGRATION === '1' ||
    process.env.RUN_DB_INTEGRATION === 'true' ||
    process.env.RUN_DB_INTEGRATION_TESTS === 'true'

test('persists append-only financial review decision history', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const suffix = `financial-review-${Date.now()}`
    const user = await prisma.user.create({
        data: {
            username: suffix,
            email: `${suffix}@example.test`,
            passwordHash: 'test',
        },
    })
    const operation = await prisma.operation.create({
        data: {
            userId: user.id,
            type: 'RENEW',
            cardNumber: '7500000009',
            amount: 92,
            status: 'REVIEW_REQUIRED',
            responseData: {},
        },
    })

    try {
        const first = withFinancialReviewMetadata(operation.responseData, (current) => appendManualReviewDecision(current, {
            action: 'BEIN_EXECUTED_NO_REFUND',
            note: '',
            decidedBy: 'admin-1',
            decidedByUsername: 'admin',
            decidedAt: '2026-06-04T08:00:00.000Z',
            cardRenewed: true,
        }))

        const second = withFinancialReviewMetadata(first, (current) => appendManualReviewDecision(current, {
            action: 'REFUND_CUSTOMER',
            note: 'manual correction',
            decidedBy: 'admin-2',
            decidedByUsername: 'second-admin',
            decidedAt: '2026-06-04T08:05:00.000Z',
            cardRenewed: false,
            refundApplied: true,
        }))

        await prisma.operation.update({
            where: { id: operation.id },
            data: { responseData: second },
        })

        const updated = await prisma.operation.findUniqueOrThrow({
            where: { id: operation.id },
            select: { responseData: true },
        })
        const metadata = extractFinancialReviewMetadata(updated.responseData)

        assert.equal(metadata.decisions?.length, 2)
        assert.equal(metadata.decisions?.[0]?.paymentStatus, 'تم تأكيد الدفع')
        assert.equal(metadata.latestDecision?.paymentStatus, 'لم يتم تأكيد الدفع')
        assert.equal(metadata.latestDecision?.note, 'manual correction')
    } finally {
        await prisma.operation.deleteMany({ where: { id: operation.id } })
        await prisma.user.deleteMany({ where: { id: user.id } })
    }
})
