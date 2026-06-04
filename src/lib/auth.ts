import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { authConfig } from "@/lib/auth.config"
import { trackLogin } from "@/lib/services/activityTracker"
import { checkRateLimit } from "@/lib/rate-limiter"
import {
    buildLoginContextFingerprint,
    clearLoginAttemptWindow,
    getLoginAttemptContextFromRequest,
    getLoginAttemptStatus,
    normalizeSubmittedLoginName,
    recordFailedLoginAttempt,
    type LoginAttemptInput,
    type LoginFailureReason,
} from "@/lib/auth/login-attempts"
import { logLoginDiagnostic } from "@/lib/auth/login-diagnostics"

class PanelCredentialsSignin extends CredentialsSignin {
    code = "invalid_credentials"
}

class PanelCooldownSignin extends CredentialsSignin {
    code = "cooldown_active"
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            name: "credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials, request) {
                if (!credentials?.username || !credentials?.password) {
                    throw new PanelCredentialsSignin()
                }

                const username = normalizeSubmittedLoginName(credentials.username)
                const password = String(credentials.password)
                const requestContext = getLoginAttemptContextFromRequest(request)
                const attemptInput: LoginAttemptInput = {
                    loginName: username,
                    ...requestContext,
                }
                const contextFingerprint = buildLoginContextFingerprint(requestContext)

                const failLogin = async (
                    reasonCategory: LoginFailureReason,
                    matchedUserId: string | null = null
                ): Promise<never> => {
                    const result = await recordFailedLoginAttempt(attemptInput, reasonCategory)
                    logLoginDiagnostic({
                        reasonCategory,
                        exactLoginName: username,
                        matchedUserId,
                        contextFingerprint,
                        failedCount: result.failedCount,
                        cooldownUntil: result.status === "cooldown_active" ? result.cooldownUntil : null,
                    })
                    throw result.status === "cooldown_active"
                        ? new PanelCooldownSignin()
                        : new PanelCredentialsSignin()
                }

                if (!username || !password) {
                    await failLogin("missing_input")
                    return null
                }

                const activeCooldown = await getLoginAttemptStatus(attemptInput)
                if (activeCooldown.status === "cooldown_active") {
                    logLoginDiagnostic({
                        reasonCategory: "cooldown_active",
                        exactLoginName: username,
                        contextFingerprint,
                        failedCount: activeCooldown.failedCount,
                        cooldownUntil: activeCooldown.cooldownUntil,
                    })
                    throw new PanelCooldownSignin()
                }

                const abuseLimit = await checkRateLimit(
                    `panel-login-abuse:${requestContext.ip}`,
                    { limit: 60, windowSeconds: 60 }
                )
                if (!abuseLimit.success) {
                    logLoginDiagnostic({
                        reasonCategory: "unexpected_error",
                        exactLoginName: username,
                        contextFingerprint,
                    })
                    throw new PanelCredentialsSignin()
                }

                // Find user by username OR email
                const user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username },
                            { email: username }
                        ]
                    },
                })

                if (!user) {
                    await failLogin("unknown_login")
                    return null
                }

                if (!user.passwordHash) {
                    await failLogin("missing_password_hash", user.id)
                    return null
                }

                // Check if user is active
                if (!user.isActive) {
                    await failLogin("disabled_account", user.id)
                    return null
                }

                // Verify password
                const isValidPassword = await bcrypt.compare(password, user.passwordHash)
                if (!isValidPassword) {
                    await failLogin("wrong_password", user.id)
                    return null
                }

                await clearLoginAttemptWindow(attemptInput)

                // Track login activity (updates lastLoginAt, increments loginCount, logs activity)
                await trackLogin({
                    userId: user.id,
                    // Note: IP and user agent would need to be passed from middleware
                    // For now, we track the basic login event
                }).catch(err => {
                    // Don't fail login if tracking fails
                    console.error('Failed to track login:', err)
                })

                // Return user data for session
                return {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    balance: user.balance,
                    passwordChangedAt: user.passwordChangedAt?.getTime() || 0,
                }
            },
        }),
    ],
})
