// Operation Prices (in SAR)
export const OPERATION_PRICES = {
    // Renew Subscription
    RENEW_1_MONTH: 50,
    RENEW_3_MONTHS: 140,
    RENEW_6_MONTHS: 270,
    RENEW_1_YEAR: 500,

    // Other Operations
    CHECK_BALANCE: 5,
    SIGNAL_REFRESH: 10,
} as const

// Duration Options for Renew Form
export const DURATION_OPTIONS = [
    { value: '1_month', label: '1 Month', price: OPERATION_PRICES.RENEW_1_MONTH },
    { value: '3_months', label: '3 Months', price: OPERATION_PRICES.RENEW_3_MONTHS },
    { value: '6_months', label: '6 Months', price: OPERATION_PRICES.RENEW_6_MONTHS },
    { value: '1_year', label: '1 Year', price: OPERATION_PRICES.RENEW_1_YEAR },
] as const

// Operation Types
export const OPERATION_TYPES = {
    RENEW: 'RENEW',
    CHECK_BALANCE: 'CHECK_BALANCE',
    SIGNAL_REFRESH: 'SIGNAL_REFRESH',
} as const

// Operation Statuses
export const OPERATION_STATUSES = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    AWAITING_CAPTCHA: 'AWAITING_CAPTCHA',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
} as const

// UI Constants
export const MIN_BALANCE_WARNING = 50
export const POLLING_INTERVAL_MS = 2000
export const OPERATION_TIMEOUT_MINUTES = 5

// Card Number Validation
export const CARD_NUMBER_REGEX = /^\d{10,16}$/
export const CARD_NUMBER_MIN_LENGTH = 10
export const CARD_NUMBER_MAX_LENGTH = 16

// Get price for operation type
export function getOperationPrice(type: string, duration?: string): number {
    if (type === OPERATION_TYPES.RENEW) {
        const durationOption = DURATION_OPTIONS.find(d => d.value === duration)
        return durationOption?.price ?? OPERATION_PRICES.RENEW_1_MONTH
    }
    if (type === OPERATION_TYPES.CHECK_BALANCE) {
        return OPERATION_PRICES.CHECK_BALANCE
    }
    if (type === OPERATION_TYPES.SIGNAL_REFRESH) {
        return OPERATION_PRICES.SIGNAL_REFRESH
    }
    return 0
}

// Operation Type Labels (Arabic)
export const OPERATION_TYPE_LABELS: Record<string, string> = {
    RENEW: 'Subscription Renewal',
    CHECK_BALANCE: 'Balance Inquiry',
    SIGNAL_REFRESH: 'Signal Refresh',
}

// Operation Status Labels (Arabic)
export const OPERATION_STATUS_LABELS: Record<string, string> = {
    PENDING: 'Pending',
    PROCESSING: 'Processing',
    AWAITING_CAPTCHA: 'Awaiting Captcha',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
}
