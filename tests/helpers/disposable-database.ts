function integrationFlagEnabled(): boolean {
    return process.env.RUN_DB_INTEGRATION === '1' ||
        process.env.RUN_DB_INTEGRATION === 'true' ||
        process.env.RUN_DB_INTEGRATION_TESTS === 'true'
}

export function isDisposableDatabaseIntegrationConfigured(): boolean {
    const rawUrl = process.env.DATABASE_URL
    if (!integrationFlagEnabled() || !rawUrl) return false
    if (process.env.CONFIRM_DISPOSABLE_RENEWAL_FULFILLMENT_DB === '1') return true

    try {
        const databaseName = decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, '')).toLowerCase()
        return /(^|[_-])(test|testing|ci|spec|disposable)([_-]|$)/.test(databaseName)
    } catch {
        return false
    }
}

export const disposableDatabaseSkipReason = isDisposableDatabaseIntegrationConfigured()
    ? false
    : 'RELEASE_BLOCKER: configure an explicitly disposable PostgreSQL DATABASE_URL and RUN_DB_INTEGRATION before release'

// Opt-in guard for audit 036. Existing suites retain their own guards.
// No confirmation flag may bypass target validation; no secret URL is logged.
export function isAuditDisposableDatabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env.NODE_ENV === 'production' || env.CONFIRM_DISPOSABLE_RENEWAL_FULFILLMENT_DB !== '1' ||
        !['1', 'true'].includes(env.RUN_DB_INTEGRATION || '') || !env.DATABASE_URL) return false
    try {
        const url = new URL(env.DATABASE_URL)
        const name = decodeURIComponent(url.pathname.slice(1))
        return ['postgres:', 'postgresql:'].includes(url.protocol) &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
            !url.search && !url.hash && /^[a-z0-9_-]+$/i.test(name) &&
            /(^|[_-])(test|testing|ci|spec|disposable)([_-]|$)/i.test(name) &&
            !/(^|[_-])(prod|production|live)([_-]|$)/i.test(name)
    } catch {
        return false
    }
}
