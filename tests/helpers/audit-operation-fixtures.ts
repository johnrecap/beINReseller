import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { RenewalProviderRefund } from '../../src/lib/renewal-payment-refund-finalization'
import { isAuditDisposableDatabaseConfigured } from './disposable-database'

export const auditFixtureCases = [
    'reseller', 'customer', 'installment', 'legacy', 'mixed', 'credit-only',
    'wallet', 'null-evidence', 'active-refund', 'stale-baseline', 'old-dispatch',
] as const
export type AuditFixtureKind = typeof auditFixtureCases[number]
export const auditDatabaseSkipReason = isAuditDisposableDatabaseConfigured()
    ? false : 'NOT_VERIFIED: audit 036 requires an explicitly confirmed local disposable PostgreSQL target'

export async function withAuditOperationFixture(
    kind: AuditFixtureKind, run: (fixture: AuditOperationFixture) => Promise<void>,
): Promise<void> {
    // Must precede ALL runtime database imports, client creation and queries.
    if (!isAuditDisposableDatabaseConfigured()) throw new Error('AUDIT_DISPOSABLE_DATABASE_REQUIRED')
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
        import('@prisma/client'), import('@prisma/adapter-pg'),
    ])
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
    const f = new AuditOperationFixture(db, kind)
    let created = false
    try {
        await f.create()
        created = true
        await run(f)
    } finally {
        try { if (created) await f.cleanup() } finally { await db.$disconnect() }
    }
}

export class AuditOperationFixture {
    readonly marker = 'audit036-' + randomUUID()
    readonly userId = this.marker + '-user'
    readonly customerId = this.marker + '-customer'
    readonly accountId = this.marker + '-account'
    readonly operationId = this.marker + '-operation'
    readonly paymentId = this.marker + '-payment'
    readonly subscriptionId = this.marker + '-subscription'
    readonly paymentIntentId = 'pi_synthetic_' + this.marker
    readonly cardNumber = '71' + BigInt('0x' + randomUUID().replaceAll('-', '').slice(0, 11)).toString().padStart(14, '0')
    readonly now = new Date('2026-09-07T00:00:00Z')
    constructor(readonly db: PrismaClient, readonly kind: AuditFixtureKind) {}
    get reseller() { return this.kind === 'reseller' || this.kind === 'installment' }
    get creditMinor() { return this.kind === 'credit-only' ? 20900 : this.kind === 'mixed' || this.kind === 'active-refund' ? 900 : 0 }
    get externalMinor() { return this.kind === 'credit-only' || this.kind === 'wallet' || this.reseller ? 0 : 20900 - this.creditMinor }
    get walletMinor() { return this.kind === 'wallet' ? 20900 : 0 }

    spendData() {
        return {
            operationId: this.operationId, userId: this.reseller ? this.userId : null,
            customerId: this.reseller ? null : this.customerId, beinAccountId: this.accountId,
            operationType: 'RENEW' as const, operationStatusAtRecord: 'REVIEW_REQUIRED' as const,
            cardNumberSnapshot: this.cardNumber, currency: 'USD', spendAmount: 174,
            evidenceSource: 'SYNTHETIC_AUDIT_036', beinUsernameSnapshot: this.marker + '@example.test',
        }
    }
    settlementData() {
        return {
            operationId: this.operationId, subscriptionId: this.reseller || this.kind === 'wallet' ? null : this.subscriptionId,
            paymentId: this.externalMinor ? this.paymentId : null,
            source: this.reseller ? 'reseller' : this.kind === 'wallet' ? 'mobile_renewal' : 'store_renewal',
            userId: this.reseller ? this.userId : null, customerId: this.reseller ? null : this.customerId,
            currency: 'SAR', originalExternalMinor: this.externalMinor, originalStoreCreditMinor: this.creditMinor,
            originalWalletMinor: this.walletMinor, requestedExternalMinor: this.externalMinor,
            requestedStoreCreditMinor: this.creditMinor, requestedWalletMinor: this.walletMinor,
            actorId: this.userId, decisionNote: 'Synthetic fixture only; no provider request.',
            commandKey: this.marker + '-command', payloadFingerprint: 'synthetic-fixed-payload-v1',
        }
    }
    refundInput(): RenewalProviderRefund {
        return {
            charge: { id: 'ch_synthetic_' + this.marker, paymentIntentId: this.paymentIntentId,
                amount: this.externalMinor, amountRefunded: this.externalMinor, currency: 'sar', refunded: true },
            paymentIntent: { id: this.paymentIntentId, status: 'succeeded', amount: this.externalMinor,
                amountReceived: this.externalMinor, currency: 'sar', metadata: {
                    source: 'store_renewal', operationId: this.operationId, subscriptionId: this.subscriptionId,
                    customerId: this.customerId, packageIndex: '3', packageName: 'Synthetic package',
                    beinPrice: '174', customerPrice: '209', creditUsed: String(this.creditMinor / 100),
                } },
        }
    }

    async create() {
        // Atomic setup: failure cannot leave a partly seeded fixture.
        await this.db.$transaction(async tx => {
            await tx.user.create({ data: { id: this.userId, username: this.marker,
                email: this.marker + '-user@example.test', passwordHash: 'SYNTHETIC_NOT_A_CREDENTIAL', role: 'ADMIN' } })
            await tx.customer.create({ data: { id: this.customerId, email: this.marker + '@example.test',
                name: 'Synthetic audit fixture', passwordHash: 'SYNTHETIC_NOT_A_CREDENTIAL' } })
            await tx.beinAccount.create({ data: { id: this.accountId, username: this.marker + '@example.test',
                password: 'SYNTHETIC_NOT_A_CREDENTIAL', automationExclusive: false, isActive: false } })
            const absent = this.kind === 'legacy' || this.kind === 'null-evidence'
            await tx.operation.create({ data: {
                id: this.operationId, userId: this.reseller ? this.userId : null,
                customerId: this.reseller ? null : this.customerId, beinAccountId: this.accountId,
                type: 'RENEW', cardNumber: this.cardNumber, amount: 174, status: 'COMPLETING',
                purpose: this.kind === 'legacy' ? null : this.kind === 'installment' ? 'INSTALLMENT' : 'RENEWAL',
                providerPaymentState: absent ? null : 'NOT_SUBMITTED', fulfillmentState: absent ? null : 'UNVERIFIED',
                fulfillmentAuthority: 'NONE', selectedPackage: { index: 3, name: 'Synthetic package', price: 174 },
                responseData: { provenance: 'SYNTHETIC_AUDIT_036' },
            } })
            if (this.reseller) await tx.transaction.create({ data: {
                userId: this.userId, operationId: this.operationId, type: 'OPERATION_DEDUCT',
                amount: -174, balanceAfter: 0,
            } })
            if (this.kind === 'wallet') await tx.walletTransaction.create({ data: {
                customerId: this.customerId, type: 'DEBIT', amount: -209, balanceBefore: 209,
                balanceAfter: 0, description: 'SYNTHETIC_AUDIT_036',
                referenceType: 'RENEWAL', referenceId: this.operationId,
            } })
            if (!this.reseller && this.kind !== 'wallet') {
                if (this.externalMinor) await tx.payment.create({ data: {
                    id: this.paymentId, customerId: this.customerId, stripePaymentIntentId: this.paymentIntentId,
                    amount: this.externalMinor / 100, currency: 'SAR', status: 'SUCCEEDED', type: 'SUBSCRIPTION',
                    metadata: { source: 'store_renewal', operationId: this.operationId,
                        subscriptionId: this.subscriptionId, packageName: 'Synthetic package', creditUsed: this.creditMinor / 100 },
                } })
                await tx.storeSubscription.create({ data: {
                    id: this.subscriptionId, customerId: this.customerId, cardNumber: this.cardNumber,
                    operationId: this.operationId, paymentId: this.externalMinor ? this.paymentId : null,
                    stripePaymentIntentId: this.externalMinor ? this.paymentIntentId : null,
                    status: 'PAID', packageName: 'Synthetic package', packagePrice: 174, price: 209,
                    currency: 'SAR', creditUsed: this.creditMinor / 100,
                } })
                if (this.creditMinor) await tx.storeCreditLedgerEntry.create({ data: {
                    subscriptionId: this.subscriptionId, customerId: this.customerId, entryType: 'DEBIT',
                    amountMinor: this.creditMinor, balanceBeforeMinor: this.creditMinor, balanceAfterMinor: 0,
                    currency: 'SAR', reasonCode: 'STORE_SUBSCRIPTION_PACKAGE_SELECTION',
                } })
            }
            if (this.kind === 'installment') await tx.operationInstallmentEvidence.create({ data: {
                operationId: this.operationId, beinAccountId: this.accountId, cardNumber: this.cardNumber,
                installmentId: 'synthetic-due-item', correlationKey: this.marker + '-attempt',
                mutationStartedAt: this.now, observedAt: this.now, paymentState: 'UNKNOWN',
                settlementState: 'UNKNOWN', reasonCode: 'SYNTHETIC_UNCERTAIN',
            } })
            if (this.kind === 'old-dispatch') await tx.operationDispatch.create({ data: {
                operationId: this.operationId, jobType: 'START_RENEWAL',
                payload: { provenance: 'SYNTHETIC_AUDIT_036' }, // omit revision to exercise old inserts
            } })
            if (this.kind === 'active-refund') await tx.renewalRefundSettlement.create({
                data: { ...this.settlementData(), state: 'UNKNOWN' },
            })
            if (this.kind === 'stale-baseline') {
                const verification = await tx.operationFulfillmentVerification.create({ data: { operationId: this.operationId } })
                for (const sequence of [1, 2]) {
                    const baseline = await tx.operationFulfillmentBaseline.create({ data: {
                        verificationId: verification.id, operationId: this.operationId, beinAccountId: this.accountId,
                        cardNumberSnapshot: this.cardNumber, baselineSequence: sequence, sessionGeneration: 'synthetic-generation',
                        dealerContextHash: createHash('sha256').update(this.marker).digest('hex'),
                        invoiceSet: [], targetCardRows: [], pageCount: 1,
                        rowCount: 0, firstPageWatermark: 'synthetic-empty', scanAttemptCount: 1,
                        capturedAt: this.now, supersededAt: sequence === 1 ? this.now : null,
                        supersededReason: sequence === 1 ? 'SYNTHETIC_REPLACEMENT' : null,
                    } })
                    if (sequence === 2) await tx.operationFulfillmentVerification.update({
                        where: { id: verification.id }, data: { activeBaselineId: baseline.id },
                    })
                }
            }
        })
    }

    async cleanup() {
        // Every delete is scoped to this random synthetic identity; never truncate shared tables.
        await this.db.$transaction(async tx => {
            await tx.renewalRefundObservation.deleteMany({ where: { request: { settlement: { operationId: this.operationId } } } })
            await tx.renewalRefundRequest.deleteMany({ where: { settlement: { operationId: this.operationId } } })
            await tx.renewalRefundSettlement.deleteMany({ where: { operationId: this.operationId } })
            await tx.operationReviewAdjudication.deleteMany({ where: { operationId: this.operationId } })
            await tx.operationCompletionEffect.deleteMany({ where: { operationId: this.operationId } })
            await tx.pointLedgerEntry.deleteMany({ where: { operationId: this.operationId } })
            await tx.operationSpendAwardRun.deleteMany({ where: { operationId: this.operationId } })
            await tx.notification.deleteMany({ where: { userId: this.userId } })
            await tx.activityLog.deleteMany({ where: { userId: this.userId } })
            await tx.operationInstallmentEvidence.deleteMany({ where: { operationId: this.operationId } })
            await tx.beinAccountSpendLedger.deleteMany({ where: { operationId: this.operationId } })
            await tx.operationIntegrityIssue.deleteMany({ where: { operationId: this.operationId } })
            await tx.operationDispatch.deleteMany({ where: { operationId: this.operationId } })
            await tx.cardLifecycleReservation.deleteMany({ where: { operationId: this.operationId } })
            await tx.providerAccountCausalReservation.deleteMany({ where: { operationId: this.operationId } })
            await tx.operationFulfillmentVerification.updateMany({ where: { operationId: this.operationId }, data: { activeBaselineId: null } })
            await tx.operationFulfillmentBaseline.deleteMany({ where: { operationId: this.operationId } })
            await tx.operationFulfillmentVerification.deleteMany({ where: { operationId: this.operationId } })
            await tx.storeCreditLedgerEntry.deleteMany({ where: { subscriptionId: this.subscriptionId } })
            await tx.storeSubscription.deleteMany({ where: { id: this.subscriptionId } })
            await tx.payment.deleteMany({ where: { id: this.paymentId } })
            await tx.walletTransaction.deleteMany({ where: { customerId: this.customerId } })
            await tx.transaction.deleteMany({ where: { operationId: this.operationId } })
            await tx.operation.deleteMany({ where: { id: this.operationId } })
            await tx.beinAccount.deleteMany({ where: { id: this.accountId } })
            await tx.customer.deleteMany({ where: { id: this.customerId } })
            await tx.user.deleteMany({ where: { id: this.userId } })
        })
    }
}
