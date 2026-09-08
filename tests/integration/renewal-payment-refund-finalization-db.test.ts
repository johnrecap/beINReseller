import test from 'node:test'
import assert from 'node:assert/strict'

const runDbIntegration =
    process.env.RUN_DB_INTEGRATION === '1' ||
    process.env.RUN_DB_INTEGRATION === 'true' ||
    process.env.RUN_DB_INTEGRATION_TESTS === 'true'

test(
    '2026-08 renewal refund regression: concurrent store refund replays credit and stop outbox once',
    { skip: !runDbIntegration },
    async () => {
        assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
        const { default: prisma } = await import('@/lib/prisma')
        const { finalizeRenewalPaymentRefund } = await import(
            '../../src/lib/renewal-payment-refund-finalization'
        )
        const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const cardNumber = `78${Date.now().toString().slice(-8)}`
        const paymentIntentId = `pi_refund_concurrency_${marker}`

        const account = await prisma.beinAccount.create({
            data: {
                username: `store-refund-${marker}@bein.test`,
                password: 'test-only',
                automationExclusive: true,
            },
        })
        const customer = await prisma.customer.create({
            data: {
                email: `store-refund-${marker}@example.test`,
                name: 'Store refund concurrency test',
                passwordHash: 'test-only',
                storeCredit: 0,
            },
        })
        const operation = await prisma.operation.create({
            data: {
                customerId: customer.id,
                beinAccountId: account.id,
                type: 'RENEW',
                cardNumber,
                amount: 174,
                status: 'COMPLETING',
                selectedPackage: {
                    index: 3,
                    name: 'Premium 12 Months',
                    price: 174,
                },
                providerPaymentState: 'NOT_SUBMITTED',
                fulfillmentState: 'UNVERIFIED',
                fulfillmentAuthority: 'NONE',
            },
        })
        const payment = await prisma.payment.create({
            data: {
                customerId: customer.id,
                stripePaymentIntentId: paymentIntentId,
                amount: 200,
                currency: 'SAR',
                status: 'SUCCEEDED',
                type: 'SUBSCRIPTION',
                metadata: {
                    source: 'store_renewal',
                    operationId: operation.id,
                    subscriptionId: 'pending-link',
                    packageName: 'Premium 12 Months',
                    creditUsed: 9,
                },
            },
        })
        const subscription = await prisma.storeSubscription.create({
            data: {
                customerId: customer.id,
                cardNumber,
                status: 'PAID',
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
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                metadata: {
                    source: 'store_renewal',
                    operationId: operation.id,
                    subscriptionId: subscription.id,
                    packageName: 'Premium 12 Months',
                    creditUsed: 9,
                },
            },
        })
        await prisma.storeCreditLedgerEntry.create({
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
        await prisma.operationDispatch.create({
            data: {
                operationId: operation.id,
                jobType: 'COMPLETE_PURCHASE',
                payload: {
                    operationId: operation.id,
                    type: 'COMPLETE_PURCHASE',
                    cardNumber,
                    customerId: customer.id,
                    amount: 174,
                },
                status: 'PENDING',
            },
        })
        await prisma.providerAccountCausalReservation.create({
            data: {
                operationId: operation.id,
                beinAccountId: account.id,
                reservationGeneration: 1,
                acquiredAt: new Date(),
                renewedAt: new Date(),
                automaticWindowEndsAt: new Date(Date.now() + 10 * 60_000),
            },
        })

        const providerRefund = {
            charge: {
                id: `ch_${marker}`,
                paymentIntentId,
                amount: 20000,
                amountRefunded: 20000,
                currency: 'sar',
                refunded: true,
            },
            paymentIntent: {
                id: paymentIntentId,
                status: 'succeeded',
                amount: 20000,
                amountReceived: 20000,
                currency: 'sar',
                metadata: {
                    source: 'store_renewal',
                    operationId: operation.id,
                    subscriptionId: subscription.id,
                    customerId: customer.id,
                    packageIndex: '3',
                    packageName: 'Premium 12 Months',
                    beinPrice: '174',
                    customerPrice: '209',
                    creditUsed: '9',
                },
            },
        } as const

        try {
            const results = await Promise.all([
                prisma.$transaction((tx) => finalizeRenewalPaymentRefund(tx, providerRefund)),
                prisma.$transaction((tx) => finalizeRenewalPaymentRefund(tx, providerRefund)),
            ])
            assert.deepEqual(
                results.map((result) => result.result).sort(),
                ['ALREADY_REFUNDED', 'REFUNDED']
            )

            const [
                storedCustomer,
                storedPayment,
                storedSubscription,
                storedOperation,
                dispatch,
                ledgers,
                providerReservation,
            ] =
                await Promise.all([
                    prisma.customer.findUniqueOrThrow({ where: { id: customer.id } }),
                    prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
                    prisma.storeSubscription.findUniqueOrThrow({ where: { id: subscription.id } }),
                    prisma.operation.findUniqueOrThrow({ where: { id: operation.id } }),
                    prisma.operationDispatch.findUniqueOrThrow({
                        where: {
                            operationId_jobType_actionRevision: {
                                operationId: operation.id,
                                jobType: 'COMPLETE_PURCHASE',
                                actionRevision: 0,
                            },
                        },
                    }),
                    prisma.storeCreditLedgerEntry.findMany({
                        where: { subscriptionId: subscription.id },
                    }),
                    prisma.providerAccountCausalReservation.findUniqueOrThrow({
                        where: { operationId: operation.id },
                    }),
                ])
            assert.equal(storedCustomer.storeCredit, 9)
            assert.equal(storedPayment.status, 'REFUNDED')
            assert.equal(storedSubscription.status, 'REFUNDED')
            assert.equal(storedOperation.status, 'CANCELLED')
            assert.equal(dispatch.status, 'CANCELLED')
            assert.equal(ledgers.filter((entry) => entry.entryType === 'REFUND').length, 1)
            assert.ok(providerReservation.releasedAt)
            assert.equal(await prisma.operationIntegrityIssue.count({
                where: { operationId: operation.id },
            }), 0)
        } finally {
            await prisma.operationIntegrityIssue.deleteMany({ where: { operationId: operation.id } })
            await prisma.operationDispatch.deleteMany({ where: { operationId: operation.id } })
            await prisma.cardLifecycleReservation.deleteMany({ where: { operationId: operation.id } })
            await prisma.providerAccountCausalReservation.deleteMany({ where: { operationId: operation.id } })
            await prisma.storeCreditLedgerEntry.deleteMany({ where: { subscriptionId: subscription.id } })
            await prisma.storeSubscription.deleteMany({ where: { id: subscription.id } })
            await prisma.payment.deleteMany({ where: { id: payment.id } })
            await prisma.operation.deleteMany({ where: { id: operation.id } })
            await prisma.customer.deleteMany({ where: { id: customer.id } })
            await prisma.beinAccount.deleteMany({ where: { id: account.id } })
        }
    }
)

test(
    '2026-08 renewal refund regression: delayed completed refund records review without reopening work',
    { skip: !runDbIntegration },
    async () => {
        assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
        const { default: prisma } = await import('@/lib/prisma')
        const { finalizeRenewalPaymentRefund } = await import(
            '../../src/lib/renewal-payment-refund-finalization'
        )
        const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const paymentIntentId = `pi_delayed_refund_${marker}`
        const account = await prisma.beinAccount.create({
            data: {
                username: `delayed-refund-${marker}@bein.test`,
                password: 'test-only',
                automationExclusive: true,
            },
        })
        const customer = await prisma.customer.create({
            data: {
                email: `delayed-refund-${marker}@example.test`,
                name: 'Delayed refund test',
                passwordHash: 'test-only',
            },
        })
        const operation = await prisma.operation.create({
            data: {
                customerId: customer.id,
                beinAccountId: account.id,
                type: 'RENEW',
                cardNumber: `76${Date.now().toString().slice(-8)}`,
                amount: 209,
                status: 'COMPLETED',
                selectedPackage: { name: 'Premium 12 Months', price: 174 },
                providerPaymentState: 'CHARGED',
                fulfillmentState: 'VERIFIED',
                fulfillmentAuthority: 'AUTOMATED_COMPOSITE',
            },
        })
        const metadata = {
            source: 'mobile_renewal',
            operationId: operation.id,
            customerId: customer.id,
            packageName: 'Premium 12 Months',
            beinPrice: '174',
            customerPrice: '209',
        }
        const payment = await prisma.payment.create({
            data: {
                customerId: customer.id,
                stripePaymentIntentId: paymentIntentId,
                amount: 209,
                currency: 'SAR',
                status: 'SUCCEEDED',
                type: 'SUBSCRIPTION',
                metadata,
            },
        })
        await prisma.operationDispatch.create({
            data: {
                operationId: operation.id,
                jobType: 'CONFIRM_PURCHASE',
                payload: {
                    operationId: operation.id,
                    type: 'CONFIRM_PURCHASE',
                    cardNumber: operation.cardNumber,
                    customerId: customer.id,
                    amount: 209,
                },
                status: 'DISPATCHED',
                attempts: 1,
                dispatchedAt: new Date(),
            },
        })
        await prisma.providerAccountCausalReservation.create({
            data: {
                operationId: operation.id,
                beinAccountId: account.id,
                reservationGeneration: 1,
                acquiredAt: new Date(Date.now() - 20 * 60_000),
                renewedAt: new Date(Date.now() - 20 * 60_000),
                automaticWindowEndsAt: new Date(Date.now() - 10 * 60_000),
                releasedAt: new Date(Date.now() - 9 * 60_000),
                releaseReason: 'SAFE_TERMINAL:COMPLETED',
            },
        })

        try {
            const result = await prisma.$transaction((tx) => finalizeRenewalPaymentRefund(tx, {
                charge: {
                    id: `ch_delayed_${marker}`,
                    paymentIntentId,
                    amount: 20900,
                    amountRefunded: 20900,
                    currency: 'sar',
                    refunded: true,
                },
                paymentIntent: {
                    id: paymentIntentId,
                    status: 'succeeded',
                    amount: 20900,
                    amountReceived: 20900,
                    currency: 'sar',
                    metadata,
                },
            }))
            assert.equal(result.result, 'REVIEW_REQUIRED')

            const [
                storedOperation,
                storedPayment,
                storedDispatch,
                issue,
                cardReservation,
                providerReservation,
            ] = await Promise.all([
                prisma.operation.findUniqueOrThrow({ where: { id: operation.id } }),
                prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
                prisma.operationDispatch.findUniqueOrThrow({
                    where: {
                        operationId_jobType_actionRevision: {
                            operationId: operation.id,
                            jobType: 'CONFIRM_PURCHASE',
                            actionRevision: 0,
                        },
                    },
                }),
                prisma.operationIntegrityIssue.findUnique({
                    where: {
                        operationId_issueType: {
                            operationId: operation.id,
                            issueType: 'STRIPE_RENEWAL_REFUND_CONFLICT',
                        },
                    },
                }),
                prisma.cardLifecycleReservation.findUniqueOrThrow({
                    where: { operationId: operation.id },
                }),
                prisma.providerAccountCausalReservation.findUniqueOrThrow({
                    where: { operationId: operation.id },
                }),
            ])
            assert.equal(storedOperation.status, 'COMPLETED')
            assert.equal(storedPayment.status, 'REFUNDED')
            assert.equal(storedDispatch.status, 'DISPATCHED')
            assert.equal(issue?.status, 'OPEN')
            assert.equal(cardReservation.releasedAt, null)
            assert.equal(providerReservation.releasedAt, null)
            assert.ok(providerReservation.reservationGeneration > 1)
        } finally {
            await prisma.operationIntegrityIssue.deleteMany({ where: { operationId: operation.id } })
            await prisma.operationDispatch.deleteMany({ where: { operationId: operation.id } })
            await prisma.cardLifecycleReservation.deleteMany({ where: { operationId: operation.id } })
            await prisma.providerAccountCausalReservation.deleteMany({ where: { operationId: operation.id } })
            await prisma.payment.deleteMany({ where: { id: payment.id } })
            await prisma.operation.deleteMany({ where: { id: operation.id } })
            await prisma.customer.deleteMany({ where: { id: customer.id } })
            await prisma.beinAccount.deleteMany({ where: { id: account.id } })
        }
    }
)

test(
    '2026-08 renewal refund regression: concurrent mobile refund cancels renewal once',
    { skip: !runDbIntegration },
    async () => {
        assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
        const { default: prisma } = await import('@/lib/prisma')
        const { finalizeRenewalPaymentRefund } = await import(
            '../../src/lib/renewal-payment-refund-finalization'
        )
        const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const cardNumber = `77${Date.now().toString().slice(-8)}`
        const paymentIntentId = `pi_mobile_refund_${marker}`
        const customer = await prisma.customer.create({
            data: {
                email: `mobile-refund-${marker}@example.test`,
                name: 'Mobile refund concurrency test',
                passwordHash: 'test-only',
            },
        })
        const operation = await prisma.operation.create({
            data: {
                customerId: customer.id,
                type: 'RENEW',
                cardNumber,
                amount: 209,
                status: 'AWAITING_FINAL_CONFIRM',
                selectedPackage: {
                    name: 'Premium 12 Months',
                    price: 174,
                },
                providerPaymentState: 'NOT_SUBMITTED',
                fulfillmentState: 'UNVERIFIED',
                fulfillmentAuthority: 'NONE',
            },
        })
        const payment = await prisma.payment.create({
            data: {
                customerId: customer.id,
                stripePaymentIntentId: paymentIntentId,
                amount: 209,
                currency: 'SAR',
                status: 'SUCCEEDED',
                type: 'SUBSCRIPTION',
                metadata: {
                    source: 'mobile_renewal',
                    operationId: operation.id,
                    customerId: customer.id,
                    packageName: 'Premium 12 Months',
                    beinPrice: '174',
                    customerPrice: '209',
                },
            },
        })
        const providerRefund = {
            charge: {
                id: `ch_mobile_${marker}`,
                paymentIntentId,
                amount: 20900,
                amountRefunded: 20900,
                currency: 'sar',
                refunded: true,
            },
            paymentIntent: {
                id: paymentIntentId,
                status: 'succeeded',
                amount: 20900,
                amountReceived: 20900,
                currency: 'sar',
                metadata: {
                    source: 'mobile_renewal',
                    operationId: operation.id,
                    customerId: customer.id,
                    packageName: 'Premium 12 Months',
                    beinPrice: '174',
                    customerPrice: '209',
                },
            },
        } as const

        try {
            const results = await Promise.all([
                prisma.$transaction((tx) => finalizeRenewalPaymentRefund(tx, providerRefund)),
                prisma.$transaction((tx) => finalizeRenewalPaymentRefund(tx, providerRefund)),
            ])
            assert.deepEqual(
                results.map((result) => result.result).sort(),
                ['ALREADY_REFUNDED', 'REFUNDED']
            )
            const [storedPayment, storedOperation, reservation] = await Promise.all([
                prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
                prisma.operation.findUniqueOrThrow({ where: { id: operation.id } }),
                prisma.cardLifecycleReservation.findUnique({
                    where: { operationId: operation.id },
                }),
            ])
            assert.equal(storedPayment.status, 'REFUNDED')
            assert.equal(storedOperation.status, 'CANCELLED')
            assert.ok(!reservation || reservation.releasedAt)
            assert.equal(await prisma.operationIntegrityIssue.count({
                where: { operationId: operation.id },
            }), 0)
        } finally {
            await prisma.operationIntegrityIssue.deleteMany({ where: { operationId: operation.id } })
            await prisma.operationDispatch.deleteMany({ where: { operationId: operation.id } })
            await prisma.cardLifecycleReservation.deleteMany({ where: { operationId: operation.id } })
            await prisma.payment.deleteMany({ where: { id: payment.id } })
            await prisma.operation.deleteMany({ where: { id: operation.id } })
            await prisma.customer.deleteMany({ where: { id: customer.id } })
        }
    }
)

test(
    '2026-08 renewal refund regression: terminal refund review serializes against a new card renewal',
    { skip: !runDbIntegration },
    async () => {
        assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
        const { default: prisma } = await import('@/lib/prisma')
        const { finalizeRenewalPaymentRefund } = await import(
            '../../src/lib/renewal-payment-refund-finalization'
        )
        const {
            createGuardedRenewalOperation,
            lockRenewalCardLifecycle,
        } = await import('../../src/lib/operations/renewal-creation-guard')
        const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const cardNumber = `79${Date.now().toString().slice(-8)}`
        const paymentIntentId = `pi_terminal_refund_start_race_${marker}`
        const customer = await prisma.customer.create({
            data: {
                email: `terminal-refund-race-${marker}@example.test`,
                name: 'Terminal refund creation race test',
                passwordHash: 'test-only',
            },
        })
        const operation = await prisma.operation.create({
            data: {
                customerId: customer.id,
                type: 'RENEW',
                cardNumber,
                amount: 209,
                status: 'COMPLETED',
                selectedPackage: { name: 'Premium 12 Months', price: 174 },
                providerPaymentState: 'CHARGED',
                fulfillmentState: 'VERIFIED',
                fulfillmentAuthority: 'AUTOMATED_COMPOSITE',
            },
        })
        const metadata = {
            source: 'mobile_renewal',
            operationId: operation.id,
            customerId: customer.id,
            packageName: 'Premium 12 Months',
            beinPrice: '174',
            customerPrice: '209',
        }
        const payment = await prisma.payment.create({
            data: {
                customerId: customer.id,
                stripePaymentIntentId: paymentIntentId,
                amount: 209,
                currency: 'SAR',
                status: 'SUCCEEDED',
                type: 'SUBSCRIPTION',
                metadata,
            },
        })
        const providerRefund = {
            charge: {
                id: `ch_terminal_refund_start_race_${marker}`,
                paymentIntentId,
                amount: 20900,
                amountRefunded: 20900,
                currency: 'sar',
                refunded: true,
            },
            paymentIntent: {
                id: paymentIntentId,
                status: 'succeeded',
                amount: 20900,
                amountReceived: 20900,
                currency: 'sar',
                metadata,
            },
        } as const

        let signalRefundHasCardLock!: () => void
        const refundHasCardLock = new Promise<void>((resolve) => {
            signalRefundHasCardLock = resolve
        })
        let continueRefund!: () => void
        const refundMayContinue = new Promise<void>((resolve) => {
            continueRefund = resolve
        })

        try {
            const refundPromise = prisma.$transaction(async (tx) => {
                await lockRenewalCardLifecycle(tx, cardNumber)
                signalRefundHasCardLock()
                await refundMayContinue
                return finalizeRenewalPaymentRefund(tx, providerRefund)
            })
            await refundHasCardLock

            const creationPromise = prisma.$transaction((tx) =>
                createGuardedRenewalOperation(tx, {
                    cardNumber,
                    data: {
                        customerId: customer.id,
                        amount: 0,
                        status: 'AWAITING_PACKAGE',
                        providerPaymentState: 'NOT_SUBMITTED',
                        fulfillmentState: 'UNVERIFIED',
                        fulfillmentAuthority: 'NONE',
                    },
                })
            )
            continueRefund()

            const [refundResult, creationResult] = await Promise.allSettled([
                refundPromise,
                creationPromise,
            ])
            assert.equal(refundResult.status, 'fulfilled')
            if (refundResult.status === 'fulfilled') {
                assert.equal(refundResult.value.result, 'REVIEW_REQUIRED')
            }
            assert.equal(creationResult.status, 'rejected')
            assert.equal(await prisma.operation.count({ where: { cardNumber } }), 1)
            assert.equal(await prisma.operationIntegrityIssue.count({
                where: {
                    operationId: operation.id,
                    issueType: 'STRIPE_RENEWAL_REFUND_CONFLICT',
                    status: 'OPEN',
                },
            }), 1)
            const reservation = await prisma.cardLifecycleReservation.findUniqueOrThrow({
                where: { operationId: operation.id },
            })
            assert.equal(reservation.releasedAt, null)
        } finally {
            const operations = await prisma.operation.findMany({
                where: { cardNumber },
                select: { id: true },
            })
            const operationIds = operations.map((entry) => entry.id)
            await prisma.operationIntegrityIssue.deleteMany({
                where: { operationId: { in: operationIds } },
            })
            await prisma.operationDispatch.deleteMany({
                where: { operationId: { in: operationIds } },
            })
            await prisma.cardLifecycleReservation.deleteMany({
                where: { operationId: { in: operationIds } },
            })
            await prisma.providerAccountCausalReservation.deleteMany({
                where: { operationId: { in: operationIds } },
            })
            await prisma.payment.deleteMany({ where: { id: payment.id } })
            await prisma.operation.deleteMany({ where: { id: { in: operationIds } } })
            await prisma.customer.deleteMany({ where: { id: customer.id } })
        }
    }
)
