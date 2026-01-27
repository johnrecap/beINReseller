/**
 * Activity Tracker Service
 * 
 * Comprehensive service for tracking user activity, detecting inactive accounts,
 * and generating engagement metrics.
 */

import prisma from '@/lib/prisma'
import { Prisma, Role } from '@prisma/client'

// ===== TYPES =====

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

export interface RoleMetrics {
    total: number
    active: number
    recent: number
    warning: number
    inactive: number
    critical: number
}

export type ActivityStatusType = 'active' | 'recent' | 'warning' | 'inactive' | 'critical'

// ===== THRESHOLDS =====

const ACTIVITY_THRESHOLDS = {
    active: 3,      // < 3 days
    recent: 7,      // 3-7 days
    warning: 14,    // 7-14 days
    inactive: 30,   // 14-30 days
    critical: 60    // > 30 days
} as const

// ===== CORE TRACKING FUNCTIONS =====

/**
 * Track user login - updates lastLoginAt, increments loginCount, logs activity
 */
export async function trackLogin(params: TrackLoginParams) {
    const { userId, ipAddress, userAgent, success = true } = params
    
    try {
        if (success) {
            // Update user login stats and create activity log atomically
            const [user] = await prisma.$transaction([
                prisma.user.update({
                    where: { id: userId },
                    data: {
                        lastLoginAt: new Date(),
                        loginCount: { increment: 1 }
                    }
                }),
                prisma.activityLog.create({
                    data: {
                        userId,
                        action: 'AUTH_LOGIN',
                        ipAddress: ipAddress || null,
                        userAgent: userAgent || null,
                        details: { timestamp: new Date().toISOString() }
                    }
                })
            ])
            return user
        } else {
            // Log failed attempt only (don't update user stats)
            await prisma.activityLog.create({
                data: {
                    userId,
                    action: 'AUTH_FAILED',
                    ipAddress: ipAddress || null,
                    userAgent: userAgent || null,
                    details: { 
                        timestamp: new Date().toISOString(), 
                        reason: 'Invalid credentials' 
                    }
                }
            })
            return null
        }
    } catch (error) {
        console.error('Error tracking login:', error)
        throw error
    }
}

/**
 * Track operation lifecycle - start, complete, fail, cancel
 */
export async function trackOperation(params: TrackOperationParams) {
    const { userId, operationId, operationType, status, amount, metadata } = params
    
    const actionMap = {
        start: 'OPERATION_START',
        complete: 'OPERATION_COMPLETE',
        fail: 'OPERATION_FAIL',
        cancel: 'OPERATION_CANCEL'
    } as const
    
    const action = actionMap[status]
    
    try {
        // Only update user stats on completion
        if (status === 'complete') {
            await prisma.$transaction([
                prisma.user.update({
                    where: { id: userId },
                    data: {
                        lastOperationAt: new Date(),
                        totalOperations: { increment: 1 }
                    }
                }),
                prisma.activityLog.create({
                    data: {
                        userId,
                        action,
                        targetId: operationId,
                        targetType: 'Operation',
                        details: { operationType, amount, ...metadata }
                    }
                })
            ])
        } else {
            // Just log the activity without updating stats
            await prisma.activityLog.create({
                data: {
                    userId,
                    action,
                    targetId: operationId,
                    targetType: 'Operation',
                    details: { operationType, status, amount, ...metadata }
                }
            })
        }
    } catch (error) {
        console.error('Error tracking operation:', error)
        throw error
    }
}

/**
 * Generic activity tracking for any action type
 */
export async function trackActivity(params: TrackActivityParams) {
    const { userId, action, details, targetId, targetType, ipAddress, userAgent, duration } = params
    
    try {
        await prisma.activityLog.create({
            data: {
                userId,
                action,
                details: details as Prisma.InputJsonValue | undefined,
                targetId: targetId || null,
                targetType: targetType || null,
                ipAddress: ipAddress || null,
                userAgent: userAgent || null,
                duration: duration || null
            }
        })
    } catch (error) {
        console.error('Error tracking activity:', error)
        throw error
    }
}

// ===== ACTIVITY SUMMARY FUNCTIONS =====

/**
 * Get comprehensive activity summary for a user
 */
export async function getUserActivitySummary(userId: string): Promise<UserActivitySummary> {
    const [user, recentLogs] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                lastLoginAt: true,
                lastOperationAt: true,
                loginCount: true,
                totalOperations: true
            }
        }),
        prisma.activityLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                action: true,
                details: true,
                createdAt: true,
                ipAddress: true,
                targetId: true,
                targetType: true
            }
        })
    ])
    
    if (!user) {
        throw new Error('User not found')
    }
    
    const now = new Date()
    const daysSinceLastLogin = user.lastLoginAt
        ? Math.floor((now.getTime() - user.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24))
        : null
    const daysSinceLastOperation = user.lastOperationAt
        ? Math.floor((now.getTime() - user.lastOperationAt.getTime()) / (1000 * 60 * 60 * 24))
        : null
    
    // Get the most recent activity (login or operation)
    const lastActivity = getLastActivityDate(user.lastLoginAt, user.lastOperationAt)
    const daysSinceLastActivity = lastActivity
        ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : null
    
    return {
        lastLoginAt: user.lastLoginAt,
        lastOperationAt: user.lastOperationAt,
        loginCount: user.loginCount,
        totalOperations: user.totalOperations,
        daysSinceLastLogin,
        daysSinceLastOperation,
        daysSinceLastActivity,
        activityStatus: getActivityStatus(daysSinceLastActivity),
        recentActivities: recentLogs
    }
}

// ===== INACTIVE USERS FUNCTIONS =====

/**
 * Get list of inactive users based on configurable criteria
 */
export async function getInactiveUsers(params: {
    inactiveDays?: number
    role?: Role
    page?: number
    limit?: number
    sortBy?: 'lastLogin' | 'lastOperation' | 'createdAt'
    sortOrder?: 'asc' | 'desc'
    search?: string
}): Promise<{ users: InactiveUser[]; total: number }> {
    const {
        inactiveDays = 30,
        role,
        page = 1,
        limit = 20,
        sortBy = 'lastLogin',
        sortOrder = 'asc',
        search
    } = params
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays)
    
    // Build where clause
    const where: Prisma.UserWhereInput = {
        isActive: true,
        deletedAt: null,
        OR: [
            { 
                AND: [
                    { lastLoginAt: { lt: cutoffDate } },
                    { 
                        OR: [
                            { lastOperationAt: { lt: cutoffDate } },
                            { lastOperationAt: null }
                        ]
                    }
                ]
            },
            { 
                AND: [
                    { lastLoginAt: null },
                    { 
                        OR: [
                            { lastOperationAt: { lt: cutoffDate } },
                            { lastOperationAt: null }
                        ]
                    }
                ]
            }
        ]
    }
    
    if (role) {
        where.role = role
    }
    
    if (search) {
        where.AND = [
            {
                OR: [
                    { username: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } }
                ]
            }
        ]
    }
    
    // Build orderBy
    const orderByMap: Record<string, Prisma.UserOrderByWithRelationInput> = {
        lastLogin: { lastLoginAt: sortOrder },
        lastOperation: { lastOperationAt: sortOrder },
        createdAt: { createdAt: sortOrder }
    }
    
    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                lastLoginAt: true,
                lastOperationAt: true,
                loginCount: true,
                totalOperations: true,
                createdAt: true
            },
            orderBy: orderByMap[sortBy],
            skip: (page - 1) * limit,
            take: limit
        }),
        prisma.user.count({ where })
    ])
    
    const now = new Date()
    
    return {
        users: users.map(user => {
            const lastActivity = getLastActivityDate(user.lastLoginAt, user.lastOperationAt)
            const daysSinceLastActivity = lastActivity
                ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
                : -1 // -1 indicates never active
            
            return {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                lastLoginAt: user.lastLoginAt,
                lastOperationAt: user.lastOperationAt,
                daysSinceLastActivity,
                loginCount: user.loginCount,
                totalOperations: user.totalOperations,
                activityStatus: getActivityStatus(daysSinceLastActivity === -1 ? null : daysSinceLastActivity),
                createdAt: user.createdAt
            }
        }),
        total
    }
}

/**
 * Calculate comprehensive inactivity metrics across all users
 */
export async function calculateInactivityMetrics(): Promise<InactivityMetrics> {
    const now = new Date()
    
    // Calculate threshold dates
    const dates = {
        active: new Date(now.getTime() - ACTIVITY_THRESHOLDS.active * 24 * 60 * 60 * 1000),
        recent: new Date(now.getTime() - ACTIVITY_THRESHOLDS.recent * 24 * 60 * 60 * 1000),
        warning: new Date(now.getTime() - ACTIVITY_THRESHOLDS.warning * 24 * 60 * 60 * 1000),
        inactive: new Date(now.getTime() - ACTIVITY_THRESHOLDS.inactive * 24 * 60 * 60 * 1000),
        critical: new Date(now.getTime() - ACTIVITY_THRESHOLDS.critical * 24 * 60 * 60 * 1000)
    }
    
    // Get all active users with their last activity
    const users = await prisma.user.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
            id: true,
            role: true,
            lastLoginAt: true,
            lastOperationAt: true
        }
    })
    
    const metrics: InactivityMetrics = {
        total: users.length,
        active: 0,
        recent: 0,
        warning: 0,
        inactive: 0,
        critical: 0,
        byRole: {
            ADMIN: { total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0 },
            MANAGER: { total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0 },
            USER: { total: 0, active: 0, recent: 0, warning: 0, inactive: 0, critical: 0 }
        }
    }
    
    for (const user of users) {
        const lastActivity = getLastActivityDate(user.lastLoginAt, user.lastOperationAt)
        const status = getActivityStatusFromDate(lastActivity, dates)
        
        metrics[status]++
        metrics.byRole[user.role].total++
        metrics.byRole[user.role][status]++
    }
    
    return metrics
}

/**
 * Get activity trend data for charts
 */
export async function getActivityTrends(days: number = 30): Promise<{
    loginsByDay: { date: string; count: number }[]
    operationsByDay: { date: string; count: number }[]
    topActiveUsers: Array<{
        id: string
        username: string
        role: Role
        loginCount: number
        totalOperations: number
        lastLoginAt: Date | null
        lastOperationAt: Date | null
    }>
}> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    
    const [loginsByDay, operationsByDay, topActiveUsers] = await Promise.all([
        // Logins per day
        prisma.$queryRaw<{ date: Date; count: bigint }[]>`
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM activity_logs
            WHERE action IN ('AUTH_LOGIN', 'LOGIN')
            AND created_at >= ${startDate}
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `,
        
        // Operations per day (completed only)
        prisma.$queryRaw<{ date: Date; count: bigint }[]>`
            SELECT DATE(completed_at) as date, COUNT(*) as count
            FROM operations
            WHERE status = 'COMPLETED'
            AND completed_at >= ${startDate}
            AND completed_at IS NOT NULL
            GROUP BY DATE(completed_at)
            ORDER BY date ASC
        `,
        
        // Top 10 most active users (excluding admins)
        prisma.user.findMany({
            where: {
                isActive: true,
                deletedAt: null,
                role: { not: 'ADMIN' }
            },
            orderBy: [
                { totalOperations: 'desc' },
                { loginCount: 'desc' }
            ],
            take: 10,
            select: {
                id: true,
                username: true,
                role: true,
                loginCount: true,
                totalOperations: true,
                lastLoginAt: true,
                lastOperationAt: true
            }
        })
    ])
    
    return {
        loginsByDay: loginsByDay.map(r => ({
            date: r.date.toISOString().split('T')[0],
            count: Number(r.count)
        })),
        operationsByDay: operationsByDay.map(r => ({
            date: r.date.toISOString().split('T')[0],
            count: Number(r.count)
        })),
        topActiveUsers
    }
}

// ===== HELPER FUNCTIONS =====

/**
 * Get the most recent activity date between login and operation
 */
function getLastActivityDate(lastLogin: Date | null, lastOperation: Date | null): Date | null {
    if (!lastLogin && !lastOperation) return null
    if (!lastLogin) return lastOperation
    if (!lastOperation) return lastLogin
    return lastLogin > lastOperation ? lastLogin : lastOperation
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
 * Get activity status based on last activity date and threshold dates
 */
function getActivityStatusFromDate(
    lastActivity: Date | null,
    dates: Record<string, Date>
): ActivityStatusType {
    if (!lastActivity) return 'critical'
    if (lastActivity >= dates.active) return 'active'
    if (lastActivity >= dates.recent) return 'recent'
    if (lastActivity >= dates.warning) return 'warning'
    if (lastActivity >= dates.inactive) return 'inactive'
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
        return `منذ ${days} يوم`
    }
    return `${days} days ago`
}

export default {
    trackLogin,
    trackOperation,
    trackActivity,
    getUserActivitySummary,
    getInactiveUsers,
    calculateInactivityMetrics,
    getActivityTrends,
    getActivityStatus,
    formatDaysSinceActivity
}
