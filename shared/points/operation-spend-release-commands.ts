export type OperationSpendCutoverArgs =
    | { ok: true; activate: boolean; confirmedRelease: string | null }
    | { ok: false; code:
        | 'CONFIRMED_RELEASE_REQUIRED'
        | 'ACTIVATE_FLAG_REQUIRED'
        | 'INVALID_RELEASE_ID'
        | 'DUPLICATE_ARGUMENT'
        | 'UNKNOWN_ARGUMENT'
    }

export type OperationSpendAuditArgs =
    | { ok: true; limit: number }
    | { ok: false; code: 'INVALID_LIMIT' | 'UNKNOWN_ARGUMENT' }

export function parseOperationSpendCutoverArgs(args: readonly string[]): OperationSpendCutoverArgs {
    const activateArgs = args.filter((arg) => arg === '--activate')
    const releaseArgs = args.filter((arg) => arg.startsWith('--confirmed-release='))
    if (args.some((arg) => arg !== '--activate' && !arg.startsWith('--confirmed-release='))) {
        return { ok: false, code: 'UNKNOWN_ARGUMENT' }
    }
    if (activateArgs.length > 1 || releaseArgs.length > 1) {
        return { ok: false, code: 'DUPLICATE_ARGUMENT' }
    }

    const activate = activateArgs.length === 1
    const releaseArg = releaseArgs[0]
    const confirmedRelease = releaseArg?.slice('--confirmed-release='.length).trim() || null

    if (releaseArg && !confirmedRelease) {
        return { ok: false, code: 'INVALID_RELEASE_ID' }
    }
    if (activate && !confirmedRelease) {
        return { ok: false, code: 'CONFIRMED_RELEASE_REQUIRED' }
    }
    if (!activate && confirmedRelease) {
        return { ok: false, code: 'ACTIVATE_FLAG_REQUIRED' }
    }
    if (confirmedRelease && (
        confirmedRelease.length > 120
        || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(confirmedRelease)
    )) {
        return { ok: false, code: 'INVALID_RELEASE_ID' }
    }

    return { ok: true, activate, confirmedRelease }
}

export function parseOperationSpendAuditArgs(args: readonly string[]): OperationSpendAuditArgs {
    const limitArgs = args.filter((arg) => arg.startsWith('--limit='))
    if (args.some((arg) => !arg.startsWith('--limit='))) {
        return { ok: false, code: 'UNKNOWN_ARGUMENT' }
    }
    if (limitArgs.length > 1) return { ok: false, code: 'INVALID_LIMIT' }

    const limitArg = limitArgs[0]
    if (!limitArg) return { ok: true, limit: 100 }

    const limit = Number(limitArg.slice('--limit='.length))
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
        return { ok: false, code: 'INVALID_LIMIT' }
    }
    return { ok: true, limit }
}
