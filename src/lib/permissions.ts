/**
 * Centralized Permissions System
 * 
 * This file defines all permissions and role-based access control for the application.
 * No database tables needed - all permissions are defined here.
 */

// Valid Roles
export type Role = 'ADMIN' | 'MANAGER' | 'USER'

// All Permission Keys
export const PERMISSIONS = {
    // Dashboard
    DASHBOARD_VIEW: 'dashboard.view',

    // Subscription Operations
    SUBSCRIPTION_RENEW: 'subscription.renew',
    SUBSCRIPTION_BULK: 'subscription.bulk',

    // Signal Operations
    SIGNAL_ACTIVATE: 'signal.activate',

    // Operations History
    OPERATIONS_VIEW: 'operations.view',
    OPERATIONS_ACTIVE: 'operations.active',

    // Profile
    PROFILE_VIEW: 'profile.view',
    PROFILE_EDIT: 'profile.edit',

    // Transactions
    TRANSACTIONS_VIEW: 'transactions.view',

    // Notifications
    NOTIFICATIONS_VIEW: 'notifications.view',

    // Manager Features
    MANAGER_DASHBOARD: 'manager.dashboard',
    MANAGER_USERS_VIEW: 'manager.users.view',
    MANAGER_USERS_CREATE: 'manager.users.create',
    MANAGER_USERS_EDIT: 'manager.users.edit',
    MANAGER_USERS_DELETE: 'manager.users.delete',

    // Admin Features
    ADMIN_DASHBOARD: 'admin.dashboard',
    ADMIN_USERS_MANAGE: 'admin.users.manage',
    ADMIN_SETTINGS: 'admin.settings',
    ADMIN_BEIN_ACCOUNTS: 'admin.bein_accounts',
    ADMIN_PROXIES: 'admin.proxies',
    ADMIN_LOGS: 'admin.logs',
    ADMIN_ANALYTICS: 'admin.analytics',
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]

/**
 * Default permissions for each role
 * ADMIN: Full access to everything
 * MANAGER: User management only (no renewals or signals)
 * USER: Renewals, signals, and own data only
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    // ADMIN has ALL permissions
    ADMIN: Object.values(PERMISSIONS) as Permission[],

    // MANAGER: User management + basic views (NO renewals/signals)
    MANAGER: [
        PERMISSIONS.DASHBOARD_VIEW,
        PERMISSIONS.PROFILE_VIEW,
        PERMISSIONS.PROFILE_EDIT,
        PERMISSIONS.TRANSACTIONS_VIEW,
        PERMISSIONS.NOTIFICATIONS_VIEW,
        // Manager-specific
        PERMISSIONS.MANAGER_DASHBOARD,
        PERMISSIONS.MANAGER_USERS_VIEW,
        PERMISSIONS.MANAGER_USERS_CREATE,
        PERMISSIONS.MANAGER_USERS_EDIT,
        PERMISSIONS.MANAGER_USERS_DELETE,
    ],

    // USER: Renewals, signals, operations (NO user management)
    USER: [
        PERMISSIONS.DASHBOARD_VIEW,
        PERMISSIONS.SUBSCRIPTION_RENEW,
        PERMISSIONS.SUBSCRIPTION_BULK,
        PERMISSIONS.SIGNAL_ACTIVATE,
        PERMISSIONS.OPERATIONS_VIEW,
        PERMISSIONS.OPERATIONS_ACTIVE,
        PERMISSIONS.PROFILE_VIEW,
        PERMISSIONS.PROFILE_EDIT,
        PERMISSIONS.TRANSACTIONS_VIEW,
        PERMISSIONS.NOTIFICATIONS_VIEW,
    ],
}

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(role: string | undefined, permission: Permission): boolean {
    if (!role) return false

    const normalizedRole = role.toUpperCase() as Role

    const permissions = DEFAULT_ROLE_PERMISSIONS[normalizedRole]
    if (!permissions) return false

    return permissions.includes(permission)
}

/**
 * Check if a role has ANY of the specified permissions
 */
export function roleHasAnyPermission(role: string | undefined, permissions: Permission[]): boolean {
    return permissions.some(permission => roleHasPermission(role, permission))
}

/**
 * Check if a role has ALL of the specified permissions
 */
export function roleHasAllPermissions(role: string | undefined, permissions: Permission[]): boolean {
    return permissions.every(permission => roleHasPermission(role, permission))
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string | undefined): Permission[] {
    if (!role) return []

    const normalizedRole = role.toUpperCase() as Role

    return DEFAULT_ROLE_PERMISSIONS[normalizedRole] || []
}

/**
 * Check if user can access subscription/renewal features
 */
export function canAccessSubscription(role: string | undefined): boolean {
    return roleHasPermission(role, PERMISSIONS.SUBSCRIPTION_RENEW)
}

/**
 * Check if user can access signal activation
 */
export function canAccessSignal(role: string | undefined): boolean {
    return roleHasPermission(role, PERMISSIONS.SIGNAL_ACTIVATE)
}

/**
 * Check if user can access manager features
 */
export function canAccessManagerFeatures(role: string | undefined): boolean {
    return roleHasPermission(role, PERMISSIONS.MANAGER_DASHBOARD)
}

/**
 * Check if user can access admin features
 */
export function canAccessAdminFeatures(role: string | undefined): boolean {
    return roleHasPermission(role, PERMISSIONS.ADMIN_DASHBOARD)
}

/**
 * Permission groups for common use cases
 */
export const PERMISSION_GROUPS = {
    // Quick Actions on Dashboard (renew + signal)
    QUICK_ACTIONS: [
        PERMISSIONS.SUBSCRIPTION_RENEW,
        PERMISSIONS.SIGNAL_ACTIVATE,
    ],

    // All renewal-related permissions
    RENEWAL_OPERATIONS: [
        PERMISSIONS.SUBSCRIPTION_RENEW,
        PERMISSIONS.SUBSCRIPTION_BULK,
        PERMISSIONS.SIGNAL_ACTIVATE,
        PERMISSIONS.OPERATIONS_VIEW,
        PERMISSIONS.OPERATIONS_ACTIVE,
    ],

    // All manager permissions
    MANAGER_ALL: [
        PERMISSIONS.MANAGER_DASHBOARD,
        PERMISSIONS.MANAGER_USERS_VIEW,
        PERMISSIONS.MANAGER_USERS_CREATE,
        PERMISSIONS.MANAGER_USERS_EDIT,
        PERMISSIONS.MANAGER_USERS_DELETE,
    ],

    // All admin permissions
    ADMIN_ALL: [
        PERMISSIONS.ADMIN_DASHBOARD,
        PERMISSIONS.ADMIN_USERS_MANAGE,
        PERMISSIONS.ADMIN_SETTINGS,
        PERMISSIONS.ADMIN_BEIN_ACCOUNTS,
        PERMISSIONS.ADMIN_PROXIES,
        PERMISSIONS.ADMIN_LOGS,
        PERMISSIONS.ADMIN_ANALYTICS,
    ],
} as const
