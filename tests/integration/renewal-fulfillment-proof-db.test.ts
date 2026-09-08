import test from 'node:test'
import assert from 'node:assert/strict'

const runDbIntegration =
    process.env.RUN_DB_INTEGRATION === '1' ||
    process.env.RUN_DB_INTEGRATION === 'true' ||
    process.env.RUN_DB_INTEGRATION_TESTS === 'true'

function isDisposableDatabaseConfigured(): boolean {
    const rawUrl = process.env.DATABASE_URL
    if (!runDbIntegration || !rawUrl) return false
    if (process.env.CONFIRM_DISPOSABLE_RENEWAL_FULFILLMENT_DB === '1') return true

    try {
        const databaseName = decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, '')).toLowerCase()
        return /(^|[_-])(test|testing|ci|spec|disposable)([_-]|$)/.test(databaseName)
    } catch {
        return false
    }
}

const dbSkipReason = isDisposableDatabaseConfigured()
    ? false
    : 'RELEASE_BLOCKER: configure an explicitly disposable PostgreSQL DATABASE_URL and RUN_DB_INTEGRATION before release'

type PrismaClient = Awaited<typeof import('@/lib/prisma')>['default']

async function createFixture(prisma: PrismaClient, label: string, cardNumbers: string[]) {
    const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await prisma.user.create({
        data: { username: suffix, email: `${suffix}@example.test`, passwordHash: 'test' },
    })
    const account = await prisma.beinAccount.create({
        data: {
            username: `${suffix}@bein.test`,
            password: 'test-only',
            automationExclusive: true,
        },
    })
    const operations = []

    for (const cardNumber of cardNumbers) {
        const operation = await prisma.operation.create({
            data: {
                userId: user.id,
                beinAccountId: account.id,
                type: 'RENEW',
                cardNumber,
                amount: 174,
                status: 'COMPLETING',
                selectedPackage: {
                    name: 'Premium 12 Months',
                    providerName: 'Add Premium 12 Months',
                    duration: 12,
                    price: '174.00',
                },
                providerPaymentState: 'CHARGED',
                fulfillmentState: 'VERIFYING',
                fulfillmentVerificationOutcome: 'MATCHED',
                fulfillmentAuthority: 'NONE',
                providerMutationStartedAt: new Date('2026-08-23T15:40:00.000Z'),
                providerMutationStage: 'FINAL_OK',
            },
        })
        const verification = await prisma.operationFulfillmentVerification.create({
            data: {
                operationId: operation.id,
                state: 'VERIFYING',
                attemptCount: 1,
                lastOutcome: 'MATCHED',
            },
        })
        const baseline = await prisma.operationFulfillmentBaseline.create({
            data: {
                verificationId: verification.id,
                operationId: operation.id,
                beinAccountId: account.id,
                cardNumberSnapshot: cardNumber,
                baselineSequence: 1,
                sessionGeneration: `session-${operation.id}`,
                dealerContextHash: 'b'.repeat(64),
                invoiceSet: [],
                targetCardRows: [],
                pageCount: 1,
                rowCount: 0,
                firstPageWatermark: 'watermark-before-pay',
                scanAttemptCount: 1,
                capturedAt: new Date('2026-08-23T15:39:00.000Z'),
            },
        })
        await prisma.operationFulfillmentVerification.update({
            where: { id: verification.id },
            data: { activeBaselineId: baseline.id },
        })
        operations.push({ operation, verification, baseline })
    }

    return { user, account, operations }
}

function compositeCandidate(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    operationIndex: number,
    invoiceNo: string
) {
    const { operation, baseline } = fixture.operations[operationIndex]
    return {
        operationId: operation.id,
        beinAccountId: fixture.account.id,
        cardNumberSnapshot: operation.cardNumber,
        invoiceNo,
        proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION' as const,
        selectedPackageName: 'Premium 12 Months',
        contractPackageName: 'Premium 12 Months',
        contractStatus: 'Active',
        contractType: 'Renewal',
        contractStartDate: '23/08/2026',
        contractExpiryDate: '22/08/2027',
        verificationSource: 'POST_FINAL_PAY' as const,
        providerCheckedAt: new Date('2026-08-23T15:41:10.000Z'),
        baselineId: baseline.id,
        sessionGeneration: baseline.sessionGeneration,
        baselineCapturedAt: baseline.capturedAt,
        reportObservedAt: new Date('2026-08-23T15:41:05.000Z'),
        contractObservedAt: new Date('2026-08-23T15:41:10.000Z'),
        reportRowFingerprint: 'a'.repeat(64),
        providerAmount: '174.00',
        currency: 'USD',
        reportPackageName: 'Add Premium 12 Months',
        reportItemType: 'Card_CISCO',
        dealerContextHash: baseline.dealerContextHash,
    }
}

async function cleanupFixture(prisma: PrismaClient, fixture: Awaited<ReturnType<typeof createFixture>>) {
    const operationIds = fixture.operations.map(({ operation }) => operation.id)
    await prisma.operationFulfillmentProof.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operationManualFulfillmentEvidence.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.providerInvoiceClaim.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operationFulfillmentVerificationAttempt.deleteMany({
        where: { verification: { operationId: { in: operationIds } } },
    })
    await prisma.operationFulfillmentBaseline.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operationFulfillmentVerification.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operation.deleteMany({ where: { id: { in: operationIds } } })
    await prisma.beinAccount.delete({ where: { id: fixture.account.id } })
    await prisma.user.delete({ where: { id: fixture.user.id } })
}

test('database permits only one automated operation to claim an account invoice concurrently', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { claimOperationFulfillmentProof }] = await Promise.all([
        import('@/lib/prisma'),
        import('../../worker/src/lib/fulfillment-proof'),
    ])
    const fixture = await createFixture(prisma, 'automated-claim-race', ['7517687161', '7517687162'])
    const invoiceNo = `0053${Date.now()}`

    try {
        const claims = await Promise.all(fixture.operations.map((_, index) =>
            claimOperationFulfillmentProof(compositeCandidate(fixture, index, invoiceNo))))

        assert.equal(claims.filter((claim) => claim.status === 'CLAIMED').length, 1)
        assert.equal(claims.filter((claim) => claim.status === 'INVOICE_ALREADY_USED').length, 1)
        assert.equal(await prisma.operationFulfillmentProof.count({ where: { invoiceNo } }), 1)
        assert.equal(await prisma.providerInvoiceClaim.count({
            where: { beinAccountId: fixture.account.id, invoiceNo },
        }), 1)
    } finally {
        await cleanupFixture(prisma, fixture)
    }
})

test('blank invoice is rejected while a leading-zero invoice is stored byte-for-byte', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { claimOperationFulfillmentProof }] = await Promise.all([
        import('@/lib/prisma'),
        import('../../worker/src/lib/fulfillment-proof'),
    ])
    const fixture = await createFixture(prisma, 'invoice-normalization', ['7517687171'])

    try {
        assert.deepEqual(await claimOperationFulfillmentProof(
            compositeCandidate(fixture, 0, '   ')
        ), { status: 'INVALID_INVOICE' })

        const invoiceNo = `000${Date.now()}`
        const claim = await claimOperationFulfillmentProof(compositeCandidate(fixture, 0, `  ${invoiceNo}  `))
        assert.equal(claim.status, 'CLAIMED')

        const stored = await prisma.providerInvoiceClaim.findUniqueOrThrow({
            where: {
                beinAccountId_invoiceNo: {
                    beinAccountId: fixture.account.id,
                    invoiceNo,
                },
            },
            select: { invoiceNo: true },
        })
        assert.equal(stored.invoiceNo, invoiceNo)
    } finally {
        await cleanupFixture(prisma, fixture)
    }
})

test('database rejects a composite proof with incomplete report correlation metadata', { skip: dbSkipReason }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const fixture = await createFixture(prisma, 'composite-check', ['7517687181'])
    const invoiceNo = `0054${Date.now()}`

    try {
        const invoiceClaim = await prisma.providerInvoiceClaim.create({
            data: {
                operationId: fixture.operations[0].operation.id,
                beinAccountId: fixture.account.id,
                invoiceNo,
                claimKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
            },
        })

        await assert.rejects(prisma.operationFulfillmentProof.create({
            data: {
                operationId: fixture.operations[0].operation.id,
                beinAccountId: fixture.account.id,
                invoiceClaimId: invoiceClaim.id,
                cardNumberSnapshot: fixture.operations[0].operation.cardNumber,
                invoiceNo,
                proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
                selectedPackageName: 'Premium 12 Months',
                contractPackageName: 'Premium 12 Months',
                contractStatus: 'Active',
                verificationSource: 'POST_FINAL_PAY',
                providerCheckedAt: new Date(),
                baselineId: null,
                sessionGeneration: null,
                baselineCapturedAt: null,
                reportObservedAt: null,
                contractObservedAt: null,
                reportRowFingerprint: null,
                providerAmount: null,
                currency: null,
                reportPackageName: null,
                reportItemType: null,
                dealerContextHash: null,
            },
        }))
    } finally {
        await cleanupFixture(prisma, fixture)
    }
})

test('shared invoice registry gives automated-versus-manual claims exactly one winner', { skip: dbSkipReason }, async () => {
    const { default: prisma } = await import('@/lib/prisma')
    const fixture = await createFixture(prisma, 'cross-kind-claim-race', ['7517687191', '7517687192'])
    const invoiceNo = `0055${Date.now()}`

    try {
        const results = await Promise.allSettled([
            prisma.providerInvoiceClaim.create({
                data: {
                    operationId: fixture.operations[0].operation.id,
                    beinAccountId: fixture.account.id,
                    invoiceNo,
                    claimKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
                },
            }),
            prisma.providerInvoiceClaim.create({
                data: {
                    operationId: fixture.operations[1].operation.id,
                    beinAccountId: fixture.account.id,
                    invoiceNo,
                    claimKind: 'MANUAL_PROVIDER_CONFIRMATION',
                },
            }),
        ])

        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
        assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
        assert.equal(await prisma.providerInvoiceClaim.count({
            where: { beinAccountId: fixture.account.id, invoiceNo },
        }), 1)
    } finally {
        await cleanupFixture(prisma, fixture)
    }
})
