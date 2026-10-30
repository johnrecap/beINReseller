import { prisma } from './prisma';
import { isCredentialLoginFailure } from '../../../shared/bein/login-failure';

const LOGIN_FAILURE_THRESHOLD_SETTING_KEY = 'worker_bein_login_failure_threshold';
const DEFAULT_LOGIN_FAILURE_THRESHOLD = 3;
const MIN_LOGIN_FAILURE_THRESHOLD = 1;
const MAX_LOGIN_FAILURE_THRESHOLD = 20;
const THRESHOLD_CACHE_TTL_MS = 60 * 1000;

let thresholdCache: { value: number; cachedAt: number } | null = null;

function normalizeThreshold(value: string | null | undefined): number {
    const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

    if (
        !Number.isInteger(parsed) ||
        parsed < MIN_LOGIN_FAILURE_THRESHOLD ||
        parsed > MAX_LOGIN_FAILURE_THRESHOLD
    ) {
        return DEFAULT_LOGIN_FAILURE_THRESHOLD;
    }

    return parsed;
}

export async function getLoginFailureThreshold(): Promise<number> {
    if (thresholdCache && Date.now() - thresholdCache.cachedAt < THRESHOLD_CACHE_TTL_MS) {
        return thresholdCache.value;
    }

    try {
        const setting = await prisma.setting.findUnique({
            where: { key: LOGIN_FAILURE_THRESHOLD_SETTING_KEY },
            select: { value: true },
        });

        const value = normalizeThreshold(setting?.value);
        thresholdCache = { value, cachedAt: Date.now() };
        return value;
    } catch {
        console.error('[LoginTracking] Failed to load threshold');
        return DEFAULT_LOGIN_FAILURE_THRESHOLD;
    }
}

export const shouldCountAsCredentialFailure = isCredentialLoginFailure;

// The revision is captured before HTTP starts. A reset or another owner changes
// updated_at, so an old response cannot clear or re-disable the recovered account.
export async function recordLoginSuccess(accountId: string, revision?: Date): Promise<void> {
    if (!revision) return;
    try {
        await prisma.$executeRaw`UPDATE "bein_accounts" SET
            "consecutive_login_failures" = 0, "last_login_attempt_at" = NOW() AT TIME ZONE 'UTC',
            "last_login_failure_at" = NULL, "last_login_failure_reason" = NULL,
            "last_successful_login_at" = NOW() AT TIME ZONE 'UTC',
            "updated_at" = GREATEST(clock_timestamp() AT TIME ZONE 'UTC', "updated_at" + interval '1 millisecond')
            WHERE "id" = ${accountId} AND "updated_at" = ${revision} AND "is_active" = true`;
    } catch {
        console.error('[LoginTracking] Could not persist login success');
    }
}

export async function recordLoginFailure(accountId: string, reason: string | undefined, revision?: Date): Promise<void> {
    if (!revision || !shouldCountAsCredentialFailure(reason)) return;
    const threshold = await getLoginFailureThreshold();
    try {
        await prisma.$executeRaw`UPDATE "bein_accounts" SET
            "consecutive_login_failures" = "consecutive_login_failures" + 1,
            "is_active" = CASE WHEN "consecutive_login_failures" + 1 >= ${threshold} THEN false ELSE "is_active" END,
            "last_login_attempt_at" = NOW() AT TIME ZONE 'UTC', "last_login_failure_at" = NOW() AT TIME ZONE 'UTC',
            "last_login_failure_reason" = 'Invalid username or password',
            "updated_at" = GREATEST(clock_timestamp() AT TIME ZONE 'UTC', "updated_at" + interval '1 millisecond')
            WHERE "id" = ${accountId} AND "updated_at" = ${revision} AND "is_active" = true`;
    } catch {
        console.error('[LoginTracking] Could not persist credential rejection');
    }
}
