import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export default auth((req) => {
    const { nextUrl } = req
    const user = req.auth?.user
    const pathname = nextUrl.pathname

    // Public routes - no protection needed
    const publicRoutes = ['/login', '/register', '/forgot-password', '/']
    if (publicRoutes.some(route => pathname === route)) {
        return NextResponse.next()
    }

    // API routes are protected at the API level
    if (pathname.startsWith('/api')) {
        return NextResponse.next()
    }

    // If not logged in, redirect to login
    if (!user) {
        return NextResponse.redirect(new URL('/login', nextUrl))
    }

    const userRole = user.role as string

    // Admin routes - ADMIN only
    if (pathname.startsWith('/dashboard/admin')) {
        if (userRole !== 'ADMIN') {
            return NextResponse.redirect(new URL('/dashboard', nextUrl))
        }
    }

    // Manager routes - MANAGER or ADMIN only
    if (pathname.startsWith('/dashboard/manager')) {
        if (userRole !== 'MANAGER' && userRole !== 'ADMIN') {
            return NextResponse.redirect(new URL('/dashboard', nextUrl))
        }
    }

    return NextResponse.next()
})

export const config = {
    matcher: [
        // Match all routes except static files and api routes
        '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
    ],
}
