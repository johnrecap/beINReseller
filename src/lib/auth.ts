import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { SECURITY_CONFIG } from "@/lib/config"
import { refreshSessionOnActivity } from "@/lib/session-refresh"

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            name: "credentials",
            credentials: {
                username: { label: "اسم المستخدم", type: "text" },
                password: { label: "كلمة المرور", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) {
                    throw new Error("الرجاء إدخال اسم المستخدم وكلمة المرور")
                }

                const username = credentials.username as string
                const password = credentials.password as string

                // Find user by username OR email
                const user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username },
                            { email: username }
                        ]
                    },
                })

                if (!user || !user.passwordHash) {
                    // Unified error for user enumeration protection
                    throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة")
                }

                // Check if user is active
                if (!user.isActive) {
                    throw new Error("الحساب معطل، تواصل مع الإدارة")
                }

                // Verify password
                const isValidPassword = await bcrypt.compare(password, user.passwordHash)
                if (!isValidPassword) {
                    // Unified error for user enumeration protection
                    throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة")
                }

                // Update last login
                await prisma.user.update({
                    where: { id: user.id },
                    data: { lastLoginAt: new Date() },
                })

                // Return user data for session
                return {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    balance: user.balance,
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            if (user) {
                token.id = user.id as string
                token.username = (user as { username: string }).username
                token.role = (user as { role: string }).role
                token.balance = (user as { balance: number }).balance
            }

            // Refresh logic
            if (trigger === 'update') {
                return { ...token, ...session }
            }

            return refreshSessionOnActivity(token)
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id as string
                session.user.username = token.username as string
                session.user.role = token.role as string
                session.user.balance = token.balance as number
            }
            return session
        },
    },
    pages: {
        signIn: "/login",
        error: "/login",
    },
    session: {
        strategy: "jwt",
        maxAge: SECURITY_CONFIG.sessionMaxAge,
        updateAge: 0, // Always update on access if we want aggressive sliding, but standard is fine
    },
    secret: process.env.NEXTAUTH_SECRET,
    trustHost: true,
})
