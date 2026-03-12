import type { NextAuthConfig } from "next-auth"
import { SECURITY_CONFIG } from "@/lib/config"

export const authConfig = {
    pages: {
        signIn: "/login",
        error: "/login",
    },
    session: {
        strategy: "jwt",
        maxAge: SECURITY_CONFIG.sessionMaxAge,
        updateAge: 0,
    },
    providers: [], // Providers added in auth.ts
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user
            const isOnDashboard = nextUrl.pathname.startsWith('/dashboard')
            const isOnAuth = nextUrl.pathname.startsWith('/login')

            if (isOnDashboard) {
                if (isLoggedIn) return true
                return false // Redirect unauthenticated users to login page
            }

            if (isOnAuth) {
                if (isLoggedIn) {
                    return Response.redirect(new URL('/dashboard', nextUrl))
                }
                return true
            }

            return true
        },
        async jwt({ token, user, trigger, session }) {
            if (user) {
                token.id = user.id as string
                token.username = (user as { username?: string }).username ?? ''
                token.role = (user as { role?: string }).role ?? ''
                token.balance = (user as { balance?: number }).balance ?? 0
                token.passwordChangedAt = (user as { passwordChangedAt?: number }).passwordChangedAt ?? 0
            }

            if (trigger === 'update') {
                return { ...token, ...session }
            }

            return token
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id as string
                session.user.username = token.username as string
                session.user.role = token.role as string
                session.user.balance = token.balance as number
                session.user.passwordChangedAt = token.passwordChangedAt as number
            }
            return session
        },
    },
    trustHost: true,
} satisfies NextAuthConfig
