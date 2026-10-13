import { canonicalJson, quoteData, quoteRevisionOf, readyPackageQuote, sameQuotedPackage, type QuotePackage, type PromoAction } from '../../../shared/operations/package-quote'
import type { AvailablePackage, LoadPackagesResult } from '../http/types'
import type { Prisma } from '@prisma/client'
import { lockFinancialOperation } from '../../../shared/operations/financial-lock'
import { closePrePaymentHolds, hasProvenUnsubmittedPayment } from '../../../shared/operations/renewal-pre-payment'

export function matchFreshPackage(packages: readonly AvailablePackage[], selected: QuotePackage): AvailablePackage {
    const matches = packages.filter(row => sameQuotedPackage(row, selected))
    if (matches.length !== 1) throw new Error('PACKAGE_QUOTE_CHANGED')
    return matches[0]
}

export function isCurrentPromo(operation: { status: string; responseData: unknown; promoCode?: string | null },
    revision: number, promoCode: string | undefined, promoAction: PromoAction) {
    const data = quoteData(operation.responseData)
    return operation.status === 'AWAITING_PACKAGE' && quoteRevisionOf(data) === revision && data.refreshing === true &&
        (data.promoAction || 'APPLY') === promoAction &&
        (Object.hasOwn(data, 'requestedPromoCode') ? data.requestedPromoCode : operation.promoCode ?? null) ===
            (promoAction === 'REMOVE' ? null : promoCode || null)
}

export function promoResultData(previous: unknown, packages: readonly QuotePackage[], revision: number,
    promoCode: string | null, success: boolean,
    failure?: Pick<LoadPackagesResult, 'error' | 'failureStage' | 'failureReason' | 'providerPostSent'>) {
    return success ? readyPackageQuote(previous, packages, revision, promoCode)
        : { ...quoteData(previous), quoteRevision: revision, quoteState: 'FAILED' as const,
            refreshing: false, promoApplied: false, error: failure?.error || 'PROMO_REFRESH_FAILED',
            promoFailureStage: failure?.failureStage || 'PRE_SUBMIT',
            ...(failure?.failureReason ? { promoFailureReason: failure.failureReason } : {}),
            promoProviderPostSent: failure?.providerPostSent === true }
}

export async function publishPromoQuote(db: { $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> },
    input: { operationId: string; revision: number; promoCode?: string; promoAction: PromoAction;
        result: LoadPackagesResult }, assertCurrent?: () => Promise<void>) {
    return db.$transaction(async tx => {
        if (!await lockFinancialOperation(tx, input.operationId)) return false
        const current = await tx.operation.findUnique({ where: { id: input.operationId } })
        if (!current || !isCurrentPromo(current, input.revision, input.promoCode, input.promoAction)) return false
        await assertCurrent?.()
        const succeeded = input.result.success && input.result.packages.length > 0
        const packages = input.result.packages.map(pkg => ({ ...pkg, checkboxSelector: pkg.checkboxValue }))
        const data = promoResultData(current.responseData, packages, input.revision,
            input.promoAction === 'REMOVE' ? null : input.promoCode || null, succeeded, input.result)
        const saved = await tx.operation.updateMany({ where: { id: input.operationId, status: 'AWAITING_PACKAGE' }, data: {
            ...(succeeded ? { availablePackages: packages, promoCode: input.promoAction === 'REMOVE' ? null : input.promoCode } : {}),
            responseData: JSON.stringify(data),
        } })
        return saved.count === 1
    })
}

export async function holdQuoteConflict(db: { $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> },
    input: { operationId: string; revision: number; selectedPackage: unknown;
        preSale?: { beinAccountId: string }; reasonCode?: string }, assertCurrent: () => Promise<void>) {
    return db.$transaction(async tx => {
        if (!await lockFinancialOperation(tx, input.operationId)) return false
        const current = await tx.operation.findUnique({ where: { id: input.operationId }, include: {
            transactions: { select: { id: true } }, refundSettlements: { select: { id: true } },
            chargedBeinSpendLedger: { select: { id: true } }, fulfillmentProof: { select: { id: true } },
            manualFulfillmentEvidence: { select: { id: true } }, storeSubscription: { select: { id: true } },
            dispatches: { where: { jobType: { in: ['CONFIRM_PURCHASE', 'CONFIRM_INSTALLMENT'] } },
                select: { id: true, jobType: true, status: true, attempts: true } },
        } })
        if (!current || current.status !== 'COMPLETING' || quoteRevisionOf(current.responseData) !== input.revision ||
            canonicalJson(current.selectedPackage) !== canonicalJson(input.selectedPackage)) return false
        await assertCurrent()
        const data = quoteData(current.responseData)
        // Only the fenced owner can attest this is selection preparation. Add,
        // Sell and STB are before final OK/Pay in flow v2; their replay remains
        // blocked even when the attempt can safely end without financial review.
        const preparationOnly = current.renewalFlowVersion === 2 &&
            data.operationPhase === 'PROVIDER_SALE_PREPARATION_STARTED' &&
            data.providerMutationMayHaveStarted === true &&
            typeof data.providerPreparationMutationStartedAt === 'string'
        const safePreSale = !!input.preSale && input.preSale.beinAccountId === current.beinAccountId &&
            hasProvenUnsubmittedPayment(current) &&
            current.type === 'RENEW' &&
            (current.purpose === 'RENEWAL' || (current.renewalFlowVersion === 2 && current.purpose == null)) &&
            !!current.userId && !current.customerId &&
            current.amount === 0 && current.transactions.length === 0 && current.refundSettlements.length === 0 &&
            !current.storeSubscription && !current.chargedBeinSpendLedger && !current.fulfillmentProof &&
            !current.manualFulfillmentEvidence && current.dispatches.length === 0 &&
            !current.providerMutationStartedAt && !current.providerMutationStage &&
            current.providerPaymentState === 'NOT_SUBMITTED' && current.fulfillmentState === 'UNVERIFIED' &&
            current.fulfillmentAuthority === 'NONE' &&
            (data.operationPhase === 'PACKAGE_PREPARATION' &&
                data.providerMutationMayHaveStarted !== true || preparationOnly) &&
            data.finalPaySubmitted === false &&
            !data.finalProviderMutationStartedAt && !data.finalPayRequestStartedAt && !data.finalPaySubmittedAt &&
            await tx.beinAccountSpendLedger.count({ where: { operationId: current.id } }) === 0
        const closedAt = new Date()
        const failureCode = input.reasonCode && input.reasonCode !== 'CART_QUOTE_MISMATCH'
            ? 'PACKAGE_SELECTION_UNVERIFIED' : 'PACKAGE_QUOTE_CHANGED'
        const saved = await tx.operation.updateMany({ where: { id: input.operationId, status: 'COMPLETING' }, data: {
            status: safePreSale ? 'FAILED' : 'REVIEW_REQUIRED', responseMessage: failureCode, finalConfirmExpiry: null,
            ...(safePreSale ? { completedAt: closedAt, heartbeatExpiry: null } : {}),
            responseData: JSON.stringify({ ...data, quoteConflict: true,
                ...(input.reasonCode ? { quoteConflictReason: input.reasonCode } : {}),
                ...(safePreSale ? { quoteConflictResolution: 'VERIFIED_PRE_SALE_NO_DEBIT', safeToRestart: true } : {}) }),
        } })
        if (saved.count === 1 && safePreSale) {
            await closePrePaymentHolds(tx, current, { at: closedAt, reason: 'PACKAGE_QUOTE_CHANGED_PRE_SALE' })
        }
        return saved.count === 1
    })
}

// Legacy quotes rebuild the page. V2 must keep its operation-scoped WebForms
// page: a reload loses the card/type selection and can change package controls.
export async function refreshPromoPackages(client: {
    loadPackages(cardNumber: string, smartcardType: string): Promise<LoadPackagesResult>
    applyPromoCode(code: string, cardNumber: string, smartcardType: string,
        assertCurrent?: () => Promise<void>, removing?: boolean,
        onSubmitStarted?: () => Promise<void>): Promise<LoadPackagesResult>
    removePromoCode?(cardNumber: string, smartcardType: string,
        assertCurrent?: () => Promise<void>, onSubmitStarted?: () => Promise<void>): Promise<LoadPackagesResult>
}, input: { cardNumber: string; smartcardType: string; promoAction: PromoAction;
    promoCode?: string; reuseCurrentPage?: boolean }, assertCurrent: () => Promise<void>,
    onSubmitStarted?: () => Promise<void>) {
    await assertCurrent()
    if (input.reuseCurrentPage) {
        if (input.promoAction === 'REMOVE') {
            if (!client.removePromoCode) return { success: false, packages: [], error: 'PROMO_REFRESH_UNVERIFIED' }
            return client.removePromoCode(input.cardNumber, input.smartcardType, assertCurrent, onSubmitStarted)
        }
        if (!input.promoCode) return { success: false, packages: [], error: 'PROMO_REFRESH_FAILED' }
        return client.applyPromoCode(input.promoCode, input.cardNumber, input.smartcardType,
            assertCurrent, false, onSubmitStarted)
    }
    const loaded = await client.loadPackages(input.cardNumber, input.smartcardType)
    if (!loaded.success || input.promoAction === 'REMOVE') return loaded
    if (!input.promoCode) return { success: false, packages: [], error: 'PROMO_REFRESH_FAILED' }
    await assertCurrent()
    return client.applyPromoCode(input.promoCode, input.cardNumber, input.smartcardType, assertCurrent)
}
