import { DefaultSession, DefaultUser } from "next-auth"
import { DefaultJWT } from "next-auth/jwt"

type AppRole = 'ADMIN' | 'MANAGER' | 'AGENT' | 'USER'

declare module "next-auth" {
    interface Session {
        user: {
            id: string
            username: string
            role: AppRole
            balance: number
            passwordChangedAt: number
        } & DefaultSession["user"]
    }

    interface User extends DefaultUser {
        username: string
        role: AppRole
        balance: number
        passwordChangedAt: number
    }
}

declare module "next-auth/jwt" {
    interface JWT extends DefaultJWT {
        id: string
        username: string
        role: AppRole
        balance: number
        passwordChangedAt: number
    }
}
