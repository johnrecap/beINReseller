const REDACTED = '[redacted]'

function isSensitiveLogKey(key: string): boolean {
    const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()

    return normalized.includes('password') ||
        normalized.includes('passwd') ||
        normalized === 'pwd' ||
        normalized.includes('totp') ||
        normalized.includes('secret') ||
        normalized.includes('token') ||
        normalized.includes('cookie') ||
        normalized.includes('session') ||
        normalized.includes('credential') ||
        normalized.includes('authorization') ||
        normalized.includes('viewstate') ||
        normalized.includes('eventvalidation') ||
        normalized === 'bot' ||
        normalized === 'bottoken' ||
        normalized === 'telegrambottoken' ||
        normalized === 'captcha2captchakey' ||
        normalized === 'beinusername' ||
        normalized === 'accountusername' ||
        normalized === 'beinaccountusername'
}

function redactPlainText(value: string): string {
    return value
        .replace(/\b(password|passwd|pwd|token|secret|totp|cookie|authorization|credential|botToken|telegramBotToken|captcha_2captcha_key)\s*[:=]\s*[^,\s"}]+/gi, '$1=' + REDACTED)
        .replace(/\b(bein[_-]?username|accountUsername|beinAccountUsername)\s*[:=]\s*[^,\s"}]+/gi, '$1=' + REDACTED)
}

export function redactActivityLogDetails(value: unknown): unknown {
    if (value === null || value === undefined) return value

    if (typeof value === 'string') {
        try {
            return JSON.stringify(redactActivityLogDetails(JSON.parse(value)))
        } catch {
            return redactPlainText(value)
        }
    }

    if (Array.isArray(value)) {
        return value.map(item => redactActivityLogDetails(item))
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
                key,
                isSensitiveLogKey(key) ? REDACTED : redactActivityLogDetails(entry),
            ])
        )
    }

    return value
}
