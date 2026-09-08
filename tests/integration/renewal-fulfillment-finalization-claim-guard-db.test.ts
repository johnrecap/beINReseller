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
    : 'RELEASE_BLOCKER: claim-poisoning rollback suite requires an explicitly disposable PostgreSQL database before release'

type PrismaClient = Awaited<typeof import('@/lib/prisma')>['default']

async function createFixture(prisma: PrismaClient) {
    const suffix = `claim-guard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [user, account] = await Promise.all([
        prisma.user.create({
            data: {
                username: `${suffix}-user`,
                email: `${suffix}-user@example.test`,
                passwordHash: 'test',
                balance: 826,
            },
        }),
        prisma.beinAccount.create({
            data: {
                username: `${suffix}@bein.test`,
                password: 'test-only',
                automationExclusive: true,
            },
        }),
    ])
    return { user, account }
}

async function createGuardContext(
    prisma: PrismaClient,
    fixture: Awaited<ReturnType<typeof createFixture>>,
    label: string,
    input: {
        type?: 'RENEW' | 'CHECK_BALANCE'
        status?: 'PENDING' | 'COMPLETING'
        storedPaymentState?: 'CHARGED' | 'UNKNOWN'
        inputPaymentState?: 'CHARGED' | 'UNKNOWN'
        storedPackageName?: string
        reportObservedAt?: Date
    }
) {
    const invoiceNo = `53${Date.now()}${label}`
    const reportObservedAt = input.reportObservedAt ?? new Date('2026-08-23T15:41:05.000Z')
    const contractObservedAt = new Date('2026-08-23T15:41:10.000Z')
    const operation = await prisma.operation.create({
        data: {
            userId: fixture.user.id,
            beinAccountId: fixture.account.id,
            type: input.type ?? 'RENEW',
            cardNumber: `7517687${label.padStart(3, '0')}`,
            amount: 174,
            status: input.status ?? 'COMPLETING',
            selectedPackage: {
                name: input.storedPackageName ?? 'Premium 12 Months',
                price: '174.00',
            },
            providerPaymentState: input.storedPaymentState ?? 'CHARGED',
            fulfillmentState: 'VERIFYING',
            fulfillmentVerificationOutcome: 'MATCHED',
            fulfillmentAuthority: 'NONE',
            providerMutationStartedAt: new Date('2026-08-23T15:40:00.000Z'),
            providerMutationStage: 'FINAL_OK',
        },
    })
    await prisma.transaction.create({
        data: {
            userId: fixture.user.id,
            operationId: operation.id,
            type: 'OPERATION_DEDUCT',
            amount: -174,
            balanceAfter: 826,
            notes: 'claim guard test deduction',
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
            beinAccountId: fixture.account.id,
            cardNumberSnapshot: operation.cardNumber,
            baselineSequence: 1,
            sessionGeneration: '1',
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
    const attempt = await prisma.operationFulfillmentVerificationAttempt.create({
        data: {
            verificationId: verification.id,
            baselineId: baseline.id,
            attemptNo: 1,
            outcome: 'MATCHED',
            completeScan: true,
            pageCount: 1,
            rowCount: 1,
            candidateCount: 1,
            candidateInvoiceNo: invoiceNo,
            reportObservedAt,
            contractObservedAt,
            reasonCode: 'MATCHED_COMPOSITE_EVIDENCE',
        },
    })
    await Promise.all([
        prisma.cardLifecycleReservation.create({
            data: {
                operationId: operation.id,
                cardNumber: operation.cardNumber,
            },
        }),
        prisma.providerAccountCausalReservation.create({
            data: {
                operationId: operation.id,
                beinAccountId: fixture.account.id,
                reservationGeneration: 1,
                automaticWindowEndsAt: new Date(Date.now() + 10 * 60 * 1000),
            },
        }),
        prisma.beinAccountSpendLedger.create({
            data: {
                operationId: operation.id,
                userId: fixture.user.id,
                beinAccountId: fixture.account.id,
                operationType: operation.type,
                operationStatusAtRecord: operation.status,
                cardNumberSnapshot: operation.cardNumber,
                selectedPackageName: 'Premium 12 Months',
                selectedPackagePrice: 174,
                currency: 'USD',
                spendAmount: 174,
                evidenceSource: 'BALANCE_DELTA',
                evidenceConfidence: 'CONFIRMED_FINAL_PAY',
                beinUsernameSnapshot: fixture.account.username,
            },
        }),
    ])

    return {
        operation,
        providerPaymentState: input.inputPaymentState ?? 'CHARGED',
        verificationAttemptId: attempt.id,
        verificationAttemptNo: attempt.attemptNo,
        baselineId: baseline.id,
        reservationGeneration: 1,
        proofCandidate: {
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
            reportObservedAt,
            contractObservedAt,
            reportRowFingerprint: 'a'.repeat(64),
            providerAmount: '174.00',
            currency: 'USD',
            reportPackageName: 'Add Premium 12 Months',
            reportItemType: 'Card_CISCO',
            dealerContextHash: baseline.dealerContextHash,
        },
    }
}

test('invalid finalization context never persists an invoice claim or proof', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeAutomatedRenewalFulfillment }] = await Promise.all([
        import('@/lib/prisma'),
        import('../../worker/src/lib/fulfillment-finalization'),
    ])
    const fixtures: Awaited<ReturnType<typeof createFixture>>[] = []
    try {
        const cases: Parameters<typeof createGuardContext>[3][] = [
            { type: 'CHECK_BALANCE' }, { status: 'PENDING' },
            { storedPaymentState: 'CHARGED', inputPaymentState: 'UNKNOWN' },
            { storedPackageName: 'Premium 6 Months' }, { reportObservedAt: new Date('2026-08-23T15:39:30.000Z') },
        ]
        const contexts: Awaited<ReturnType<typeof createGuardContext>>[] = []
        for (const [index, input] of cases.entries()) {
            const fixture = await createFixture(prisma)
            fixtures.push(fixture)
            contexts.push(await createGuardContext(prisma, fixture, String(index + 101), input))
        }
        const operationIds = contexts.map(({ operation }) => operation.id)
        for (const context of contexts) {
            const result = await finalizeAutomatedRenewalFulfillment({
                operationId: context.operation.id,
                providerPaymentState: context.providerPaymentState,
                verificationOutcome: 'MATCHED',
                proofMode: 'ENFORCE',
                verificationAttemptId: context.verificationAttemptId,
                verificationAttemptNo: context.verificationAttemptNo,
                baselineId: context.baselineId,
                reservationGeneration: context.reservationGeneration,
                proofCandidate: context.proofCandidate,
            })
            assert.equal(result.status, 'PROOF_CONFLICT')
        }

        const [claims, proofs, awardRuns, completed] = await Promise.all([
            prisma.providerInvoiceClaim.count({ where: { operationId: { in: operationIds } } }),
            prisma.operationFulfillmentProof.count({ where: { operationId: { in: operationIds } } }),
            prisma.operationSpendAwardRun.count({ where: { operationId: { in: operationIds } } }),
            prisma.operation.count({ where: { id: { in: operationIds }, status: 'COMPLETED' } }),
        ])
        assert.equal(claims, 0)
        assert.equal(proofs, 0)
        assert.equal(awardRuns, 0)
        assert.equal(completed, 0)
    } finally {
        const userIds = fixtures.map(fixture => fixture.user.id)
        const operationIds = (await prisma.operation.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map(row => row.id)
        await prisma.pointLedgerEntry.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.operationCompletionEffect.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.operationSpendAwardRun.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.operationFulfillmentProof.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.providerInvoiceClaim.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.operationFulfillmentVerificationAttempt.deleteMany({
            where: { verification: { operationId: { in: operationIds } } },
        })
        await prisma.operationFulfillmentBaseline.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.operationFulfillmentVerification.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.beinAccountSpendLedger.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.transaction.deleteMany({ where: { operationId: { in: operationIds } } })
        await prisma.operation.deleteMany({ where: { id: { in: operationIds } } })
        await prisma.beinAccount.deleteMany({ where: { id: { in: fixtures.map(fixture => fixture.account.id) } } })
        await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    }
})
