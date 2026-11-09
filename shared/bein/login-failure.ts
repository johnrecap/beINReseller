/** Safe shared login vocabulary. Never return provider HTML or exception messages. */
export interface LoginFailure {
    success: false
    failureCategory: 'transport' | 'rate_limit' | 'captcha' | 'credentials' | 'unknown'
    failureCode: string
    httpStatus?: number
    retryable: boolean
    error: string
}

export function loginHttpFailure(status: number | undefined): LoginFailure | null {
    if (typeof status === 'number' && status >= 200 && status < 300) return null
    if (status === 429) return { success: false, failureCategory: 'rate_limit', failureCode: 'LOGIN_RATE_LIMITED',
        httpStatus: status, retryable: false, error: 'Login rate limited (HTTP 429)' }
    if (status === 402 || status === 407 || (typeof status === 'number' && status >= 500)) {
        return { success: false, failureCategory: 'transport',
            failureCode: status === 402 ? 'PROXY_PAYMENT_REQUIRED' : status === 407 ? 'PROXY_AUTH_REQUIRED' : 'LOGIN_UPSTREAM_UNAVAILABLE',
            httpStatus: status, retryable: status >= 500, error: `Login connection failed (HTTP ${status})` }
    }
    return { ...loginMessageFailure(), ...(typeof status === 'number' ? { httpStatus: status } : {}) }
}

export function loginMessageFailure(message?: string): LoginFailure {
    if (/captcha|image verification|verification code|2captcha|api key/i.test(message || '')) {
        return { success: false, failureCategory: 'captcha', failureCode: 'LOGIN_CAPTCHA_REQUIRED',
            retryable: false, error: 'Login CAPTCHA verification requires attention' }
    }
    // Explicit allowlist only. A returned login form or generic error is not credential evidence.
    if (/^(?:invalid|incorrect|wrong) (?:user ?name (?:or|and) password|credentials|password)[.!]?$/i.test(message?.trim() || '')) {
        return { success: false, failureCategory: 'credentials', failureCode: 'LOGIN_CREDENTIALS_REJECTED',
            retryable: false, error: 'Invalid username or password' }
    }
    return { success: false, failureCategory: 'unknown', failureCode: 'LOGIN_REVIEW_REQUIRED',
        retryable: false, error: 'Login response requires review' }
}

export function loginExceptionFailure(error: unknown): LoginFailure {
    const value = error && typeof error === 'object' ? error as { response?: { status?: number }; message?: string; code?: string } : {}
    const tunnel = /(?:CONNECT|tunnel|proxy).*?\b(402|407|429|5\d\d)\b/i.exec(value.message || '')
    const status = value.response?.status ?? (tunnel ? Number(tunnel[1]) : undefined)
    if (status !== undefined) return loginHttpFailure(status) || loginMessageFailure()
    if (/^(?:ERR_TLS_|ERR_SSL_)/.test(value.code || '') ||
        ['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
            'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
            'CERT_SIGNATURE_FAILURE', 'CERT_REVOKED'].includes(value.code || '')) {
        return { success: false, failureCategory: 'transport', failureCode: 'LOGIN_TLS_FAILED',
            retryable: false, error: 'Login secure connection failed' }
    }
    if (/^(E(?:CONN|HOST|NET|AI_|NOTFOUND|TIMEDOUT)|ETIMEDOUT|ECONNABORTED)/.test(value.code || '') ||
        /network|socket|timed? ?out|connect/i.test(value.message || '')) {
        return { success: false, failureCategory: 'transport', failureCode: 'LOGIN_CONNECTION_FAILED',
            retryable: true, error: 'Login connection unavailable' }
    }
    return loginMessageFailure(value.message)
}

export function isCredentialLoginFailure(value: string | Partial<Pick<LoginFailure, 'failureCategory' | 'failureCode'>> | undefined): boolean {
    return typeof value === 'object'
        ? value.failureCategory === 'credentials' && value.failureCode === 'LOGIN_CREDENTIALS_REJECTED'
        : loginMessageFailure(value).failureCategory === 'credentials'
}
