export function canonicalizeProviderAccountUsername(username: string): string {
    return username.trim().toLowerCase()
}

export function normalizeProviderAccountCredentialUsername(username: string): string {
    return username.trim()
}
