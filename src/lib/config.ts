export const SECURITY_CONFIG = {
    // Bcrypt
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),

    // Session (Seconds)
    sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '3600'), // 1 hour

    // Captcha (Seconds)
    captchaTimeout: parseInt(process.env.CAPTCHA_TIMEOUT || '120'), // 2 minutes

    // Rate Limiting
    rateLimitWindow: 60, // 1 minute
}
