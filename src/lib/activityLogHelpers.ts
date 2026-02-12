/**
 * Activity Log Helpers — Client-safe utility for formatting activity logs
 * 
 * Maps raw action strings to human-readable labels, categories, colors,
 * and outcome indicators. Also provides smart details formatting.
 */

// ===== TYPES =====

export type ActionCategory = 'auth' | 'operations' | 'balance' | 'admin' | 'manager' | 'user' | 'system'
export type ActionOutcome = 'success' | 'failed' | 'started' | 'cancelled' | 'info'

export interface ActionInfo {
    label: string
    category: ActionCategory
    outcome: ActionOutcome
    icon: string // Lucide icon name hint for reference
}

// ===== CATEGORY STYLES =====

export const categoryStyles: Record<ActionCategory, { bg: string; text: string; label: string }> = {
    auth: {
        bg: 'bg-blue-500/15',
        text: 'text-blue-400',
        label: 'Auth'
    },
    operations: {
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-400',
        label: 'Operations'
    },
    balance: {
        bg: 'bg-purple-500/15',
        text: 'text-purple-400',
        label: 'Balance'
    },
    admin: {
        bg: 'bg-amber-500/15',
        text: 'text-amber-400',
        label: 'Admin'
    },
    manager: {
        bg: 'bg-cyan-500/15',
        text: 'text-cyan-400',
        label: 'Manager'
    },
    user: {
        bg: 'bg-slate-500/15',
        text: 'text-slate-400',
        label: 'User'
    },
    system: {
        bg: 'bg-red-500/15',
        text: 'text-red-400',
        label: 'System'
    }
}

// ===== OUTCOME STYLES =====

export const outcomeStyles: Record<ActionOutcome, { icon: string; color: string }> = {
    success: { icon: '✓', color: 'text-emerald-400' },
    failed: { icon: '✗', color: 'text-red-400' },
    started: { icon: '⏳', color: 'text-yellow-400' },
    cancelled: { icon: '⊘', color: 'text-orange-400' },
    info: { icon: '•', color: 'text-blue-400' }
}

// ===== ACTION MAP =====

const ACTION_MAP: Record<string, ActionInfo> = {
    // Auth
    'AUTH_LOGIN': { label: 'Login Successful', category: 'auth', outcome: 'success', icon: 'LogIn' },
    'LOGIN': { label: 'Login Successful', category: 'auth', outcome: 'success', icon: 'LogIn' },
    'AUTH_FAILED': { label: 'Login Failed', category: 'auth', outcome: 'failed', icon: 'ShieldX' },
    'LOGOUT': { label: 'Logged Out', category: 'auth', outcome: 'info', icon: 'LogOut' },
    'AUTH_LOGOUT': { label: 'Logged Out', category: 'auth', outcome: 'info', icon: 'LogOut' },

    // Operations — Started
    'RENEWAL_STARTED': { label: 'Renewal Started', category: 'operations', outcome: 'started', icon: 'RefreshCw' },
    'SIGNAL_CHECK_STARTED': { label: 'Signal Check', category: 'operations', outcome: 'started', icon: 'Search' },
    'SIGNAL_REFRESH_STARTED': { label: 'Signal Refresh', category: 'operations', outcome: 'started', icon: 'Radio' },
    'SIGNAL_ACTIVATE_STARTED': { label: 'Signal Activation', category: 'operations', outcome: 'started', icon: 'Zap' },
    'INSTALLMENT_STARTED': { label: 'Installment Started', category: 'operations', outcome: 'started', icon: 'CreditCard' },
    'OPERATION_CREATED': { label: 'Operation Created', category: 'operations', outcome: 'info', icon: 'Plus' },
    'BULK_OPERATION_CREATED': { label: 'Bulk Operation Created', category: 'operations', outcome: 'info', icon: 'Layers' },
    'OPERATION_START': { label: 'Operation Started', category: 'operations', outcome: 'started', icon: 'Play' },

    // Operations — Completed/Failed/Cancelled
    'OPERATION_COMPLETE': { label: 'Operation Completed', category: 'operations', outcome: 'success', icon: 'CheckCircle' },
    'OPERATION_FAIL': { label: 'Operation Failed', category: 'operations', outcome: 'failed', icon: 'XCircle' },
    'OPERATION_CANCEL': { label: 'Operation Cancelled', category: 'operations', outcome: 'cancelled', icon: 'Ban' },
    'OPERATION_CANCELLED': { label: 'Operation Cancelled', category: 'operations', outcome: 'cancelled', icon: 'Ban' },
    'OPERATION_TIMEOUT': { label: 'Operation Timed Out', category: 'operations', outcome: 'failed', icon: 'Clock' },
    'OPERATION_EXPIRED_NO_HEARTBEAT': { label: 'Expired (No Heartbeat)', category: 'operations', outcome: 'failed', icon: 'HeartOff' },

    // Balance
    'ADMIN_ADD_BALANCE': { label: 'Balance Added', category: 'balance', outcome: 'success', icon: 'DollarSign' },
    'BALANCE_ADD': { label: 'Balance Added', category: 'balance', outcome: 'success', icon: 'DollarSign' },
    'BALANCE_WITHDRAW': { label: 'Balance Withdrawn', category: 'balance', outcome: 'info', icon: 'ArrowDownLeft' },
    'BALANCE_TRANSFER': { label: 'Balance Transfer', category: 'balance', outcome: 'info', icon: 'ArrowRightLeft' },
    'MANAGER_DEPOSIT_USER': { label: 'Manager Deposit', category: 'balance', outcome: 'success', icon: 'Wallet' },

    // Admin
    'ADMIN_CREATE_USER': { label: 'User Created', category: 'admin', outcome: 'success', icon: 'UserPlus' },
    'ADMIN_DELETE_USER': { label: 'User Deleted', category: 'admin', outcome: 'info', icon: 'UserMinus' },
    'ADMIN_RESET_PASSWORD': { label: 'Password Reset', category: 'admin', outcome: 'success', icon: 'KeyRound' },
    'ADMIN_UPDATE_SETTINGS': { label: 'Settings Updated', category: 'admin', outcome: 'success', icon: 'Settings' },
    'ADMIN_UPDATE_BEIN_CONFIG': { label: 'beIN Config Updated', category: 'admin', outcome: 'success', icon: 'Wrench' },
    'USER_CREATE': { label: 'User Created', category: 'admin', outcome: 'success', icon: 'UserPlus' },
    'USER_UPDATE': { label: 'User Updated', category: 'admin', outcome: 'info', icon: 'UserCog' },
    'USER_DELETE': { label: 'User Deleted', category: 'admin', outcome: 'info', icon: 'UserMinus' },
    'SETTINGS_UPDATE': { label: 'Settings Updated', category: 'admin', outcome: 'success', icon: 'Settings' },

    // Manager
    'MANAGER_CREATE_USER': { label: 'User Created', category: 'manager', outcome: 'success', icon: 'UserPlus' },
    'MANAGER_DELETE_USER': { label: 'User Deleted', category: 'manager', outcome: 'info', icon: 'UserMinus' },
    'MANAGER_RESET_PASSWORD': { label: 'Password Reset', category: 'manager', outcome: 'success', icon: 'KeyRound' },
    'MANAGER_ADD_USER': { label: 'User Added', category: 'manager', outcome: 'success', icon: 'UserPlus' },
    'MANAGER_REMOVE_USER': { label: 'User Removed', category: 'manager', outcome: 'info', icon: 'UserMinus' },
    'MANAGER_TRANSFER_BALANCE': { label: 'Balance Transfer', category: 'manager', outcome: 'info', icon: 'ArrowRightLeft' },

    // User
    'PASSWORD_CHANGED': { label: 'Password Changed', category: 'user', outcome: 'success', icon: 'KeyRound' },
    'PASSWORD_CHANGE': { label: 'Password Changed', category: 'user', outcome: 'success', icon: 'KeyRound' },
    'PASSWORD_RESET': { label: 'Password Reset', category: 'user', outcome: 'success', icon: 'KeyRound' },
}

// ===== FUNCTIONS =====

/**
 * Get info for an action string. Falls back to a generic entry for unknown actions.
 */
export function getActionInfo(action: string): ActionInfo {
    if (ACTION_MAP[action]) {
        return ACTION_MAP[action]
    }

    // Try to guess category from prefix
    if (action.startsWith('AUTH_')) return { label: action.replace('AUTH_', '').replace(/_/g, ' '), category: 'auth', outcome: 'info', icon: 'Shield' }
    if (action.startsWith('ADMIN_')) return { label: action.replace('ADMIN_', '').replace(/_/g, ' '), category: 'admin', outcome: 'info', icon: 'Shield' }
    if (action.startsWith('MANAGER_')) return { label: action.replace('MANAGER_', '').replace(/_/g, ' '), category: 'manager', outcome: 'info', icon: 'Users' }
    if (action.startsWith('OPERATION_')) return { label: action.replace('OPERATION_', '').replace(/_/g, ' '), category: 'operations', outcome: 'info', icon: 'Activity' }
    if (action.startsWith('BALANCE_')) return { label: action.replace('BALANCE_', '').replace(/_/g, ' '), category: 'balance', outcome: 'info', icon: 'DollarSign' }
    if (action.startsWith('SIGNAL_')) return { label: action.replace('SIGNAL_', '').replace(/_/g, ' '), category: 'operations', outcome: 'started', icon: 'Radio' }

    return { label: action.replace(/_/g, ' '), category: 'system', outcome: 'info', icon: 'Activity' }
}

/**
 * Format log details from raw JSON into a human-readable summary string.
 */
export function formatLogDetails(details: string | Record<string, unknown> | null | undefined, _action?: string): string {
    if (!details) return '—'

    let obj: Record<string, unknown>
    if (typeof details === 'string') {
        try {
            obj = JSON.parse(details)
        } catch {
            // If it's just a plain string (like "Check card 123"), return it cleaned
            return details
        }
    } else {
        obj = details as Record<string, unknown>
    }

    // Nothing meaningful
    if (Object.keys(obj).length === 0) return '—'

    const parts: string[] = []

    // Extract the most useful fields based on context
    // Card number
    const card = obj.cardNumber || obj.card || obj.subscriberNumber
    if (card) parts.push(`Card: ${card}`)

    // Operation type
    const opType = obj.operationType || obj.type
    if (opType) parts.push(`Type: ${opType}`)

    // Package / duration
    const pkg = obj.packageName || obj.package || obj.selectedPackage || obj.duration
    if (pkg) parts.push(`Package: ${pkg}`)

    // Amount
    const amount = obj.amount || obj.price || obj.totalAmount
    if (amount !== undefined && amount !== null) parts.push(`Amount: $${amount}`)

    // Username (for user management actions)
    const username = obj.username || obj.targetUsername || obj.newUsername
    if (username) parts.push(`User: ${username}`)

    // Email
    const email = obj.email || obj.targetEmail
    if (email && !username) parts.push(`Email: ${email}`)

    // Role
    const role = obj.role || obj.newRole
    if (role) parts.push(`Role: ${role}`)

    // Notes
    const notes = obj.notes || obj.reason || obj.message
    if (notes && typeof notes === 'string' && notes.length < 80) parts.push(notes)

    // Balance info
    const newBalance = obj.newBalance
    if (newBalance !== undefined) parts.push(`New Balance: $${newBalance}`)
    const managerNewBalance = obj.managerNewBalance
    if (managerNewBalance !== undefined) parts.push(`Manager Balance: $${managerNewBalance}`)

    // STB
    const stb = obj.stb || obj.stbNumber
    if (stb) parts.push(`STB: ${stb}`)

    // Status
    const status = obj.status
    if (status && typeof status === 'string') parts.push(`Status: ${status}`)

    // Refund
    const refundAmount = obj.refundAmount || obj.refundedAmount
    if (refundAmount !== undefined) parts.push(`Refunded: $${refundAmount}`)

    // If we extracted nothing useful, try a simple fallback
    if (parts.length === 0) {
        // Check if it's just a timestamp only — skip it
        const keys = Object.keys(obj).filter(k => k !== 'timestamp')
        if (keys.length === 0) return '—'

        // Show first 2 key-value pairs
        for (const key of keys.slice(0, 2)) {
            const val = obj[key]
            if (val !== null && val !== undefined && typeof val !== 'object') {
                parts.push(`${key}: ${val}`)
            }
        }
    }

    return parts.length > 0 ? parts.join(' · ') : '—'
}

// ===== FILTER GROUPS =====

export interface FilterOption {
    value: string
    label: string
}

export interface FilterGroup {
    label: string
    options: FilterOption[]
}

export const filterGroups: FilterGroup[] = [
    {
        label: 'Authentication',
        options: [
            { value: 'AUTH_LOGIN,LOGIN', label: 'Login' },
            { value: 'AUTH_FAILED', label: 'Login Failed' },
            { value: 'LOGOUT,AUTH_LOGOUT', label: 'Logout' },
        ]
    },
    {
        label: 'Operations',
        options: [
            { value: 'RENEWAL_STARTED', label: 'Renewal Started' },
            { value: 'OPERATION_COMPLETE', label: 'Operation Completed' },
            { value: 'OPERATION_CANCELLED,OPERATION_CANCEL', label: 'Operation Cancelled' },
            { value: 'OPERATION_TIMEOUT,OPERATION_EXPIRED_NO_HEARTBEAT,OPERATION_FAIL', label: 'Operation Failed / Timed Out' },
            { value: 'SIGNAL_CHECK_STARTED', label: 'Signal Check' },
            { value: 'SIGNAL_REFRESH_STARTED', label: 'Signal Refresh' },
            { value: 'SIGNAL_ACTIVATE_STARTED', label: 'Signal Activation' },
            { value: 'INSTALLMENT_STARTED', label: 'Installment' },
            { value: 'BULK_OPERATION_CREATED', label: 'Bulk Operation' },
        ]
    },
    {
        label: 'Balance',
        options: [
            { value: 'ADMIN_ADD_BALANCE,BALANCE_ADD', label: 'Balance Added' },
            { value: 'MANAGER_DEPOSIT_USER', label: 'Manager Deposit' },
        ]
    },
    {
        label: 'User Management',
        options: [
            { value: 'ADMIN_CREATE_USER,MANAGER_CREATE_USER,USER_CREATE', label: 'User Created' },
            { value: 'ADMIN_DELETE_USER,MANAGER_DELETE_USER', label: 'User Deleted' },
            { value: 'ADMIN_RESET_PASSWORD,MANAGER_RESET_PASSWORD,PASSWORD_RESET', label: 'Password Reset' },
        ]
    },
    {
        label: 'Settings',
        options: [
            { value: 'ADMIN_UPDATE_SETTINGS,SETTINGS_UPDATE', label: 'Settings Updated' },
            { value: 'ADMIN_UPDATE_BEIN_CONFIG', label: 'beIN Config Updated' },
            { value: 'PASSWORD_CHANGED,PASSWORD_CHANGE', label: 'Password Changed' },
        ]
    }
]
