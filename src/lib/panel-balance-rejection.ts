/** Compatibility adapter for the existing admin/manager /users/:id/balance DTOs.
 * Each listed error occurs before mutation or after a thrown transaction rolls back.
 * Do not reuse this classifier for correction, credit or other endpoints. */
export function isBalancePreEffectRejection(response: Response, body: unknown): boolean {
    if (!body || typeof body !== 'object' || !('error' in body) || typeof body.error !== 'string') return false
    const error = body.error
    if (response.status === 400) return [
        'Invalid data', 'Insufficient balance', 'Cannot modify balance for a deleted user',
        'Cannot modify balance for this account type',
    ].includes(error) || /^Insufficient (?:user balance\. Current balance|balance\. Your current balance): \$-?\d+(?:\.\d+)?$/.test(error)
    if (response.status === 404) return error === 'User not found'
    if (response.status === 403) return [
        "You do not have permission to modify this user's balance", 'Manager account is not available',
    ].includes(error)
    return response.status === 429 && error === 'Rate limit exceeded, please wait'
}
