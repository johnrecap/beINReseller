import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

// Use authConfig which doesn't import Prisma, making it Edge-safe
export default NextAuth(authConfig).auth

export const config = {
    matcher: [
        // Only protected panel pages need the edge session check. Public login
        // media must not rotate an old JWT after the login page signs it out.
        '/dashboard/:path*',
    ],
}
