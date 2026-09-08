import test from 'node:test'
import assert from 'node:assert/strict'
import { deliverCompletionEffects } from '../../shared/operations/completion-effects'

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
    : 'RELEASE_BLOCKER: finalization/refund race suite requires an explicitly disposable PostgreSQL database before release'

type PrismaClient = Awaited<typeof import('@/lib/prisma')>['default']

async function createUsersAndAccount(prisma: PrismaClient, label: string) {
    const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [user, admin, account] = await Promise.all([
        prisma.user.create({
            data: {
                username: `${suffix}-user`,
                email: `${suffix}-user@example.test`,
                passwordHash: 'test',
                balance: 826,
            },
        }),
        prisma.user.create({
            data: {
                username: `${suffix}-admin`,
                email: `${suffix}-admin@example.test`,
                passwordHash: 'test',
                role: 'ADMIN',
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
    return { user, admin, account }
}

async function createOperation(
    prisma: PrismaClient,
    fixture: Awaited<ReturnType<typeof createUsersAndAccount>>,
    cardNumber: string,
    status: 'COMPLETING' | 'REVIEW_REQUIRED'
) {
    const operation = await prisma.operation.create({
        data: {
            userId: fixture.user.id,
            beinAccountId: fixture.account.id,
            type: 'RENEW',
            cardNumber,
            amount: 174,
            status,
            selectedPackage: {
                name: 'Premium 12 Months',
                providerName: 'Add Premium 12 Months',
                duration: 12,
                price: '174.00',
            },
            responseData: {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                outcomeCategory: 'CONFIRMED_SUCCESS',
                providerPaymentState: 'CHARGED',
                fulfillmentState: status === 'COMPLETING' ? 'VERIFYING' : 'NOT_FOUND',
            },
            providerPaymentState: 'CHARGED',
            fulfillmentState: status === 'COMPLETING' ? 'VERIFYING' : 'NOT_FOUND',
            fulfillmentVerificationOutcome: status === 'COMPLETING' ? 'MATCHED' : 'REPORT_ONLY',
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
            notes: 'test deduction',
        },
    })
    return operation
}

async function createCompositeContext(
    prisma: PrismaClient,
    fixture: Awaited<ReturnType<typeof createUsersAndAccount>>,
    operation: Awaited<ReturnType<typeof createOperation>>,
    invoiceNo: string,
    sessionGeneration = '1'
) {
    const reportObservedAt = new Date('2026-08-23T15:41:05.000Z')
    const contractObservedAt = new Date('2026-08-23T15:41:10.000Z')
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
            sessionGeneration,
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
    await prisma.beinAccountSpendLedger.create({
        data: {
            operationId: operation.id,
            userId: fixture.user.id,
            beinAccountId: fixture.account.id,
            operationType: 'RENEW',
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
    })

    return {
        verificationAttemptId: attempt.id,
        verificationAttemptNo: attempt.attemptNo,
        reservationGeneration: Number(sessionGeneration),
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
    }
}

async function createCausalReservations(
    prisma: PrismaClient,
    fixture: Awaited<ReturnType<typeof createUsersAndAccount>>,
    operation: Awaited<ReturnType<typeof createOperation>>,
    options: {
        reservationGeneration?: number
        releasedReservation?: 'CARD' | 'PROVIDER'
    } = {}
) {
    const releasedAt = new Date('2026-08-23T15:40:30.000Z')
    await prisma.cardLifecycleReservation.create({
        data: {
            operationId: operation.id,
            cardNumber: operation.cardNumber,
            releasedAt: options.releasedReservation === 'CARD' ? releasedAt : null,
            releaseReason: options.releasedReservation === 'CARD' ? 'TEST_RELEASED' : null,
        },
    })
    await prisma.providerAccountCausalReservation.create({
        data: {
            operationId: operation.id,
            beinAccountId: fixture.account.id,
            reservationGeneration: options.reservationGeneration ?? 1,
            automaticWindowEndsAt: new Date(Date.now() + 10 * 60 * 1000),
            releasedAt: options.releasedReservation === 'PROVIDER' ? releasedAt : null,
            releaseReason: options.releasedReservation === 'PROVIDER' ? 'TEST_RELEASED' : null,
        },
    })
}

function manualEvidence(
    fixture: Awaited<ReturnType<typeof createUsersAndAccount>>,
    operation: Awaited<ReturnType<typeof createOperation>>,
    invoiceNo: string
) {
    return {
        beinAccountId: fixture.account.id,
        invoiceNo,
        cardNumberSnapshot: operation.cardNumber,
        packageNameSnapshot: 'Premium 12 Months',
        providerAmount: '174.00',
        currency: 'USD',
        evidenceSource: 'sold_report_invoice_detail',
        evidenceNote: 'Verified against the provider invoice detail page.',
        observedAt: new Date('2026-08-23T15:45:00.000Z'),
        actorUserId: fixture.admin.id,
    }
}

async function createOpenFulfillmentIssue(
    prisma: PrismaClient,
    fixture: Awaited<ReturnType<typeof createUsersAndAccount>>,
    operation: Awaited<ReturnType<typeof createOperation>>
) {
    return prisma.operationIntegrityIssue.create({
        data: {
            operationId: operation.id,
            userId: fixture.user.id,
            beinAccountId: fixture.account.id,
            issueType: 'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
            severity: 'HIGH',
            status: 'OPEN',
            operationAmount: operation.amount,
        },
    })
}

async function cleanup(
    prisma: PrismaClient,
    fixture: Awaited<ReturnType<typeof createUsersAndAccount>>,
    operationIds: string[]
) {
    await prisma.notification.deleteMany({ where: { userId: fixture.user.id } })
    await prisma.activityLog.deleteMany({ where: { userId: fixture.user.id } })
    await prisma.pointLedgerEntry.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operationCompletionEffect.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operationSpendAwardRun.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operationFulfillmentProof.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operationManualFulfillmentEvidence.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.providerInvoiceClaim.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operationFulfillmentVerificationAttempt.deleteMany({
        where: { verification: { operationId: { in: operationIds } } },
    })
    await prisma.operationFulfillmentBaseline.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operationFulfillmentVerification.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.beinAccountSpendLedger.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.transaction.deleteMany({ where: { operationId: { in: operationIds } } })
    await prisma.operation.deleteMany({ where: { id: { in: operationIds } } })
    await prisma.beinAccount.delete({ where: { id: fixture.account.id } })
    await prisma.user.deleteMany({ where: { id: { in: [fixture.user.id, fixture.admin.id] } } })
}

test('automated proof finalization and reseller refund race cannot both commit', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeAutomatedRenewalFulfillment }, { refundUser }] = await Promise.all([
        import('@/lib/prisma'),
        import('../../worker/src/lib/fulfillment-finalization'),
        import('@/lib/refund'),
    ])
    const fixture = await createUsersAndAccount(prisma, 'proof-refund-race')
    const operation = await createOperation(prisma, fixture, '7517687201', 'COMPLETING')
    await createCausalReservations(prisma, fixture, operation)
    const proofCandidate = await createCompositeContext(
        prisma,
        fixture,
        operation,
        `0056${Date.now()}`
    )
    await createOpenFulfillmentIssue(prisma, fixture, operation)

    try {
        const [completion, refundApplied] = await Promise.all([
            finalizeAutomatedRenewalFulfillment({
                operationId: operation.id,
                providerPaymentState: 'CHARGED',
                verificationOutcome: 'MATCHED',
                proofMode: 'ENFORCE',
                verificationAttemptId: proofCandidate.verificationAttemptId,
                verificationAttemptNo: proofCandidate.verificationAttemptNo,
                baselineId: proofCandidate.baselineId,
                reservationGeneration: proofCandidate.reservationGeneration,
                proofCandidate,
            }),
            refundUser(operation.id, fixture.user.id, 174, 'concurrent cleanup'),
        ])

        const [stored, proofCount, refundCount, issue] = await Promise.all([
            prisma.operation.findUniqueOrThrow({ where: { id: operation.id } }),
            prisma.operationFulfillmentProof.count({ where: { operationId: operation.id } }),
            prisma.transaction.count({ where: { operationId: operation.id, type: 'REFUND' } }),
            prisma.operationIntegrityIssue.findUniqueOrThrow({
                where: {
                    operationId_issueType: {
                        operationId: operation.id,
                        issueType: 'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
                    },
                },
            }),
        ])
        assert.equal(completion.status, 'COMPLETED')
        assert.equal(refundApplied, false)
        assert.equal(stored.status, 'COMPLETED')
        assert.equal(proofCount, 1)
        assert.equal(refundCount, 0)
        assert.equal(issue.status, 'RESOLVED')
    } finally {
        await cleanup(prisma, fixture, [operation.id])
    }
})

test('automated finalization without causal reservations cannot claim an invoice or complete', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeAutomatedRenewalFulfillment }] = await Promise.all([
        import('@/lib/prisma'),
        import('../../worker/src/lib/fulfillment-finalization'),
    ])
    const fixture = await createUsersAndAccount(prisma, 'missing-causal-reservations')
    const operation = await createOperation(prisma, fixture, '7517687202', 'COMPLETING')
    const proofCandidate = await createCompositeContext(
        prisma,
        fixture,
        operation,
        `0056${Date.now()}`
    )

    try {
        const result = await finalizeAutomatedRenewalFulfillment({
            operationId: operation.id,
            providerPaymentState: 'CHARGED',
            verificationOutcome: 'MATCHED',
            proofMode: 'ENFORCE',
            verificationAttemptId: proofCandidate.verificationAttemptId,
            verificationAttemptNo: proofCandidate.verificationAttemptNo,
            baselineId: proofCandidate.baselineId,
            reservationGeneration: proofCandidate.reservationGeneration,
            proofCandidate,
        })

        assert.equal(result.status, 'PROOF_CONFLICT')
        assert.equal(await prisma.providerInvoiceClaim.count({ where: { operationId: operation.id } }), 0)
        assert.equal(await prisma.operationFulfillmentProof.count({ where: { operationId: operation.id } }), 0)
        assert.equal((await prisma.operation.findUniqueOrThrow({ where: { id: operation.id } })).status, 'COMPLETING')
    } finally {
        await cleanup(prisma, fixture, [operation.id])
    }
})

test('released reservations and mismatched generations fail closed before invoice claim', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeAutomatedRenewalFulfillment }] = await Promise.all([
        import('@/lib/prisma'),
        import('../../worker/src/lib/fulfillment-finalization'),
    ])
    const scenarios = [
        { label: 'released-card', releasedReservation: 'CARD' as const, reservationGeneration: 1 },
        { label: 'released-provider', releasedReservation: 'PROVIDER' as const, reservationGeneration: 1 },
        { label: 'generation-mismatch', reservationGeneration: 2 },
    ]

    for (const [index, scenario] of scenarios.entries()) {
        const fixture = await createUsersAndAccount(prisma, scenario.label)
        const operation = await createOperation(
            prisma,
            fixture,
            `75176872${10 + index}`,
            'COMPLETING'
        )
        await createCausalReservations(prisma, fixture, operation, scenario)
        const proofCandidate = await createCompositeContext(
            prisma,
            fixture,
            operation,
            `0056${Date.now()}${index}`,
            '1'
        )

        try {
            const result = await finalizeAutomatedRenewalFulfillment({
                operationId: operation.id,
                providerPaymentState: 'CHARGED',
                verificationOutcome: 'MATCHED',
                proofMode: 'ENFORCE',
                verificationAttemptId: proofCandidate.verificationAttemptId,
                verificationAttemptNo: proofCandidate.verificationAttemptNo,
                baselineId: proofCandidate.baselineId,
                reservationGeneration: proofCandidate.reservationGeneration,
                proofCandidate,
            })

            assert.equal(result.status, 'PROOF_CONFLICT', scenario.label)
            assert.equal(await prisma.providerInvoiceClaim.count({ where: { operationId: operation.id } }), 0)
            assert.equal(await prisma.operationFulfillmentProof.count({ where: { operationId: operation.id } }), 0)
            assert.equal((await prisma.operation.findUniqueOrThrow({ where: { id: operation.id } })).status, 'COMPLETING')
        } finally {
            await cleanup(prisma, fixture, [operation.id])
        }
    }
})

test('a newer persisted verification attempt blocks an older matched attempt from claiming proof', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeAutomatedRenewalFulfillment }] = await Promise.all([
        import('@/lib/prisma'),
        import('../../worker/src/lib/fulfillment-finalization'),
    ])
    const fixture = await createUsersAndAccount(prisma, 'stale-matched-attempt')
    const operation = await createOperation(prisma, fixture, '7517687231', 'COMPLETING')
    await createCausalReservations(prisma, fixture, operation)
    const proofCandidate = await createCompositeContext(
        prisma,
        fixture,
        operation,
        `0059${Date.now()}`
    )

    try {
        const verification = await prisma.operationFulfillmentVerification.findUniqueOrThrow({
            where: { operationId: operation.id },
        })
        await prisma.operationFulfillmentVerificationAttempt.create({
            data: {
                verificationId: verification.id,
                baselineId: proofCandidate.baselineId,
                attemptNo: 2,
                outcome: 'VALID_NO_MATCH',
                completeScan: true,
                pageCount: 1,
                rowCount: 0,
                candidateCount: 0,
                candidateInvoiceNo: null,
                reportObservedAt: new Date('2026-08-23T15:42:05.000Z'),
                contractObservedAt: new Date('2026-08-23T15:42:10.000Z'),
                reasonCode: 'NO_NEW_MATCHING_INVOICE',
                retryDueAt: new Date(Date.now() + 5_000),
            },
        })
        await prisma.operationFulfillmentVerification.update({
            where: { id: verification.id },
            data: {
                state: 'VERIFYING',
                attemptCount: 2,
                lastOutcome: 'VALID_NO_MATCH',
            },
        })

        const result = await finalizeAutomatedRenewalFulfillment({
            operationId: operation.id,
            providerPaymentState: 'CHARGED',
            verificationOutcome: 'MATCHED',
            proofMode: 'ENFORCE',
            verificationAttemptId: proofCandidate.verificationAttemptId,
            verificationAttemptNo: proofCandidate.verificationAttemptNo,
            baselineId: proofCandidate.baselineId,
            reservationGeneration: proofCandidate.reservationGeneration,
            proofCandidate,
        })

        assert.equal(result.status, 'PROOF_CONFLICT')
        assert.equal(await prisma.providerInvoiceClaim.count({ where: { operationId: operation.id } }), 0)
        assert.equal(await prisma.operationFulfillmentProof.count({ where: { operationId: operation.id } }), 0)
    } finally {
        await cleanup(prisma, fixture, [operation.id])
    }
})

test('charged finalization rejects a spend ledger owned by another provider account', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeAutomatedRenewalFulfillment }] = await Promise.all([
        import('@/lib/prisma'),
        import('../../worker/src/lib/fulfillment-finalization'),
    ])
    const fixture = await createUsersAndAccount(prisma, 'charged-ledger-account')
    const operation = await createOperation(prisma, fixture, '7517687232', 'COMPLETING')
    await createCausalReservations(prisma, fixture, operation)
    const proofCandidate = await createCompositeContext(
        prisma,
        fixture,
        operation,
        `0060${Date.now()}`
    )
    const conflictingAccount = await prisma.beinAccount.create({
        data: {
            username: `ledger-conflict-${Date.now()}@bein.test`,
            password: 'test-only',
            automationExclusive: true,
        },
    })

    try {
        await prisma.beinAccountSpendLedger.update({
            where: { operationId: operation.id },
            data: { beinAccountId: conflictingAccount.id },
        })
        const result = await finalizeAutomatedRenewalFulfillment({
            operationId: operation.id,
            providerPaymentState: 'CHARGED',
            verificationOutcome: 'MATCHED',
            proofMode: 'ENFORCE',
            verificationAttemptId: proofCandidate.verificationAttemptId,
            verificationAttemptNo: proofCandidate.verificationAttemptNo,
            baselineId: proofCandidate.baselineId,
            reservationGeneration: proofCandidate.reservationGeneration,
            proofCandidate,
        })

        assert.equal(result.status, 'PROOF_CONFLICT')
        assert.equal(await prisma.providerInvoiceClaim.count({ where: { operationId: operation.id } }), 0)
        assert.equal(await prisma.operationFulfillmentProof.count({ where: { operationId: operation.id } }), 0)
    } finally {
        await cleanup(prisma, fixture, [operation.id])
        await prisma.beinAccount.delete({ where: { id: conflictingAccount.id } })
    }
})

for (const ownerKind of ['reseller', 'customer'] as const) test(`exact ${ownerKind} automated completion replay returns the existing proof without duplicate side effects`, { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeAutomatedRenewalFulfillment }] = await Promise.all([
        import('@/lib/prisma'),
        import('../../worker/src/lib/fulfillment-finalization'),
    ])
    const fixture = await createUsersAndAccount(prisma, 'automated-idempotency')
    const operation = await createOperation(prisma, fixture, '7517687233', 'COMPLETING')
    const customer = ownerKind === 'customer' ? await prisma.customer.create({ data: {
        email: `${operation.id}@example.test`, name: 'Synthetic customer', passwordHash: 'SYNTHETIC',
    } }) : null
    if (customer) {
        await prisma.operation.update({ where: { id: operation.id }, data: { userId: null, customerId: customer.id } })
        await prisma.transaction.deleteMany({ where: { operationId: operation.id } })
    }
    await createCausalReservations(prisma, fixture, operation)
    const proofCandidate = await createCompositeContext(
        prisma,
        fixture,
        operation,
        `0061${Date.now()}`
    )
    if (customer) {
        await prisma.beinAccountSpendLedger.deleteMany({ where: { operationId: operation.id } })
        const { recordConfirmedBeinSpend } = await import('../../worker/src/lib/bein-spend-ledger')
        assert.equal((await recordConfirmedBeinSpend({ operationId: operation.id, beinAccountId: fixture.account.id,
            dealerBalanceBefore: 1000, dealerBalanceAfter: 826, evidenceSource: 'BALANCE_DELTA' })).status, 'created')
    }
    const finalizationInput = {
        operationId: operation.id,
        providerPaymentState: 'CHARGED' as const,
        verificationOutcome: 'MATCHED' as const,
        proofMode: 'ENFORCE' as const,
        verificationAttemptId: proofCandidate.verificationAttemptId,
        verificationAttemptNo: proofCandidate.verificationAttemptNo,
        baselineId: proofCandidate.baselineId,
        reservationGeneration: proofCandidate.reservationGeneration,
        proofCandidate,
    }

    try {
        const first = await finalizeAutomatedRenewalFulfillment(finalizationInput)
        const replay = await finalizeAutomatedRenewalFulfillment(finalizationInput)

        assert.equal(first.status, 'COMPLETED')
        assert.equal(replay.status, 'ALREADY_COMPLETED')
        assert.equal(replay.proofId, first.proofId)
        assert.equal(await prisma.providerInvoiceClaim.count({ where: { operationId: operation.id } }), 1)
        assert.equal(await prisma.operationFulfillmentProof.count({ where: { operationId: operation.id } }), 1)
        assert.equal(await prisma.operationSpendAwardRun.count({ where: { operationId: operation.id } }), 1)
        if (customer) {
            assert.equal(await prisma.pointLedgerEntry.count({ where: { operationId: operation.id } }), 0)
            assert.equal((await prisma.operationSpendAwardRun.findUniqueOrThrow({ where: { operationId: operation.id } })).status, 'SKIPPED')
        } else {
            assert.equal(await prisma.operationCompletionEffect.count({ where: { operationId: operation.id } }), 3)
            assert.equal(await prisma.notification.count({ where: { userId: fixture.user.id } }), 0)
            await Promise.all([deliverCompletionEffects(prisma, { operationId: operation.id }), deliverCompletionEffects(prisma, { operationId: operation.id })])
            await deliverCompletionEffects(prisma, { operationId: operation.id })
            assert.equal(await prisma.notification.count({ where: { userId: fixture.user.id } }), 1)
            assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: fixture.user.id } })).totalOperations, 1)
            assert.equal((await prisma.beinAccount.findUniqueOrThrow({ where: { id: fixture.account.id } })).usageCount, 1)
            assert.equal(await prisma.activityLog.count({ where: { userId: fixture.user.id } }), 1)
        }
    } finally {
        await cleanup(prisma, fixture, [operation.id])
        if (customer) await prisma.customer.delete({ where: { id: customer.id } })
    }
})

test('manual completion is idempotent and records one evidence, claim, award run, and safety resolution', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeManualRenewalFulfillment }] = await Promise.all([
        import('@/lib/prisma'),
        import('@/lib/operations/manual-fulfillment-finalization'),
    ])
    const fixture = await createUsersAndAccount(prisma, 'manual-idempotency')
    const operation = await createOperation(prisma, fixture, '7517687211', 'REVIEW_REQUIRED')
    const evidence = manualEvidence(fixture, operation, `0057${Date.now()}`)
    await createOpenFulfillmentIssue(prisma, fixture, operation)
    const finalizationInput = {
        operationId: operation.id,
        providerPaymentState: 'CHARGED' as const,
        evidence,
        decisionNote: 'Provider invoice manually confirmed.',
        actorUsername: fixture.admin.username,
    }

    try {
        const first = await finalizeManualRenewalFulfillment(finalizationInput)
        const replay = await finalizeManualRenewalFulfillment(finalizationInput)

        assert.equal(first.status, 'COMPLETED')
        assert.equal(replay.status, 'ALREADY_COMPLETED')
        assert.equal(await prisma.operationManualFulfillmentEvidence.count({ where: { operationId: operation.id } }), 1)
        assert.equal(await prisma.providerInvoiceClaim.count({ where: { operationId: operation.id } }), 1)
        assert.equal(await prisma.operationFulfillmentProof.count({ where: { operationId: operation.id } }), 0)
        assert.equal(await prisma.operationSpendAwardRun.count({ where: { operationId: operation.id } }), 1)
        assert.equal(await prisma.notification.count({ where: { userId: fixture.user.id } }), 0)

        const stored = await prisma.operation.findUniqueOrThrow({ where: { id: operation.id } })
        const issue = await prisma.operationIntegrityIssue.findUniqueOrThrow({
            where: {
                operationId_issueType: {
                    operationId: operation.id,
                    issueType: 'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
                },
            },
        })
        assert.equal(stored.status, 'COMPLETED')
        assert.equal(stored.fulfillmentState, 'VERIFIED')
        assert.equal(stored.fulfillmentAuthority, 'MANUAL_PROVIDER_CONFIRMATION')
        assert.equal(issue.status, 'RESOLVED')
    } finally {
        await cleanup(prisma, fixture, [operation.id])
    }
})

test('manual invoice conflict rolls back evidence, completion, award capture, and success notification', { skip: dbSkipReason }, async () => {
    const [{ default: prisma }, { finalizeManualRenewalFulfillment }] = await Promise.all([
        import('@/lib/prisma'),
        import('@/lib/operations/manual-fulfillment-finalization'),
    ])
    const fixture = await createUsersAndAccount(prisma, 'manual-conflict-rollback')
    const ownerOperation = await createOperation(prisma, fixture, '7517687221', 'REVIEW_REQUIRED')
    const targetOperation = await createOperation(prisma, fixture, '7517687222', 'REVIEW_REQUIRED')
    const invoiceNo = `0058${Date.now()}`
    await prisma.providerInvoiceClaim.create({
        data: {
            operationId: ownerOperation.id,
            beinAccountId: fixture.account.id,
            invoiceNo,
            claimKind: 'MANUAL_PROVIDER_CONFIRMATION',
        },
    })

    try {
        const result = await finalizeManualRenewalFulfillment({
            operationId: targetOperation.id,
            providerPaymentState: 'CHARGED',
            evidence: manualEvidence(fixture, targetOperation, invoiceNo),
            decisionNote: 'Provider invoice manually confirmed.',
            actorUsername: fixture.admin.username,
        })

        assert.equal(result.status, 'PROOF_CONFLICT')
        assert.equal(await prisma.operationManualFulfillmentEvidence.count({
            where: { operationId: targetOperation.id },
        }), 0)
        assert.equal(await prisma.operationSpendAwardRun.count({ where: { operationId: targetOperation.id } }), 0)
        assert.equal(await prisma.notification.count({ where: { userId: fixture.user.id } }), 0)

        const stored = await prisma.operation.findUniqueOrThrow({ where: { id: targetOperation.id } })
        assert.equal(stored.status, 'REVIEW_REQUIRED')
        assert.notEqual(stored.fulfillmentAuthority, 'MANUAL_PROVIDER_CONFIRMATION')
    } finally {
        await cleanup(prisma, fixture, [ownerOperation.id, targetOperation.id])
    }
})
