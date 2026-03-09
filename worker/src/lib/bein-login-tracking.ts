import { prisma } from './prisma';

const LOGIN_FAILURE_THRESHOLD_SETTING_KEY = 'worker_bein_login_failure_threshold';
const DEFAULT_LOGIN_FAILURE_THRESHOLD = 3;
const MIN_LOGIN_FAILURE_THRESHOLD = 1;
const MAX_LOGIN_FAILURE_THRESHOLD = 20;
const THRESHOLD_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_LOGIN_FAILURE_REASON = 'Login failed';

const NON_CREDENTIAL_FAILURE_PATTERNS = [
    'captcha',
    '2captcha',
    'verification code',
    'image verification',
    'following code',
    'timeout',
    'timed out',
    'network',
    'socket',
    'proxy',
    'session expired',
    'session',
    'viewstate',
    'api key',
    'connect',
    'econn',
    'enotfound',
    'ehostunreach',
    'too many redirects',
    'server returned html',
    'status code 5',
    'status code 429',
];

let thresholdCache: { value: number; cachedAt: number } | null = null;

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

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

function normalizeFailureReason(reason: string | undefined): string {
    const trimmedReason = reason?.trim();
    return (trimmedReason || DEFAULT_LOGIN_FAILURE_REASON).slice(0, 500);
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
    } catch (error: unknown) {
        console.error(`[LoginTracking] Failed to load threshold: ${getErrorMessage(error)}`);
        return DEFAULT_LOGIN_FAILURE_THRESHOLD;
    }
}

export function shouldCountAsCredentialFailure(reason: string | undefined): boolean {
    const normalizedReason = normalizeFailureReason(reason).toLowerCase();

    if (normalizedReason === 'login failed after captcha') {
        return true;
    }

    return !NON_CREDENTIAL_FAILURE_PATTERNS.some((pattern) =>
        normalizedReason.includes(pattern)
    );
}

export async function recordLoginSuccess(accountId: string): Promise<void> {
    const now = new Date();

    try {
        await prisma.beinAccount.update({
            where: { id: accountId },
            data: {
                consecutiveLoginFailures: 0,
                lastLoginAttemptAt: now,
                lastLoginFailureAt: null,
                lastLoginFailureReason: null,
                lastSuccessfulLoginAt: now,
            },
        });
    } catch (error: unknown) {
        console.error(`[LoginTracking] Failed to record login success for ${accountId}: ${getErrorMessage(error)}`);
    }
}

export async function recordLoginFailure(accountId: string, reason: string | undefined): Promise<void> {
    const now = new Date();
    const failureReason = normalizeFailureReason(reason);

    try {
        const account = await prisma.beinAccount.update({
            where: { id: accountId },
            data: {
                consecutiveLoginFailures: { increment: 1 },
                lastLoginAttemptAt: now,
                lastLoginFailureAt: now,
                lastLoginFailureReason: failureReason,
            },
            select: {
                username: true,
                label: true,
                consecutiveLoginFailures: true,
            },
        });

        const threshold = await getLoginFailureThreshold();
        if (account.consecutiveLoginFailures >= threshold) {
            // Auto-disable the account when threshold is reached
            await prisma.beinAccount.update({
                where: { id: accountId },
                data: { isActive: false },
            });
            console.error(
                `[LoginTracking] 🚫 ${account.label || account.username} AUTO-DISABLED — ` +
                `${account.consecutiveLoginFailures}/${threshold} consecutive login failures. ` +
                `Reason: ${failureReason}. Check beIN Login Failures page.`
            );
        }
    } catch (error: unknown) {
        console.error(`[LoginTracking] Failed to record login failure for ${accountId}: ${getErrorMessage(error)}`);
    }
}
