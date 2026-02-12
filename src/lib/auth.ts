import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { authConfig } from "@/lib/auth.config"
import { trackLogin } from "@/lib/services/activityTracker"

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            name: "credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) {
                    throw new Error("Please enter username and password")
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
                    throw new Error("Invalid username or password")
                }

                // Check if user is active
                if (!user.isActive) {
                    throw new Error("Account is disabled, contact administration")
                }

                // Verify password
                const isValidPassword = await bcrypt.compare(password, user.passwordHash)
                if (!isValidPassword) {
                    throw new Error("Invalid username or password")
                }

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
                }
            },
        }),
    ],
})
