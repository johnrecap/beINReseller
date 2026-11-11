import type { LoginFailure } from './login-failure'
import { isCredentialLoginFailure } from './login-failure'

export const LOGIN_HEALTH_REASONS = ['CREDENTIALS_REJECTED', 'CAPTCHA_EXHAUSTED', 'AUTH_REVIEW_REQUIRED',
    'CONNECTION_FAILED', 'RATE_LIMITED', 'SYSTEM_ERROR'] as const
export type LoginHealthReason = typeof LOGIN_HEALTH_REASONS[number]
export type LoginHealthContext = { attempted: boolean; terminal: boolean; captchaSubmissions?: number }

/** Called at the final login boundary, never merely because an existing session expired. */
export function decideLoginHealth(
    failure: Partial<Pick<LoginFailure, 'failureCategory' | 'failureCode'>>,
    context: LoginHealthContext,
): { record: boolean; disable: boolean; credentialIncrement: 0 | 1; reason: string } {
    const category = failure.failureCategory
    const reason: LoginHealthReason = !context.attempted ? 'SYSTEM_ERROR' :
        category === 'transport' ? 'CONNECTION_FAILED' : category === 'rate_limit' ? 'RATE_LIMITED' :
        isCredentialLoginFailure(failure) ? 'CREDENTIALS_REJECTED' :
        category === 'captcha' ? ((context.captchaSubmissions ?? 0) >= 3 ? 'CAPTCHA_EXHAUSTED' : 'SYSTEM_ERROR') : 'AUTH_REVIEW_REQUIRED'
    const disable = context.terminal && context.attempted &&
        (reason === 'CREDENTIALS_REJECTED' || reason === 'CAPTCHA_EXHAUSTED' || reason === 'AUTH_REVIEW_REQUIRED')
    return { record: context.terminal, disable, credentialIncrement: disable && reason === 'CREDENTIALS_REJECTED' ? 1 : 0,
        reason: `LOGIN_HEALTH_V1:${reason}` }
}

export function decodeLoginHealthReason(value: string | null | undefined): LoginHealthReason | null {
    if (!value) return null
    const code = value.startsWith('LOGIN_HEALTH_V1:') ? value.slice('LOGIN_HEALTH_V1:'.length) : ''
    if ((LOGIN_HEALTH_REASONS as readonly string[]).includes(code)) return code as LoginHealthReason
    if (isCredentialLoginFailure(value)) return 'CREDENTIALS_REJECTED'
    return 'AUTH_REVIEW_REQUIRED'
}
