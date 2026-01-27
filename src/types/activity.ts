/**
 * Activity Types - Shared types for activity tracking
 * 
 * This file contains client-safe types that can be imported by both
 * server and client components.
 */

import type { Role } from '@prisma/client'

// ===== ACTIVITY STATUS =====

export type ActivityStatusType = 'active' | 'recent' | 'warning' | 'inactive' | 'critical'

// ===== ACTIVITY ACTIONS =====

export type ActivityAction = 
    // Authentication
    | 'AUTH_LOGIN'
    | 'AUTH_LOGOUT'
    | 'AUTH_FAILED'
    // Operations
    | 'OPERATION_START'
    | 'OPERATION_COMPLETE'
    | 'OPERATION_FAIL'
    | 'OPERATION_CANCEL'
    // Balance
    | 'BALANCE_ADD'
    | 'BALANCE_WITHDRAW'
    | 'BALANCE_TRANSFER'
    // User Management
    | 'USER_CREATE'
    | 'USER_UPDATE'
    | 'USER_DELETE'
    | 'USER_RESTORE'
    | 'USER_ACTIVATE'
    | 'USER_DEACTIVATE'
    // Settings
    | 'SETTINGS_UPDATE'
    | 'PASSWORD_CHANGE'
    | 'PASSWORD_RESET'
    // Manager Actions
    | 'MANAGER_ADD_USER'
    | 'MANAGER_REMOVE_USER'
    | 'MANAGER_TRANSFER_BALANCE'
    // Legacy compatibility
    | 'LOGIN'
    | 'LOGOUT'

// ===== TRACKING PARAMS =====

export interface TrackLoginParams {
    userId: string
    ipAddress?: string | null
    userAgent?: string | null
    success?: boolean
}

export interface TrackOperationParams {
    userId: string
    operationId: string
    operationType: 'RENEW' | 'CHECK_BALANCE' | 'SIGNAL_REFRESH'
    status: 'start' | 'complete' | 'fail' | 'cancel'
    amount?: number
    metadata?: Record<string, unknown>
}

export interface TrackActivityParams {
    userId: string
    action: ActivityAction
    details?: Record<string, unknown>
    targetId?: string
    targetType?: string
    ipAddress?: string | null
    userAgent?: string | null
    duration?: number
}

// ===== ACTIVITY DATA TYPES =====

export interface ActivityLogEntry {
    id: string
    action: string
    details: unknown
    createdAt: Date
    ipAddress: string | null
    targetId: string | null
    targetType: string | null
}

export interface UserActivitySummary {
    lastLoginAt: Date | null
    lastOperationAt: Date | null
    loginCount: number
    totalOperations: number
    daysSinceLastLogin: number | null
    daysSinceLastOperation: number | null
    daysSinceLastActivity: number | null
    activityStatus: ActivityStatusType
    recentActivities: ActivityLogEntry[]
}

export interface InactiveUser {
    id: string
    username: string
    email: string
    role: Role
    lastLoginAt: Date | null
    lastOperationAt: Date | null
    daysSinceLastActivity: number
    loginCount: number
    totalOperations: number
    activityStatus: ActivityStatusType
    createdAt: Date
}

// ===== METRICS TYPES =====

export interface RoleMetrics {
    total: number
    active: number
    recent: number
    warning: number
    inactive: number
    critical: number
}

export interface InactivityMetrics {
    total: number
    active: number      // < 3 days
    recent: number      // 3-7 days
    warning: number     // 7-14 days
    inactive: number    // 14-30 days
    critical: number    // > 30 days
    byRole: {
        ADMIN: RoleMetrics
        MANAGER: RoleMetrics
        USER: RoleMetrics
    }
}

// ===== ACTIVITY THRESHOLDS =====

export const ACTIVITY_THRESHOLDS = {
    active: 3,      // < 3 days
    recent: 7,      // 3-7 days
    warning: 14,    // 7-14 days
    inactive: 30,   // 14-30 days
    critical: 60    // > 30 days
} as const
