import test from 'node:test'
import assert from 'node:assert/strict'

const runDbIntegration =
    process.env.RUN_DB_INTEGRATION === '1' ||
    process.env.RUN_DB_INTEGRATION === 'true' ||
    process.env.RUN_DB_INTEGRATION_TESTS === 'true'

test(
    '2026-08 mobile Stripe regression: concurrent success, replay, and refund ordering are monotonic',
    { skip: !runDbIntegration },
    async () => {
        assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required when RUN_DB_INTEGRATION is enabled')
        const { default: prisma } = await import('@/lib/prisma')
        const {
            finalizeMobileRenewalPayment,
            persistMobileRenewalPaymentIntent,
        } = await import('../../src/lib/mobile-renewal-payment-finalization')

        const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const customer = await prisma.customer.create({
            data: {
                email: `mobile-stripe-${marker}@example.test`,
                name: 'Mobile Stripe CAS test',
                passwordHash: 'test-only',
            },
        })
        const cardNumber = `78${Date.now().toString().slice(-8)}`
        const operation = await prisma.operation.create({
            data: {
                customerId: customer.id,
                type: 'RENEW',
                cardNumber,
                amount: 209,
                status: 'AWAITING_FINAL_CONFIRM',
                selectedPackage: { name: 'Premium 12 Months', price: 174 },
                providerPaymentState: 'NOT_SUBMITTED',
                fulfillmentState: 'UNVERIFIED',
            },
        })
        const provider = {
            id: `pi_mobile_cas_${marker}`,
            status: 'succeeded',
            amount: 20_900,
            amountReceived: 20_900,
            currency: 'sar',
            metadata: {
                source: 'mobile_renewal',
                operationId: operation.id,
                customerId: customer.id,
                packageName: 'Premium 12 Months',
                beinPrice: '174',
                customerPrice: '209',
            },
        }
        const payment = await prisma.payment.create({
            data: {
                customerId: customer.id,
                stripePaymentIntentId: provider.id,
                amount: 209,
                currency: 'SAR',
                status: 'PENDING',
                type: 'SUBSCRIPTION',
                metadata: provider.metadata,
            },
        })

        let terminalOperationId: string | null = null
        try {
            const results = await Promise.all([
                prisma.$transaction((tx) => finalizeMobileRenewalPayment(tx, { provider })),
                prisma.$transaction((tx) => finalizeMobileRenewalPayment(tx, { provider })),
            ])

            assert.deepEqual(
                results.map(result => result.result).sort(),
                ['ALREADY_FINALIZED', 'FINALIZED']
            )
            assert.equal(await prisma.operationDispatch.count({
                where: { operationId: operation.id, jobType: 'CONFIRM_PURCHASE' },
            }), 1)

            await prisma.operation.update({
                where: { id: operation.id },
                data: { status: 'COMPLETED' },
            })
            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'REFUNDED' },
            })

            const staleSuccess = await prisma.$transaction((tx) =>
                finalizeMobileRenewalPayment(tx, { provider })
            )
            assert.equal(staleSuccess.result, 'TERMINAL_PAYMENT_IGNORED')
            const [storedOperation, storedPayment] = await Promise.all([
                prisma.operation.findUniqueOrThrow({ where: { id: operation.id } }),
                prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
            ])
            assert.equal(storedOperation.status, 'COMPLETED')
            assert.equal(storedPayment.status, 'REFUNDED')

            const terminalOperation = await prisma.operation.create({
                data: {
                    customerId: customer.id,
                    type: 'RENEW',
                    cardNumber: `${cardNumber}9`,
                    amount: 174,
                    status: 'CANCELLED',
                    selectedPackage: { name: 'Premium 12 Months', price: 174 },
                    providerPaymentState: 'NOT_SUBMITTED',
                    fulfillmentState: 'UNVERIFIED',
                },
            })
            terminalOperationId = terminalOperation.id
            const terminalProvider = {
                ...provider,
                id: `pi_mobile_terminal_${marker}`,
                status: 'requires_payment_method',
                amountReceived: 0,
                metadata: {
                    ...provider.metadata,
                    operationId: terminalOperation.id,
                },
            }
            const persistence = await prisma.$transaction((tx) =>
                persistMobileRenewalPaymentIntent(tx, {
                    provider: terminalProvider,
                    operationId: terminalOperation.id,
                    customerId: customer.id,
                    cardNumber: terminalOperation.cardNumber,
                    packageName: 'Premium 12 Months',
                    beinPrice: 174,
                    customerPrice: 209,
                    currency: 'SAR',
                })
            )
            assert.equal(persistence, 'RECORDED_REVIEW_REQUIRED')
            const terminalPayment = await prisma.payment.findUniqueOrThrow({
                where: { stripePaymentIntentId: terminalProvider.id },
            })
            assert.equal(terminalPayment.status, 'PENDING')
            assert.equal(
                (await prisma.operation.findUniqueOrThrow({ where: { id: terminalOperation.id } })).status,
                'REVIEW_REQUIRED'
            )

            const chargedAfterReview = await prisma.$transaction((tx) =>
                finalizeMobileRenewalPayment(tx, {
                    provider: {
                        ...terminalProvider,
                        status: 'succeeded',
                        amountReceived: terminalProvider.amount,
                    },
                })
            )
            assert.equal(chargedAfterReview.result, 'REVIEW_REQUIRED')
            assert.equal(chargedAfterReview.shouldDispatch, false)
            assert.equal(
                (await prisma.payment.findUniqueOrThrow({ where: { id: terminalPayment.id } })).status,
                'SUCCEEDED'
            )
            assert.equal(await prisma.operationDispatch.count({
                where: { operationId: terminalOperation.id, jobType: 'CONFIRM_PURCHASE' },
            }), 0)
        } finally {
            await prisma.operationDispatch.deleteMany({ where: { operationId: operation.id } })
            await prisma.cardLifecycleReservation.deleteMany({
                where: { operationId: { in: [operation.id, ...(terminalOperationId ? [terminalOperationId] : [])] } },
            })
            await prisma.payment.deleteMany({ where: { customerId: customer.id } })
            if (terminalOperationId) {
                await prisma.operation.deleteMany({ where: { id: terminalOperationId } })
            }
            await prisma.operation.deleteMany({ where: { id: operation.id } })
            await prisma.customer.deleteMany({ where: { id: customer.id } })
        }
    }
)
