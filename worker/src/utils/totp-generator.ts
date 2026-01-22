/**
 * TOTP Generator - Google Authenticator compatible
 * 
 * Generates 6-digit TOTP codes from a secret key.
 * These codes are valid for 30 seconds each.
 */

import { authenticator } from 'otplib'

// Configure authenticator with time window tolerance
// This allows for a 1-step drift (30 seconds before/after)
authenticator.options = {
    step: 30,       // Standard 30-second step
    window: 1,      // Allow 1 step before/after for time sync issues
    digits: 6       // Standard 6-digit codes
};

export class TOTPGenerator {
    /**
     * Generate a 6-digit TOTP code
     * @param secret - The secret key from Google Authenticator setup
     * @returns 6-digit code string
     */
    generate(secret: string): string {
        // Clean the secret: remove spaces, dashes, and uppercase
        const cleanSecret = secret.replace(/[\s-]/g, '').toUpperCase();

        // Log time info for debugging
        const now = Math.floor(Date.now() / 1000);
        const timeStep = Math.floor(now / 30);
        console.log(`[TOTP] Time: ${now}, Step: ${timeStep}, Remaining: ${30 - (now % 30)}s`);

        // Generate the code
        const code = authenticator.generate(cleanSecret);
        console.log(`[TOTP] Generated code: ${code} for secret: ${cleanSecret.slice(0, 4)}****`);

        return code;
    }

    /**
     * Verify a TOTP code (for testing purposes)
     * @param token - The 6-digit code to verify
     * @param secret - The secret key
     * @returns true if valid
     */
    verify(token: string, secret: string): boolean {
        const cleanSecret = secret.replace(/[\s-]/g, '').toUpperCase();
        return authenticator.verify({ token, secret: cleanSecret })
    }

    /**
     * Get remaining seconds until code expires
     * @returns seconds remaining (0-30)
     */
    getTimeRemaining(): number {
        return 30 - (Math.floor(Date.now() / 1000) % 30)
    }
}

