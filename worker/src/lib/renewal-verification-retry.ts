const TRANSIENT_RENEWAL_VERIFICATION_PREFIXES = [
    'PROVIDER_ACCOUNT_EXECUTION_UNAVAILABLE',
    'FULFILLMENT_READ_SESSION_UNAVAILABLE',
    'PROVIDER_EXECUTION_LEASE_LOST',
] as const;

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
}

export function isTransientRenewalVerificationError(error: unknown): boolean {
    const message = errorMessage(error);
    return TRANSIENT_RENEWAL_VERIFICATION_PREFIXES.some((prefix) => message.startsWith(prefix));
}

/**
 * Signals BullMQ to retry a read-only fulfillment check. This wrapper is only
 * created before a verification attempt is persisted, so replay can never
 * submit provider payment or skip a recorded proof decision.
 */
export class RetryableRenewalVerificationError extends Error {
    override readonly cause: unknown;

    constructor(cause: unknown) {
        super(`RETRYABLE_RENEWAL_VERIFICATION: ${errorMessage(cause)}`);
        this.name = 'RetryableRenewalVerificationError';
        this.cause = cause;
    }
}
