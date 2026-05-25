const SENSITIVE_RESPONSE_KEYS = new Set([
    'sessiondata',
    'cookies',
    'storagestate',
    'viewstate',
    'eventvalidation',
    'password',
    'totpsecret',
    'totp',
    'providertoken',
    'accesstoken',
    'refreshtoken',
    'authtoken',
    'token',
])

function isSensitiveResponseKey(key: string): boolean {
    const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    return SENSITIVE_RESPONSE_KEYS.has(normalized) ||
        normalized.includes('viewstate') ||
        normalized.includes('eventvalidation') ||
        normalized.includes('password') ||
        normalized.includes('totp') ||
        normalized.endsWith('token')
}

export function redactOperationResponseData(value: unknown): unknown {
    if (!value) return value

    if (typeof value === 'string') {
        try {
            return redactOperationResponseData(JSON.parse(value))
        } catch {
            return value
        }
    }

    if (Array.isArray(value)) {
        return value.map(item => redactOperationResponseData(item))
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([key]) => !isSensitiveResponseKey(key))
                .map(([key, entry]) => [key, redactOperationResponseData(entry)])
        )
    }

    return value
}

type OperationAccountAuditSource = {
    chargedBeinSpendLedger: {
        id: string
        beinAccountId: string
        beinUsernameSnapshot: string
        beinLabelSnapshot: string | null
        spendAmount: number
        dealerBalanceBefore: number
        dealerBalanceAfter: number
        chargedAt: Date
        evidenceSource: string
    } | null
    beinAccount?: {
        id: string
        username: string | null
        label: string | null
    } | null
}

export function buildChargedBeinAccountAudit(operation: OperationAccountAuditSource, isAdmin: boolean) {
    if (operation.chargedBeinSpendLedger) {
        return {
            ledgerId: operation.chargedBeinSpendLedger.id,
            beinAccountId: operation.chargedBeinSpendLedger.beinAccountId,
            username: operation.chargedBeinSpendLedger.beinUsernameSnapshot,
            label: operation.chargedBeinSpendLedger.beinLabelSnapshot,
            spendAmount: operation.chargedBeinSpendLedger.spendAmount,
            dealerBalanceBefore: operation.chargedBeinSpendLedger.dealerBalanceBefore,
            dealerBalanceAfter: operation.chargedBeinSpendLedger.dealerBalanceAfter,
            chargedAt: operation.chargedBeinSpendLedger.chargedAt,
            evidenceSource: operation.chargedBeinSpendLedger.evidenceSource,
        }
    }

    if (!isAdmin || !operation.beinAccount) return null

    return {
        ledgerId: null,
        beinAccountId: operation.beinAccount.id,
        username: operation.beinAccount.username,
        label: operation.beinAccount.label,
        spendAmount: null,
        dealerBalanceBefore: null,
        dealerBalanceAfter: null,
        chargedAt: null,
        evidenceSource: 'OPERATION_ACCOUNT',
    }
}
