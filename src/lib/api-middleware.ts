import { NextResponse, NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { checkRateLimit, RateLimitConfig, rateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limiter'
import { errorResponse, ERROR_MESSAGES } from '@/lib/api-response'
import { hasRole, RoleLevel } from '@/lib/auth-utils'

// Context type for App Router handlers
export interface RouteContext {
    params: Promise<Record<string, string | string[]>>
}

// Type for the wrapped handler (authenticated)
// Accepts: Request, Session, and optional Context
export type AuthorizedApiHandler = (
    req: NextRequest,
    session: Session,
    context?: RouteContext
) => Promise<NextResponse>

interface WithAuthOptions {
    requiredRole?: RoleLevel
}

/**
 * Middleware wrapper to enforce authentication and optional role check.
 * Catches ONLY auth errors. Propagates all other errors.
 * 
 * Usage:
 * export const GET = withAuth(async (req, session, context) => { ... })
 */
export function withAuth(
    handler: AuthorizedApiHandler,
    options: WithAuthOptions = {}
) {
    return async (req: NextRequest, context?: RouteContext) => {
        // 1. Check Authentication
        const session = await auth()
        if (!session?.user?.id) {
            return errorResponse(ERROR_MESSAGES.UNAUTHORIZED, 401, 'UNAUTHORIZED')
        }

        // 2. Check Role (Optional)
        if (options.requiredRole) {
            if (!hasRole(session.user.role, options.requiredRole)) {
                return errorResponse(ERROR_MESSAGES.FORBIDDEN, 403, 'FORBIDDEN')
            }
        }

        // 3. Call Handler with session
        return handler(req, session, context)
    }
}

/**
 * Middleware wrapper to enforce rate limiting.
 * Catches ONLY rate limit errors. Propagates all other errors.
 * 
 * Usage:
 * export const POST = withRateLimit(async (req) => { ... })
 * or
 * export const POST = withAuth(withRateLimit(async (req, session) => { ... }))
 */
export function withRateLimit<Args extends unknown[]>(
    handler: (req: NextRequest, ...args: Args) => Promise<NextResponse>,
    config: RateLimitConfig = RATE_LIMITS.api
) {
    return async (req: NextRequest, ...args: Args) => {
        // 1. Identify User/IP
        let identifier = 'anonymous'

        // Check if session is passed in args (if wrapped inside withAuth)
        const sessionArg = args.find(arg => arg && typeof arg === 'object' && arg !== null && 'user' in arg) as Session | undefined

        if (sessionArg?.user?.id) {
            identifier = `user:${sessionArg.user.id}`
        } else {
            // Fallback to IP from headers
            const forwardedFor = req.headers.get('x-forwarded-for')
            if (forwardedFor) {
                identifier = `ip:${forwardedFor.split(',')[0].trim()}`
            }
        }

        // 2. Check Limit
        const result = await checkRateLimit(identifier, config)

        if (!result.success) {
            const response = errorResponse(ERROR_MESSAGES.RATE_LIMITED, 429, 'RATE_LIMIT_EXCEEDED')
            const headers = rateLimitHeaders(result)
            Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v))
            return response
        }

        // 3. Call Handler
        const response = await handler(req, ...args)

        // 4. Add Rate Limit Headers to Success Response
        if (response instanceof NextResponse) {
            const headers = rateLimitHeaders(result)
            Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v))
        }

        return response
    }
}
