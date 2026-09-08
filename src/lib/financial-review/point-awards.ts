import type { FinancialReviewDecisionAction } from '@/lib/financial-review/types'

export function shouldAwardOperationSpendPointsAfterFinancialReview(input: {
    action: FinancialReviewDecisionAction
    nextStatus: string
    fulfillmentVerified: boolean
}): boolean {
    return input.action === 'BEIN_EXECUTED_NO_REFUND' &&
        input.nextStatus === 'COMPLETED' &&
        input.fulfillmentVerified
}
