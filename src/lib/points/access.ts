const POINT_WALLET_ROLES = new Set(['USER', 'AGENT', 'MANAGER', 'ADMIN'])

export function canAccessPointsWallet(role: string | null | undefined): boolean {
    return Boolean(role && POINT_WALLET_ROLES.has(role))
}
