/**
 * Activity-based session refresh
 * Updates the session timestamp to extend validity
 */
export async function refreshSessionOnActivity(token: any) {
    // Return token with updated timestamps if needed
    // In NextAuth v5, returning the token from jwt callback with a new timestamp 
    // effectively potentially slides the window if configured correctly, 
    // but mainly we rely on maxAge.
    // For manual refresh, we can update an 'iat' or 'exp' if we were manually signing.
    // With NextAuth, just accessing the session slides the cookie expiry if saving to database.
    // For JWT, we can trigger a refresh by updating a specialized field.

    return {
        ...token,
        lastActivity: Date.now()
    }
}
