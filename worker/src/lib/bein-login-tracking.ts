import { prisma } from './prisma';
import { isCredentialLoginFailure, loginMessageFailure } from '../../../shared/bein/login-failure';
import type { LoginFailure } from '../../../shared/bein/login-failure';
import { decideLoginHealth, type LoginHealthContext } from '../../../shared/bein/login-health';

/** Typed 037 policy. Callers must supply finality and actual-attempt evidence.
 * Returns false for a stale revision; never refetch-and-retry under a newer revision. */
export async function recordLoginHealthFailure(
    accountId: string,
    failure: Partial<Pick<LoginFailure, 'failureCategory' | 'failureCode'>>,
    revision: Date | undefined,
    context: LoginHealthContext,
): Promise<boolean> {
    const decision = decideLoginHealth(failure, context);
    if (!decision.record) return false;
    if (!revision || !Number.isFinite(revision.getTime())) throw new Error('LOGIN_HEALTH_REVISION_REQUIRED');
    try {
        const changed = await prisma.$executeRaw`UPDATE "bein_accounts" SET
            "consecutive_login_failures" = "consecutive_login_failures" + ${decision.credentialIncrement},
            "is_active" = CASE WHEN ${decision.disable} THEN false ELSE "is_active" END,
            "last_login_attempt_at" = NOW() AT TIME ZONE 'UTC',
            "last_login_failure_at" = NOW() AT TIME ZONE 'UTC',
            "last_login_failure_reason" = ${decision.reason},
            "updated_at" = GREATEST(clock_timestamp() AT TIME ZONE 'UTC', "updated_at" + interval '1 millisecond')
            WHERE "id" = ${accountId} AND "updated_at" = ${revision} AND "is_active" = true`;
        return changed === 1;
    } catch {
        throw new Error('LOGIN_HEALTH_PERSIST_FAILED');
    }
}

/** Returns the revision written by this login, never a later independent read. */
export async function recordLoginHealthSuccess(accountId: string, revision?: Date): Promise<Date> {
    if (!revision || !Number.isFinite(revision.getTime())) throw new Error('LOGIN_HEALTH_REVISION_REQUIRED');
    let rows: { updatedAt: Date }[];
    try {
        rows = await prisma.$queryRaw<{ updatedAt: Date }[]>`UPDATE "bein_accounts" SET
            "consecutive_login_failures" = 0, "last_login_attempt_at" = NOW() AT TIME ZONE 'UTC',
            "last_login_failure_at" = NULL, "last_login_failure_reason" = NULL,
            "last_successful_login_at" = NOW() AT TIME ZONE 'UTC',
            "updated_at" = GREATEST(clock_timestamp() AT TIME ZONE 'UTC', "updated_at" + interval '1 millisecond')
            WHERE "id" = ${accountId} AND "updated_at" = ${revision} AND "is_active" = true
            RETURNING "updated_at" AS "updatedAt"`;
    } catch { throw new Error('LOGIN_HEALTH_PERSIST_FAILED'); }
    if (rows.length !== 1 || !(rows[0].updatedAt instanceof Date) || !Number.isFinite(rows[0].updatedAt.getTime()))
        throw new Error('LOGIN_HEALTH_STALE');
    return rows[0].updatedAt;
}

/** Compatibility metadata only; terminal authentication failures quarantine immediately. */
export async function getLoginFailureThreshold(): Promise<number> { return 1; }

export const shouldCountAsCredentialFailure = isCredentialLoginFailure;

// The revision is captured before HTTP starts. A reset or another owner changes
// updated_at, so an old response cannot clear or re-disable the recovered account.
export async function recordLoginSuccess(accountId: string, revision?: Date): Promise<void> {
    await recordLoginHealthSuccess(accountId, revision);
}

/** Compatibility adapter for already-classified final credential rejection callers. */
export async function recordLoginFailure(accountId: string, reason: string | undefined, revision?: Date): Promise<void> {
    if (!shouldCountAsCredentialFailure(reason)) return;
    const changed = await recordLoginHealthFailure(accountId, loginMessageFailure(reason), revision,
        { attempted: true, terminal: true });
    if (!changed) throw new Error('LOGIN_HEALTH_STALE');
}
