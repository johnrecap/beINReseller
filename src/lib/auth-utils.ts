import { auth } from './auth'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'
import {
    Permission,
    Role,
    roleHasPermission,
    roleHasAnyPermission,
    PERMISSIONS
} from './permissions'
import { getMobileUserFromRequest } from './mobile-auth'
import prisma from './prisma'

/**
 * Unified user type for both web session and mobile token
 */
export interface AuthenticatedUser {
    id: string
    username: string
    email?: string | null
    role: Role
    balance: number
}

const authenticatedUserSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    balance: true,
    isActive: true,
    passwordChangedAt: true,
} as const

async function getDbAuthenticatedUser(
    userId: string,
    tokenIssuedAt?: number
): Promise<AuthenticatedUser | null> {
    const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: authenticatedUserSelect,
    })

    if (!dbUser || !dbUser.isActive) return null

    if (
        dbUser.passwordChangedAt &&
        (!tokenIssuedAt || dbUser.passwordChangedAt.getTime() > tokenIssuedAt)
    ) {
        return null
    }

    return {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        role: dbUser.role as Role,
        balance: dbUser.balance,
    }
}

/**
 * Get the current authenticated user from session
 * Returns null if not authenticated or if password was changed after token was issued
 */
export async function getAuthUser() {
    const session = await auth()
    if (!session?.user?.id) return null
    return getDbAuthenticatedUser(session.user.id, session.user.passwordChangedAt || 0)

}

export type RoleLevel = 'ADMIN' | 'MANAGER' | 'USER'

// Role hierarchy: Higher number = Higher privilege
const ROLE_HIERARCHY: Record<RoleLevel, number> = {
    ADMIN: 3,
    MANAGER: 2,
    USER: 1
}

// Re-export permissions for convenience
export { PERMISSIONS, roleHasPermission, roleHasAnyPermission }
export type { Permission }

/**
 * Check if user has required role or higher
 */
export function hasRole(userRole: string | undefined, requiredRole: RoleLevel): boolean {
    if (!userRole) return false
    // Normalize user role to uppercase just in case
    const role = userRole.toUpperCase()

    // Check if role exists in hierarchy
    if (!(role in ROLE_HIERARCHY)) return false

    // Compare levels
    const userLevel = ROLE_HIERARCHY[role as RoleLevel]
    const requiredLevel = ROLE_HIERARCHY[requiredRole]

    return userLevel >= requiredLevel
}

/**
 * Require authentication - redirect to login if not authenticated
 */
export async function requireAuth() {
    const user = await getAuthUser()
    if (!user) {
        redirect('/login')
    }
    return user
}

/**
 * Check exact role membership without hierarchy inheritance.
 * Use this for AGENT and other non-privilege role boundaries.
 */
export function hasExactRole(userRole: string | undefined, role: Role): boolean {
    return userRole?.toUpperCase() === role
}

/**
 * Check if a user is an agent. Agents must not inherit manager/admin access.
 */
export function isAgentRole(userRole: string | undefined): boolean {
    return hasExactRole(userRole, 'AGENT')
}

/**
 * Require admin role - redirect if not admin
 */
export async function requireAdmin() {
    const user = await getAuthUser()
    if (!user) {
        redirect('/login')
    }
    if (user.role !== 'ADMIN') {
        redirect('/dashboard')
    }
    return user
}

/**
 * Require manager role (or admin) - redirect if not manager/admin
 */
export async function requireManager() {
    const user = await getAuthUser()
    if (!user) {
        redirect('/login')
    }

    if (!hasRole(user.role, 'MANAGER')) {
        redirect('/dashboard')
    }
    return user
}

/**
 * Require exact agent role - redirect if not agent
 */
export async function requireAgent() {
    const user = await getAuthUser()
    if (!user) {
        redirect('/login')
    }

    if (!hasExactRole(user.role, 'AGENT')) {
        redirect('/dashboard')
    }
    return user
}

/**
 * Require specific role for API routes (returns error object instead of redirect)
 */
export async function requireRoleAPI(requiredRole: RoleLevel) {
    const user = await getAuthUser()

    if (!user) {
        return { error: 'Unauthorized', status: 401 }
    }

    if (!hasRole(user.role, requiredRole)) {
        return { error: 'Insufficient permissions', status: 403 }
    }

    return { user }
}

/**
 * Require an exact role for API routes.
 */
export async function requireExactRoleAPI(requiredRole: Role) {
    const user = await getAuthUser()

    if (!user) {
        return { error: 'Unauthorized', status: 401 }
    }

    if (!hasExactRole(user.role, requiredRole)) {
        return { error: 'Insufficient permissions', status: 403 }
    }

    return { user }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
    return !!(await getAuthUser())
}

/**
 * Check if user is admin
 */
export async function isAdmin() {
    const user = await getAuthUser()
    return user?.role === 'ADMIN'
}

/**
 * Check if user is manager or higher
 */
export async function isManager() {
    const user = await getAuthUser()
    return hasRole(user?.role, 'MANAGER')
}

// ============================================
// PERMISSION-BASED AUTH FUNCTIONS
// ============================================

/**
 * Require specific permission - redirect if not authorized
 * Use this for page-level protection
 */
export async function requirePermission(permission: Permission, redirectTo = '/dashboard') {
    const user = await getAuthUser()
    if (!user) {
        redirect('/login')
    }

    if (!roleHasPermission(user.role, permission)) {
        redirect(redirectTo)
    }

    return user
}

/**
 * Require any of the specified permissions - redirect if not authorized
 */
export async function requireAnyPermission(permissions: Permission[], redirectTo = '/dashboard') {
    const user = await getAuthUser()
    if (!user) {
        redirect('/login')
    }

    if (!roleHasAnyPermission(user.role, permissions)) {
        redirect(redirectTo)
    }

    return user
}

/**
 * Require specific permission for API routes (returns error object instead of redirect)
 */
export async function requirePermissionAPI(permission: Permission) {
    const user = await getAuthUser()

    if (!user) {
        return { error: 'Unauthorized', status: 401 }
    }

    if (!roleHasPermission(user.role, permission)) {
        return { error: 'Insufficient permissions', status: 403 }
    }

    return { user }
}

/**
 * Require any of the specified permissions for API routes
 */
export async function requireAnyPermissionAPI(permissions: Permission[]) {
    const user = await getAuthUser()

    if (!user) {
        return { error: 'Unauthorized', status: 401 }
    }

    if (!roleHasAnyPermission(user.role, permissions)) {
        return { error: 'Insufficient permissions', status: 403 }
    }

    return { user }
}

/**
 * Check if current user has permission (async version for server components)
 */
export async function checkPermission(permission: Permission): Promise<boolean> {
    const user = await getAuthUser()
    return roleHasPermission(user?.role, permission)
}

/**
 * Check if current user can access subscription features
 */
export async function canRenew(): Promise<boolean> {
    return checkPermission(PERMISSIONS.SUBSCRIPTION_RENEW)
}

/**
 * Check if current user can access signal features
 */
export async function canActivateSignal(): Promise<boolean> {
    return checkPermission(PERMISSIONS.SIGNAL_ACTIVATE)
}

// ============================================
// DUAL AUTH FUNCTIONS (WEB + MOBILE)
// ============================================

/**
 * Get authenticated user from either:
 * 1. NextAuth session (web app - checked first)
 * 2. Bearer token (mobile app - checked second)
 * 
 * This allows the same API routes to serve both web and mobile clients.
 * 
 * @param request - Next.js request object (needed for mobile token extraction)
 * @returns User data or null if not authenticated
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
    // Step 1: Try NextAuth session first (web app)
    const session = await auth()
    if (session?.user?.id) {
        return getDbAuthenticatedUser(session.user.id, session.user.passwordChangedAt || 0)
    }

    // Step 2: Try mobile token (Bearer token from Authorization header)
    const mobileUser = getMobileUserFromRequest(request)
    if (mobileUser) {
        return getDbAuthenticatedUser(mobileUser.id, mobileUser.tokenIssuedAt)
    }

    // No authentication found
    return null
}

/**
 * Require authentication for API routes - works with both web session and mobile token.
 * Returns error object instead of redirect (suitable for API routes).
 * 
 * @param request - Next.js request object
 * @returns Object with either { user } or { error, status }
 */
export async function requireAuthAPI(request: NextRequest) {
    const user = await getAuthenticatedUser(request)

    if (!user) {
        return { error: 'Unauthorized', status: 401 }
    }

    return { user }
}

/**
 * Require specific role for API routes - works with both web session and mobile token.
 * 
 * @param request - Next.js request object
 * @param requiredRole - Minimum required role level
 * @returns Object with either { user } or { error, status }
 */
export async function requireRoleAPIWithMobile(request: NextRequest, requiredRole: RoleLevel) {
    const user = await getAuthenticatedUser(request)

    if (!user) {
        return { error: 'Unauthorized', status: 401 }
    }

    if (!hasRole(user.role, requiredRole)) {
        return { error: 'Insufficient permissions', status: 403 }
    }

    return { user }
}

/**
 * Require an exact role for API routes - works with both web session and mobile token.
 */
export async function requireExactRoleAPIWithMobile(request: NextRequest, requiredRole: Role) {
    const user = await getAuthenticatedUser(request)

    if (!user) {
        return { error: 'Unauthorized', status: 401 }
    }

    if (!hasExactRole(user.role, requiredRole)) {
        return { error: 'Insufficient permissions', status: 403 }
    }

    return { user }
}

/**
 * Require specific permission for API routes - works with both web session and mobile token.
 * 
 * @param request - Next.js request object
 * @param permission - Required permission
 * @returns Object with either { user } or { error, status }
 */
export async function requirePermissionAPIWithMobile(request: NextRequest, permission: Permission) {
    const user = await getAuthenticatedUser(request)

    if (!user) {
        return { error: 'Unauthorized', status: 401 }
    }

    if (!roleHasPermission(user.role, permission)) {
        return { error: 'Insufficient permissions', status: 403 }
    }

    return { user }
}

/**
 * Require any of the specified permissions - works with both web session and mobile token.
 * 
 * @param request - Next.js request object
 * @param permissions - Array of permissions (user needs at least one)
 * @returns Object with either { user } or { error, status }
 */
export async function requireAnyPermissionAPIWithMobile(request: NextRequest, permissions: Permission[]) {
    const user = await getAuthenticatedUser(request)

    if (!user) {
        return { error: 'Unauthorized', status: 401 }
    }

    if (!roleHasAnyPermission(user.role, permissions)) {
        return { error: 'Insufficient permissions', status: 403 }
    }

    return { user }
}
