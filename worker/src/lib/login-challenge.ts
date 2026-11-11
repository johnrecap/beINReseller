import type { LoginResult } from '../http/types';
import type { LoginHealthContext } from '../../../shared/bein/login-health';
import { CaptchaSolverError } from '../utils/captcha-solver';

export const MAX_CAPTCHA_SUBMISSIONS = 3;

export interface LoginChallengeRuntime {
    assertCurrent(): Promise<void>;
    getApiKey(): Promise<string | null>;
    solve(apiKey: string, image: string): Promise<string>;
    submit(solution: string): Promise<LoginResult>;
    requestManual?: (image: string) => Promise<string | null>;
    attempted: boolean;
    captchaSubmissions?: number;
}

/** Keep one cookie jar and its current form throughout a challenge chain.
 * Solver failures/manual timeouts are incomplete work, never provider rejections. */
export async function completeLoginChallenge(initial: LoginResult, runtime: LoginChallengeRuntime): Promise<{
    result: LoginResult; context: LoginHealthContext;
}> {
    let result = initial;
    let captchaSubmissions = runtime.captchaSubmissions ?? 0;
    const context = (terminal: boolean): LoginHealthContext => ({
        attempted: runtime.attempted, terminal, captchaSubmissions,
    });
    while (!result.success && result.requiresCaptcha && result.captchaImage && captchaSubmissions < MAX_CAPTCHA_SUBMISSIONS) {
        await runtime.assertCurrent();
        const solution = await resolveChallengeSolution(result.captchaImage, runtime);
        await runtime.assertCurrent();
        if (!solution) return { result, context: context(false) };
        result = await runtime.submit(solution);
        captchaSubmissions++;
        await runtime.assertCurrent();
        console.log(`[Login] stage=captcha_submit submissions=${captchaSubmissions} code=${result.success ? 'LOGIN_OK' : result.failureCode || 'LOGIN_REVIEW_REQUIRED'}`);
    }
    const challengePending = result.requiresCaptcha || result.failureCategory === 'captcha';
    return { result, context: context(!challengePending || captchaSubmissions === MAX_CAPTCHA_SUBMISSIONS) };
}

async function resolveChallengeSolution(image: string, runtime: LoginChallengeRuntime): Promise<string | null> {
    const apiKey = await runtime.getApiKey();
    let solution: string | null = null;
    if (apiKey) {
        // Only the external solver boundary is recoverable here. Ownership, cancellation,
        // database and provider submission errors must propagate to the owning operation.
        try { solution = (await runtime.solve(apiKey, image)).trim() || null; }
        catch (error) { console.warn(`[Login] stage=captcha_solver code=${error instanceof CaptchaSolverError ? error.code : 'CAPTCHA_SOLVER_UNAVAILABLE'}`); }
    } else console.warn('[Login] stage=captcha_solver code=CAPTCHA_SOLVER_NOT_CONFIGURED');
    await runtime.assertCurrent();
    return solution || (runtime.requestManual ? runtime.requestManual(image) : null);
}
