import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

// Use authConfig which doesn't import Prisma, making it Edge-safe
export default NextAuth(authConfig).auth

export const config = {
    matcher: [
        // Match all routes except static files and api routes
        '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|api).*)',
    ],
}
