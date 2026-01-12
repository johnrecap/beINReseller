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
