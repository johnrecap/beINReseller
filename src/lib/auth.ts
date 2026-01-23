import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { authConfig } from "@/lib/auth.config"

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
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
                    throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة")
                }

                // Check if user is active
                if (!user.isActive) {
                    throw new Error("الحساب معطل، تواصل مع الإدارة")
                }

                // Verify password
                const isValidPassword = await bcrypt.compare(password, user.passwordHash)
                if (!isValidPassword) {
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
})
