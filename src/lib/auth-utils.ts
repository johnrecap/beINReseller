import { auth } from './auth'
import { redirect } from 'next/navigation'

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
