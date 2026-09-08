import test from 'node:test'
import assert from 'node:assert/strict'

const runDbIntegration =
    process.env.RUN_DB_INTEGRATION === '1' ||
    process.env.RUN_DB_INTEGRATION === 'true' ||
    process.env.RUN_DB_INTEGRATION_TESTS === 'true'

test(
    '2026-08 store renewal regression: concurrent confirms produce one state transition and one outbox row',
    { skip: !runDbIntegration },
    async () => {
        assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
        assert.ok(process.env.REDIS_URL, 'REDIS_URL is required when RUN_DB_INTEGRATION is enabled')
        const { default: prisma } = await import('@/lib/prisma')
        const { finalizeStoreSubscriptionPayment } = await import(
            '../../src/lib/store-subscription-payment-finalization'
        )
        const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const cardNumber = `79${Date.now().toString().slice(-8)}`
        const paymentIntentId = `pi_store_concurrency_${marker}`

        const customer = await prisma.customer.create({
            data: {
                email: `store-payment-${marker}@example.test`,
                name: 'Store payment concurrency test',
                passwordHash: 'test-only',
            },
        })
        const operation = await prisma.operation.create({
            data: {
                customerId: customer.id,
                type: 'RENEW',
                cardNumber,
                amount: 174,
                status: 'AWAITING_PACKAGE',
                selectedPackage: {
                    index: 3,
                    name: 'Premium 12 Months',
                    price: 174,
                },
                providerPaymentState: 'NOT_SUBMITTED',
                fulfillmentState: 'UNVERIFIED',
            },
        })
        const payment = await prisma.payment.create({
            data: {
                customerId: customer.id,
                stripePaymentIntentId: paymentIntentId,
                amount: 200,
                currency: 'SAR',
                status: 'PENDING',
                type: 'SUBSCRIPTION',
            },
        })
        const subscription = await prisma.storeSubscription.create({
            data: {
                customerId: customer.id,
                cardNumber,
                status: 'AWAITING_PAYMENT',
                packageName: 'Premium 12 Months',
                packagePrice: 174,
                currency: 'SAR',
                price: 209,
                creditUsed: 9,
                stripePaymentIntentId: paymentIntentId,
                paymentId: payment.id,
                operationId: operation.id,
            },
        })

        try {
            const debitAttempts = await Promise.allSettled([0, 1].map(() =>
                prisma.storeCreditLedgerEntry.create({
                    data: {
                        subscriptionId: subscription.id,
                        customerId: customer.id,
                        entryType: 'DEBIT',
                        amountMinor: 900,
                        balanceBeforeMinor: 900,
                        balanceAfterMinor: 0,
                        currency: 'SAR',
                        reasonCode: 'STORE_SUBSCRIPTION_PACKAGE_SELECTION',
                    },
                })
            ))
            assert.equal(
                debitAttempts.filter((attempt) => attempt.status === 'fulfilled').length,
                1
            )
            assert.equal(
                debitAttempts.filter((attempt) => attempt.status === 'rejected').length,
                1
            )

            const results = await Promise.all([
                prisma.$transaction((tx) => finalizeStoreSubscriptionPayment(tx, {
                    subscriptionId: subscription.id,
                    operationId: operation.id,
                    cardNumber,
                    customerId: customer.id,
                    paymentIntentId,
                })),
                prisma.$transaction((tx) => finalizeStoreSubscriptionPayment(tx, {
                    subscriptionId: subscription.id,
                    operationId: operation.id,
                    cardNumber,
                    customerId: customer.id,
                    paymentIntentId,
                })),
            ])

            assert.deepEqual(results.sort(), ['ALREADY_FINALIZED', 'FINALIZED'])
            assert.equal(await prisma.operationDispatch.count({
                where: {
                    operationId: operation.id,
                    jobType: 'COMPLETE_PURCHASE',
                },
            }), 1)

            const [storedPayment, storedSubscription, storedOperation] = await Promise.all([
                prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
                prisma.storeSubscription.findUniqueOrThrow({ where: { id: subscription.id } }),
                prisma.operation.findUniqueOrThrow({ where: { id: operation.id } }),
            ])
            assert.equal(storedPayment.status, 'SUCCEEDED')
            assert.equal(storedSubscription.status, 'PAID')
            assert.equal(storedOperation.status, 'COMPLETING')
        } finally {
            await prisma.operationDispatch.deleteMany({ where: { operationId: operation.id } })
            await prisma.cardLifecycleReservation.deleteMany({ where: { operationId: operation.id } })
            await prisma.storeCreditLedgerEntry.deleteMany({
                where: { subscriptionId: subscription.id },
            })
            await prisma.storeSubscription.deleteMany({ where: { id: subscription.id } })
            await prisma.payment.deleteMany({ where: { id: payment.id } })
            await prisma.operation.deleteMany({ where: { id: operation.id } })
            await prisma.customer.deleteMany({ where: { id: customer.id } })
        }
    }
)
