/**
 * TOTP Generator - Google Authenticator compatible
 * 
 * Generates 6-digit TOTP codes from a secret key.
 * These codes are valid for 30 seconds each.
 */

import { authenticator } from 'otplib'

export class TOTPGenerator {
    /**
     * Generate a 6-digit TOTP code
     * @param secret - The secret key from Google Authenticator setup
     * @returns 6-digit code string
     */
    generate(secret: string): string {
        // otplib handles the time-based rotation automatically
        return authenticator.generate(secret)
    }

    /**
     * Verify a TOTP code (for testing purposes)
     * @param token - The 6-digit code to verify
     * @param secret - The secret key
     * @returns true if valid
     */
    verify(token: string, secret: string): boolean {
        return authenticator.verify({ token, secret })
    }

    /**
     * Get remaining seconds until code expires
     * @returns seconds remaining (0-30)
     */
    getTimeRemaining(): number {
        return 30 - (Math.floor(Date.now() / 1000) % 30)
    }
}
