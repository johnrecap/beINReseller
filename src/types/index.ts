// User types
// Note: Role is now primarily defined in src/lib/permissions.ts
// This is kept for backward compatibility
export type Role = 'ADMIN' | 'MANAGER' | 'USER'

export interface User {
    id: string
    username: string
    email: string
    role: Role
    balance: number
    isActive: boolean
    lowBalanceAlert: number
    createdAt: Date
    updatedAt: Date
    lastLoginAt: Date | null
}

// Operation types
export type OperationType = 'RENEW' | 'CHECK' | 'SIGNAL_REFRESH'
export type OperationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface Operation {
    id: string
    userId: string
    type: OperationType
    cardNumber: string
    duration: string | null
    amount: number
    status: OperationStatus
    responseMessage: string | null
    retryCount: number
    createdAt: Date
    updatedAt: Date
    completedAt: Date | null
}

// Transaction types
export type TransactionType = 'DEPOSIT' | 'WITHDRAW' | 'REFUND' | 'OPERATION_DEDUCT'

export interface Transaction {
    id: string
    userId: string
    adminId: string | null
    operationId: string | null
    amount: number
    balanceAfter: number
    type: TransactionType
    notes: string | null
    createdAt: Date
}

// Settings types
export interface Setting {
    id: string
    key: string
    value: string
    updatedAt: Date
}

export interface AppSettings {
    maintenance_mode: boolean
    maintenance_message: string
    notification_message: string
    renew_1_month_price: number
    renew_3_months_price: number
    renew_6_months_price: number
    renew_12_months_price: number
    check_balance_price: number
    signal_refresh_price: number
    max_retries: number
    low_balance_default: number
}

// API Response types
export interface ApiResponse<T = unknown> {
    success: boolean
    data?: T
    error?: string
    message?: string
}

export interface PaginatedResponse<T> {
    data: T[]
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
}

// Stats types
export interface UserStats {
    balance: number
    operationsToday: number
    lastOperation: Operation | null
}

export interface AdminStats {
    totalActiveResellers: number
    totalBalance: number
    operationsToday: number
    successRate: number
    recentOperations: Operation[]
    recentTransactions: Transaction[]
}

// Activity Log types
export interface ActivityLog {
    id: string
    userId: string
    action: string
    details: Record<string, unknown> | null
    ipAddress: string | null
    userAgent: string | null
    createdAt: Date
}
