export type UserOwnershipConflictAuditArgs =
    | { ok: true; limit: number }
    | { ok: false; code: 'INVALID_LIMIT' | 'UNKNOWN_ARGUMENT' }

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1_000

export function parseUserOwnershipConflictAuditArgs(
    args: readonly string[]
): UserOwnershipConflictAuditArgs {
    const limitArgs = args.filter((arg) => arg.startsWith('--limit='))
    if (args.some((arg) => !arg.startsWith('--limit='))) {
        return { ok: false, code: 'UNKNOWN_ARGUMENT' }
    }
    if (limitArgs.length > 1) {
        return { ok: false, code: 'INVALID_LIMIT' }
    }

    const rawLimit = limitArgs[0]?.slice('--limit='.length)
    const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return { ok: false, code: 'INVALID_LIMIT' }
    }

    return { ok: true, limit }
}
