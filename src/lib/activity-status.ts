/**
 * Activity Status Configuration
 * 
 * Defines the visual styling and labels for different activity status levels.
 */

export const ACTIVITY_STATUS = {
    active: {
        color: 'green',
        bgClass: 'bg-green-100 dark:bg-green-900/30',
        textClass: 'text-green-700 dark:text-green-400',
        borderClass: 'border-green-500',
        dotClass: 'bg-green-500',
        label: { ar: 'نشط', en: 'Active' },
        description: { ar: 'نشط خلال آخر 3 أيام', en: 'Active within last 3 days' },
        days: '< 3'
    },
    recent: {
        color: 'blue',
        bgClass: 'bg-blue-100 dark:bg-blue-900/30',
        textClass: 'text-blue-700 dark:text-blue-400',
        borderClass: 'border-blue-500',
        dotClass: 'bg-blue-500',
        label: { ar: 'نشاط حديث', en: 'Recent' },
        description: { ar: 'نشاط خلال آخر أسبوع', en: 'Activity within last week' },
        days: '3-7'
    },
    warning: {
        color: 'yellow',
        bgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
        textClass: 'text-yellow-700 dark:text-yellow-400',
        borderClass: 'border-yellow-500',
        dotClass: 'bg-yellow-500',
        label: { ar: 'تحذير', en: 'Warning' },
        description: { ar: 'غير نشط منذ أكثر من أسبوع', en: 'Inactive for over a week' },
        days: '7-14'
    },
    inactive: {
        color: 'orange',
        bgClass: 'bg-orange-100 dark:bg-orange-900/30',
        textClass: 'text-orange-700 dark:text-orange-400',
        borderClass: 'border-orange-500',
        dotClass: 'bg-orange-500',
        label: { ar: 'غير نشط', en: 'Inactive' },
        description: { ar: 'غير نشط منذ أكثر من أسبوعين', en: 'Inactive for over 2 weeks' },
        days: '14-30'
    },
    critical: {
        color: 'red',
        bgClass: 'bg-red-100 dark:bg-red-900/30',
        textClass: 'text-red-700 dark:text-red-400',
        borderClass: 'border-red-500',
        dotClass: 'bg-red-500',
        label: { ar: 'خامل', en: 'Critical' },
        description: { ar: 'غير نشط منذ أكثر من شهر', en: 'Inactive for over a month' },
        days: '> 30'
    }
} as const

export type ActivityStatusType = keyof typeof ACTIVITY_STATUS

/**
 * Activity thresholds in days
 */
export const ACTIVITY_THRESHOLDS = {
    active: 3,      // < 3 days = active
    recent: 7,      // 3-7 days = recent
    warning: 14,    // 7-14 days = warning
    inactive: 30,   // 14-30 days = inactive
    critical: 60    // > 30 days = critical
} as const

/**
 * Get status configuration by status type
 */
export function getStatusConfig(status: ActivityStatusType) {
    return ACTIVITY_STATUS[status]
}

/**
 * Get all statuses as array for iteration
 */
export function getStatusList() {
    return Object.entries(ACTIVITY_STATUS).map(([key, value]) => ({
        key: key as ActivityStatusType,
        ...value
    }))
}

/**
 * Get status color for charts (hex values)
 */
export const STATUS_CHART_COLORS: Record<ActivityStatusType, string> = {
    active: '#22c55e',   // green-500
    recent: '#3b82f6',   // blue-500
    warning: '#eab308',  // yellow-500
    inactive: '#f97316', // orange-500
    critical: '#ef4444'  // red-500
}

/**
 * Inactivity filter options for dropdowns
 */
export const INACTIVITY_FILTER_OPTIONS = [
    { value: 3, label: { ar: '3 أيام', en: '3 days' } },
    { value: 7, label: { ar: '7 أيام', en: '7 days' } },
    { value: 14, label: { ar: '14 يوم', en: '14 days' } },
    { value: 30, label: { ar: '30 يوم', en: '30 days' } },
    { value: 60, label: { ar: '60 يوم', en: '60 days' } },
    { value: 90, label: { ar: '90 يوم', en: '90 days' } }
] as const

/**
 * Action type labels for activity logs
 */
export const ACTION_LABELS: Record<string, { ar: string; en: string }> = {
    // Authentication
    AUTH_LOGIN: { ar: 'تسجيل دخول', en: 'Login' },
    AUTH_LOGOUT: { ar: 'تسجيل خروج', en: 'Logout' },
    AUTH_FAILED: { ar: 'فشل تسجيل الدخول', en: 'Login Failed' },
    LOGIN: { ar: 'تسجيل دخول', en: 'Login' },
    LOGOUT: { ar: 'تسجيل خروج', en: 'Logout' },
    
    // Operations
    OPERATION_START: { ar: 'بدء عملية', en: 'Operation Started' },
    OPERATION_COMPLETE: { ar: 'اكتمال عملية', en: 'Operation Completed' },
    OPERATION_FAIL: { ar: 'فشل عملية', en: 'Operation Failed' },
    OPERATION_CANCEL: { ar: 'Cancel عملية', en: 'Operation Cancelled' },
    
    // Balance
    BALANCE_ADD: { ar: 'إضافة رصيد', en: 'Balance Added' },
    BALANCE_WITHDRAW: { ar: 'سحب رصيد', en: 'Balance Withdrawn' },
    BALANCE_TRANSFER: { ar: 'تحويل رصيد', en: 'Balance Transfer' },
    ADMIN_ADD_BALANCE: { ar: 'إضافة رصيد (مدير)', en: 'Balance Added (Admin)' },
    MANAGER_DEPOSIT_USER: { ar: 'إيداع للمستخدم', en: 'User Deposit' },
    MANAGER_WITHDRAW_USER: { ar: 'سحب من المستخدم', en: 'User Withdrawal' },
    
    // User Management
    USER_CREATE: { ar: 'إنشاء مستخدم', en: 'User Created' },
    USER_UPDATE: { ar: 'تحديث مستخدم', en: 'User Updated' },
    USER_DELETE: { ar: 'حذف مستخدم', en: 'User Deleted' },
    USER_RESTORE: { ar: 'استعادة مستخدم', en: 'User Restored' },
    USER_ACTIVATE: { ar: 'تفعيل مستخدم', en: 'User Activated' },
    USER_DEACTIVATE: { ar: 'تعطيل مستخدم', en: 'User Deactivated' },
    
    // Settings
    SETTINGS_UPDATE: { ar: 'تحديث الإعدادات', en: 'Settings Updated' },
    PASSWORD_CHANGE: { ar: 'تغيير كلمة المرور', en: 'Password Changed' },
    PASSWORD_RESET: { ar: 'إعادة تعيين كلمة المرور', en: 'Password Reset' },
    
    // Manager Actions
    MANAGER_ADD_USER: { ar: 'إضافة مستخدم', en: 'User Added' },
    MANAGER_REMOVE_USER: { ar: 'إزالة مستخدم', en: 'User Removed' },
    MANAGER_TRANSFER_BALANCE: { ar: 'تحويل رصيد', en: 'Balance Transfer' }
}

/**
 * Get action label by action type and locale
 */
export function getActionLabel(action: string, locale: 'ar' | 'en' = 'en'): string {
    return ACTION_LABELS[action]?.[locale] || action
}

/**
 * Get activity status based on days since last activity
 */
export function getActivityStatus(days: number | null): ActivityStatusType {
    if (days === null || days < 0) return 'critical'
    if (days < ACTIVITY_THRESHOLDS.active) return 'active'
    if (days < ACTIVITY_THRESHOLDS.recent) return 'recent'
    if (days < ACTIVITY_THRESHOLDS.warning) return 'warning'
    if (days < ACTIVITY_THRESHOLDS.inactive) return 'inactive'
    return 'critical'
}

/**
 * Format days since last activity as human-readable string
 */
export function formatDaysSinceActivity(days: number | null, locale: 'ar' | 'en' = 'en'): string {
    if (days === null || days < 0) {
        return locale === 'ar' ? 'لم يسجل دخول' : 'Never logged in'
    }
    if (days === 0) {
        return locale === 'ar' ? 'اليوم' : 'Today'
    }
    if (days === 1) {
        return locale === 'ar' ? 'أمس' : 'Yesterday'
    }
    if (locale === 'ar') {
        return `${days} days ago`
    }
    return `${days} days ago`
}

export default {
    ACTIVITY_STATUS,
    ACTIVITY_THRESHOLDS,
    STATUS_CHART_COLORS,
    INACTIVITY_FILTER_OPTIONS,
    ACTION_LABELS,
    getStatusConfig,
    getStatusList,
    getActionLabel,
    getActivityStatus,
    formatDaysSinceActivity
}
