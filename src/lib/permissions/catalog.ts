import type { Role } from '@/lib/permissions'

export const PANEL_USER_CREATION_FREEZE_KEY = 'panel_user_creation_freeze' as const

export const PERMISSION_KEYS = {
    PERMISSIONS_MANAGE: 'permissions.manage',
    USERS_CREATE: 'users.create',
    MANAGER_USERS_CREATE: 'manager.users.create',
    USERS_EDIT: 'users.edit',
    USERS_ACTIVATE: 'users.activate',
    USERS_DELETE: 'users.delete',
    USERS_RESET_PASSWORD: 'users.reset_password',
    BALANCE_ADD: 'balance.add',
    BALANCE_WITHDRAW: 'balance.withdraw',
    AGENT_TRANSFER: 'agents.transfer_users',
    ANNOUNCEMENTS_MANAGE: 'announcements.manage',
    POINTS_SETTINGS_MANAGE: 'points.settings.manage',
    REWARDS_MANAGE: 'rewards.manage',
    CREDIT_REQUESTS_APPROVE: 'credit_requests.approve',
    FINANCIAL_REVIEW_DECIDE: 'financial_review.decide',
    ADMIN_SETTINGS_MANAGE: 'admin.settings.manage',
} as const

export type AppPermissionKey = typeof PERMISSION_KEYS[keyof typeof PERMISSION_KEYS]

export type PermissionEffect = 'allow' | 'deny'
export type PermissionCategory = 'security' | 'users' | 'balance' | 'agents' | 'content' | 'points' | 'finance' | 'settings'
export type PermissionRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface PermissionCatalogItem {
    key: AppPermissionKey
    category: PermissionCategory
    label: string
    description: string
    riskLevel: PermissionRiskLevel
    defaultRoles: Role[]
}

export const PERMISSION_CATALOG: PermissionCatalogItem[] = [
    {
        key: PERMISSION_KEYS.PERMISSIONS_MANAGE,
        category: 'security',
        label: 'Manage permissions',
        description: 'View and change role permissions, user overrides, and global permission settings.',
        riskLevel: 'critical',
        defaultRoles: ['ADMIN'],
    },
    {
        key: PERMISSION_KEYS.USERS_CREATE,
        category: 'users',
        label: 'Create panel users',
        description: 'Create users from the admin panel, including agent-owned users.',
        riskLevel: 'high',
        defaultRoles: ['ADMIN'],
    },
    {
        key: PERMISSION_KEYS.MANAGER_USERS_CREATE,
        category: 'users',
        label: 'Create managed users',
        description: 'Create users from the manager panel.',
        riskLevel: 'high',
        defaultRoles: ['MANAGER'],
    },
    {
        key: PERMISSION_KEYS.USERS_EDIT,
        category: 'users',
        label: 'Edit users',
        description: 'Edit panel user details and status fields.',
        riskLevel: 'high',
        defaultRoles: ['ADMIN', 'MANAGER'],
    },
    {
        key: PERMISSION_KEYS.USERS_ACTIVATE,
        category: 'users',
        label: 'Activate or deactivate users',
        description: 'Toggle panel user active status.',
        riskLevel: 'high',
        defaultRoles: ['ADMIN', 'MANAGER'],
    },
    {
        key: PERMISSION_KEYS.USERS_DELETE,
        category: 'users',
        label: 'Delete users',
        description: 'Soft-delete panel users and trigger related balance handling.',
        riskLevel: 'critical',
        defaultRoles: ['ADMIN', 'MANAGER'],
    },
    {
        key: PERMISSION_KEYS.USERS_RESET_PASSWORD,
        category: 'users',
        label: 'Reset user passwords',
        description: 'Reset another panel user password.',
        riskLevel: 'high',
        defaultRoles: ['ADMIN', 'MANAGER'],
    },
    {
        key: PERMISSION_KEYS.BALANCE_ADD,
        category: 'balance',
        label: 'Add user balance',
        description: 'Transfer or credit balance to panel users.',
        riskLevel: 'critical',
        defaultRoles: ['ADMIN', 'MANAGER'],
    },
    {
        key: PERMISSION_KEYS.BALANCE_WITHDRAW,
        category: 'balance',
        label: 'Withdraw user balance',
        description: 'Withdraw balance from panel users.',
        riskLevel: 'critical',
        defaultRoles: ['ADMIN', 'MANAGER'],
    },
    {
        key: PERMISSION_KEYS.AGENT_TRANSFER,
        category: 'agents',
        label: 'Transfer users to agents',
        description: 'Move users between manager/admin ownership and agent assignments.',
        riskLevel: 'high',
        defaultRoles: ['ADMIN'],
    },
    {
        key: PERMISSION_KEYS.ANNOUNCEMENTS_MANAGE,
        category: 'content',
        label: 'Manage announcements',
        description: 'Create, update, delete, or activate dashboard announcements.',
        riskLevel: 'medium',
        defaultRoles: ['ADMIN'],
    },
    {
        key: PERMISSION_KEYS.POINTS_SETTINGS_MANAGE,
        category: 'points',
        label: 'Manage point settings',
        description: 'Change points and rewards earning settings.',
        riskLevel: 'critical',
        defaultRoles: ['ADMIN'],
    },
    {
        key: PERMISSION_KEYS.REWARDS_MANAGE,
        category: 'points',
        label: 'Manage rewards',
        description: 'Manage reward definitions and redemption decisions.',
        riskLevel: 'high',
        defaultRoles: ['ADMIN'],
    },
    {
        key: PERMISSION_KEYS.CREDIT_REQUESTS_APPROVE,
        category: 'finance',
        label: 'Approve credit requests',
        description: 'Approve or reject requested credit deposits.',
        riskLevel: 'critical',
        defaultRoles: ['ADMIN'],
    },
    {
        key: PERMISSION_KEYS.FINANCIAL_REVIEW_DECIDE,
        category: 'finance',
        label: 'Decide financial reviews',
        description: 'Approve, refund, or resolve financial review cases.',
        riskLevel: 'critical',
        defaultRoles: ['ADMIN'],
    },
    {
        key: PERMISSION_KEYS.ADMIN_SETTINGS_MANAGE,
        category: 'settings',
        label: 'Manage admin settings',
        description: 'Change high-level panel configuration.',
        riskLevel: 'critical',
        defaultRoles: ['ADMIN'],
    },
]

export const PERMISSION_CATALOG_BY_KEY = new Map<AppPermissionKey, PermissionCatalogItem>(
    PERMISSION_CATALOG.map((permission) => [permission.key, permission])
)

export function isKnownPermissionKey(value: string): value is AppPermissionKey {
    return PERMISSION_CATALOG_BY_KEY.has(value as AppPermissionKey)
}

export function defaultRoleHasCatalogPermission(role: Role, permissionKey: AppPermissionKey): boolean {
    return PERMISSION_CATALOG_BY_KEY.get(permissionKey)?.defaultRoles.includes(role) ?? false
}
