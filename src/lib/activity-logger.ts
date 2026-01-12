import prisma from './prisma'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any

type ActivityAction =
    | 'LOGIN'
    | 'LOGOUT'
    | 'OPERATION_CREATE'
    | 'OPERATION_COMPLETE'
    | 'BALANCE_ADD'
    | 'USER_CREATE'
    | 'USER_UPDATE'
    | 'SETTINGS_UPDATE'
    | 'PASSWORD_CHANGE'

export async function logActivity(
    userId: string,
    action: ActivityAction,
    details?: JsonValue,
    request?: Request
) {
    try {
        await prisma.activityLog.create({
            data: {
                userId,
                action,
                details,
                ipAddress: request?.headers.get('x-forwarded-for') || null,
                userAgent: request?.headers.get('user-agent') || null,
            },
        })
    } catch (error) {
        console.error('Failed to log activity:', error)
    }
}

export default logActivity
