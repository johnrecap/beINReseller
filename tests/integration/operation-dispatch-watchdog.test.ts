import test from 'node:test'
import assert from 'node:assert/strict'

const runDbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true'

test('exhausted confirm dispatch does not leave deducted money hidden', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { recoverOperationIfNeeded } = await import('@/lib/operations/recovery')

    const suffix = Date.now()
    const user = await prisma.user.create({
        data: {
            username: `dispatch-watchdog-${suffix}`,
            email: `dispatch-watchdog-${suffix}@example.test`,
            passwordHash: 'test',
            balance: 100,
        },
    })

    const operation = await prisma.operation.create({
        data: {
            userId: user.id,
            type: 'RENEW',
            cardNumber: `watchdog-${suffix}`,
            amount: 92,
            status: 'COMPLETING',
            responseData: {
                operationPhase: 'DISPATCH_FAILED',
                jobType: 'CONFIRM_PURCHASE',
                finalPaySubmitted: false,
            },
            dispatches: {
                create: {
                    jobType: 'CONFIRM_PURCHASE',
                    payload: {
                        operationId: `watchdog-${suffix}`,
                        type: 'CONFIRM_PURCHASE',
                        cardNumber: `watchdog-${suffix}`,
                    },
                    status: 'PENDING',
                    attempts: 3,
                    lastError: 'queue unavailable',
                },
            },
            transactions: {
                create: {
                    userId: user.id,
                    type: 'OPERATION_DEDUCT',
                    amount: -92,
                    balanceAfter: 8,
                    notes: 'test deduction',
                },
            },
        },
    })

    try {
        const result = await recoverOperationIfNeeded(operation.id, 'timeout')
        const updated = await prisma.operation.findUniqueOrThrow({
            where: { id: operation.id },
            include: {
                transactions: {
                    where: { type: 'REFUND' },
                },
            },
        })

        assert.equal(result.changed, true)
        assert.notEqual(updated.status, 'COMPLETING')
        assert.ok(
            updated.status === 'FAILED' || updated.status === 'REVIEW_REQUIRED',
            `unexpected status ${updated.status}`
        )
        assert.ok(
            updated.transactions.length === 1 || updated.status === 'REVIEW_REQUIRED',
            'deducted money must be refunded or visible for review'
        )
    } finally {
        await prisma.notification.deleteMany({ where: { userId: user.id } })
        await prisma.transaction.deleteMany({ where: { operationId: operation.id } })
        await prisma.operationDispatch.deleteMany({ where: { operationId: operation.id } })
        await prisma.operation.deleteMany({ where: { id: operation.id } })
        await prisma.user.deleteMany({ where: { id: user.id } })
    }
})

test('exhausted zero-amount confirm dispatch expires instead of becoming hidden review', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { recoverOperationIfNeeded } = await import('@/lib/operations/recovery')

    const suffix = Date.now()
    const operation = await prisma.operation.create({
        data: {
            type: 'RENEW',
            cardNumber: `zero-watchdog-${suffix}`,
            amount: 0,
            status: 'COMPLETING',
            responseData: {
                operationPhase: 'DISPATCH_FAILED',
                jobType: 'CONFIRM_PURCHASE',
                finalPaySubmitted: false,
            },
            dispatches: {
                create: {
                    jobType: 'CONFIRM_PURCHASE',
                    payload: {
                        operationId: `zero-watchdog-${suffix}`,
                        type: 'CONFIRM_PURCHASE',
                        cardNumber: `zero-watchdog-${suffix}`,
                    },
                    status: 'PENDING',
                    attempts: 3,
                    lastError: 'queue unavailable',
                },
            },
        },
    })

    try {
        const result = await recoverOperationIfNeeded(operation.id, 'timeout')
        const updated = await prisma.operation.findUniqueOrThrow({
            where: { id: operation.id },
            select: { status: true, responseMessage: true },
        })

        assert.equal(result.changed, true)
        assert.equal(result.reviewRequired, false)
        assert.equal(updated.status, 'EXPIRED')
        assert.notEqual(updated.status, 'REVIEW_REQUIRED')
    } finally {
        await prisma.operationDispatch.deleteMany({ where: { operationId: operation.id } })
        await prisma.operation.deleteMany({ where: { id: operation.id } })
    }
})

test('zero-amount operation with hidden deduction still requires review when refund cannot apply', { skip: !runDbIntegration }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const { recoverOperationIfNeeded } = await import('@/lib/operations/recovery')

    const suffix = Date.now()
    const user = await prisma.user.create({
        data: {
            username: `hidden-deduct-${suffix}`,
            email: `hidden-deduct-${suffix}@example.test`,
            passwordHash: 'test',
            balance: 8,
        },
    })

    const operation = await prisma.operation.create({
        data: {
            userId: user.id,
            type: 'RENEW',
            cardNumber: `hidden-deduct-${suffix}`,
            amount: 0,
            status: 'COMPLETING',
            responseData: {
                operationPhase: 'DISPATCH_FAILED',
                jobType: 'CONFIRM_PURCHASE',
                finalPaySubmitted: false,
            },
            dispatches: {
                create: {
                    jobType: 'CONFIRM_PURCHASE',
                    payload: {
                        operationId: `hidden-deduct-${suffix}`,
                        type: 'CONFIRM_PURCHASE',
                        cardNumber: `hidden-deduct-${suffix}`,
                    },
                    status: 'PENDING',
                    attempts: 3,
                    lastError: 'queue unavailable',
                },
            },
            transactions: {
                create: {
                    userId: user.id,
                    type: 'OPERATION_DEDUCT',
                    amount: -92,
                    balanceAfter: 8,
                    notes: 'test hidden deduction',
                },
            },
        },
    })

    try {
        const result = await recoverOperationIfNeeded(operation.id, 'timeout')
        const updated = await prisma.operation.findUniqueOrThrow({
            where: { id: operation.id },
            select: { status: true, responseMessage: true },
        })

        assert.equal(result.changed, true)
        assert.equal(result.reviewRequired, true)
        assert.equal(updated.status, 'REVIEW_REQUIRED')
        assert.match(updated.responseMessage || '', /manual review required/i)
    } finally {
        await prisma.activityLog.deleteMany({ where: { userId: user.id } })
        await prisma.notification.deleteMany({ where: { userId: user.id } })
        await prisma.transaction.deleteMany({ where: { operationId: operation.id } })
        await prisma.operationDispatch.deleteMany({ where: { operationId: operation.id } })
        await prisma.operation.deleteMany({ where: { id: operation.id } })
        await prisma.user.deleteMany({ where: { id: user.id } })
    }
})
