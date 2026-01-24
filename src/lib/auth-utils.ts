import { auth } from './auth'
import { redirect } from 'next/navigation'
import { 
    Permission, 
    roleHasPermission, 
    roleHasAnyPermission,
    PERMISSIONS 
} from './permissions'

/**
 * Get the current authenticated user from session
 * Returns null if not authenticated
 */
export async function getAuthUser() {
    const session = await auth()
    return session?.user || null
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
    const session = await auth()
    if (!session?.user) {
        redirect('/login')
    }
    return session.user
}

/**
 * Require admin role - redirect if not admin
 */
export async function requireAdmin() {
    const session = await auth()
    if (!session?.user) {
        redirect('/login')
    }
    if (session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }
    return session.user
}

/**
 * Require manager role (or admin) - redirect if not manager/admin
 */
export async function requireManager() {
    const session = await auth()
    if (!session?.user) {
        redirect('/login')
    }

    if (!hasRole(session.user.role, 'MANAGER')) {
        redirect('/dashboard')
    }
    return session.user
}

/**
 * Require specific role for API routes (returns error object instead of redirect)
 */
export async function requireRoleAPI(requiredRole: RoleLevel) {
    const session = await auth()

    if (!session?.user?.id) {
        return { error: 'غير مصرح', status: 401 }
    }

    if (!hasRole(session.user.role, requiredRole)) {
        return { error: 'صلاحيات غير كافية', status: 403 }
    }

    return { user: session.user }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
    const session = await auth()
    return !!session?.user
}

/**
 * Check if user is admin
 */
export async function isAdmin() {
    const session = await auth()
    return session?.user?.role === 'ADMIN'
}

/**
 * Check if user is manager or higher
 */
export async function isManager() {
    const session = await auth()
    return hasRole(session?.user?.role, 'MANAGER')
}

// ============================================
// PERMISSION-BASED AUTH FUNCTIONS
// ============================================

/**
 * Require specific permission - redirect if not authorized
 * Use this for page-level protection
 */
export async function requirePermission(permission: Permission, redirectTo = '/dashboard') {
    const session = await auth()
    if (!session?.user) {
        redirect('/login')
    }

    if (!roleHasPermission(session.user.role, permission)) {
        redirect(redirectTo)
    }

    return session.user
}

/**
 * Require any of the specified permissions - redirect if not authorized
 */
export async function requireAnyPermission(permissions: Permission[], redirectTo = '/dashboard') {
    const session = await auth()
    if (!session?.user) {
        redirect('/login')
    }

    if (!roleHasAnyPermission(session.user.role, permissions)) {
        redirect(redirectTo)
    }

    return session.user
}

/**
 * Require specific permission for API routes (returns error object instead of redirect)
 */
export async function requirePermissionAPI(permission: Permission) {
    const session = await auth()

    if (!session?.user?.id) {
        return { error: 'غير مصرح', status: 401 }
    }

    if (!roleHasPermission(session.user.role, permission)) {
        return { error: 'صلاحيات غير كافية', status: 403 }
    }

    return { user: session.user }
}

/**
 * Require any of the specified permissions for API routes
 */
export async function requireAnyPermissionAPI(permissions: Permission[]) {
    const session = await auth()

    if (!session?.user?.id) {
        return { error: 'غير مصرح', status: 401 }
    }

    if (!roleHasAnyPermission(session.user.role, permissions)) {
        return { error: 'صلاحيات غير كافية', status: 403 }
    }

    return { user: session.user }
}

/**
 * Check if current user has permission (async version for server components)
 */
export async function checkPermission(permission: Permission): Promise<boolean> {
    const session = await auth()
    return roleHasPermission(session?.user?.role, permission)
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
