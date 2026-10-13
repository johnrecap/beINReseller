import { quoteData } from './package-quote'

export interface ConsumerProgressContext {
    status: string
    providerPaymentState?: string | null
    fulfillmentState?: string | null
    finalConfirmExpiry?: Date | string | null
    responseData?: unknown
    responseMessage?: string | null
    transactions?: Array<{ type: string }>
    refundSettlements?: Array<{ state: string }>
}

/** Read-only, additive panel contract. Never infer a refund from FAILED/EXPIRED. */
export function projectOperationProgress(operation: ConsumerProgressContext, now = new Date()) {
    const data = quoteData(operation.responseData)
    const payment = operation.providerPaymentState ?? data.providerPaymentState
    const fulfillment = operation.fulfillmentState ?? data.fulfillmentState
    const reviewRequired = operation.status === 'REVIEW_REQUIRED'
    const reportVerificationPending = reviewRequired && data.proofKind === 'SOLD_REPORT_SAME_DAY' &&
        typeof data.nextVerificationAt === 'string' &&
        Number.isFinite(Date.parse(data.nextVerificationAt))
    const confirmationExpired = ['AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM'].includes(operation.status) &&
        Boolean(operation.finalConfirmExpiry && new Date(operation.finalConfirmExpiry).getTime() <= now.getTime())
    const refundPending = operation.refundSettlements?.some(row => !['CANCELLED', 'COMPLETED'].includes(row.state)) ?? false
    const refunded = operation.transactions?.some(row => row.type === 'REFUND') ?? false
    const terminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(operation.status)
    const settlementState = refundPending ? 'REFUND_PENDING' : refunded ? 'REFUNDED' : reviewRequired ? 'REVIEW_REQUIRED'
        : operation.status === 'COMPLETED' ? 'COMPLETED' : terminal ? 'UNCONFIRMED' : 'PENDING'
    const nextAction = reportVerificationPending ? 'WAIT' : reviewRequired || refundPending ? 'CONTACT_ADMIN' : confirmationExpired ? 'VIEW_ACTIVE_OPERATION'
        : terminal ? 'VIEW_HISTORY' : ['AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM'].includes(operation.status) ? 'CONTINUE' : 'WAIT'
    const messageKey = confirmationExpired ? 'operations.confirmationExpired' : refundPending ? 'operations.refundSettlementPending'
        : reportVerificationPending ? 'operations.waitingForReport' : reviewRequired ? (data.quoteConflict === true || operation.responseMessage === 'PACKAGE_QUOTE_CHANGED'
            ? 'operations.packageQuoteChangedReview' : payment === 'CHARGED'
                ? 'operations.providerChargedFulfillmentUnderReview' : 'operations.fulfillmentReviewPending')
            : operation.status === 'COMPLETING' && payment === 'CHARGED' && fulfillment === 'VERIFYING'
                ? 'operations.providerChargedVerifyingFulfillment'
                : operation.status === 'FAILED' && operation.responseMessage === 'PROVIDER_SMARTCARD_FORM_UNSUPPORTED'
                    ? 'operations.providerSmartcardFormUnsupported' : null
    return { reviewRequired, reportVerificationPending, confirmationExpired, settlementState, nextAction, messageKey }
}
