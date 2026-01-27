import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { generateMobileToken } from '@/lib/mobile-auth'
import { trackLogin } from '@/lib/services/activityTracker'

/**
 * POST /api/auth/mobile-login
 * 
 * Mobile-specific login endpoint that returns JWT token in response body.
 * This endpoint is designed for Flutter/mobile apps that can't use HTTP-only cookies.
 * 
 * Request Body:
 * {
 *   "username": "user123",  // Can be username OR email
 *   "password": "password123"
 * }
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "user": {
 *     "id": "clxxx...",
 *     "username": "user123",
 *     "email": "user@example.com",
 *     "role": "USER",
 *     "balance": 150.00
 *   }
 * }
 * 
 * Error Response (401):
 * {
 *   "success": false,
 *   "error": "اسم المستخدم أو كلمة المرور غير صحيحة"
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { username, password } = body

        // Validate input
        if (!username || !password) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'الرجاء إدخال اسم المستخدم وكلمة المرور'
                },
                { status: 400 }
            )
        }

        // Find user by username OR email
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: username },
                    { email: username }
                ]
            },
            include: {
                _count: {
                    select: { operations: true }
                }
            }
        })

        // User not found
        if (!user || !user.passwordHash) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
                },
                { status: 401 }
            )
        }

        // Check if user is active
        if (!user.isActive) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'الحساب معطل، تواصل مع الإدارة'
                },
                { status: 401 }
            )
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash)
        if (!isValidPassword) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
                },
                { status: 401 }
            )
        }

        // Prepare user data for token and response (full data for Flutter User model)
        const userData = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            balance: user.balance,
            isActive: user.isActive,
            lowBalanceAlert: user.lowBalanceAlert,
            createdAt: user.createdAt.toISOString(),
            lastLoginAt: user.lastLoginAt?.toISOString() || null,
            lastOperationAt: user.lastOperationAt?.toISOString() || null,
            loginCount: user.loginCount || 0,
            totalOperations: user._count?.operations || 0,
        }

        // Generate JWT token (expires in 7 days)
        const token = generateMobileToken(userData, '7d')

        // Track login activity
        try {
            await trackLogin({
                userId: user.id,
                // IP and user agent can be extracted from headers if needed
            })
        } catch (err) {
            // Don't fail login if tracking fails
            console.error('Failed to track mobile login:', err)
        }

        // Return success with token and user data
        return NextResponse.json({
            success: true,
            token,
            user: userData
        })

    } catch (error) {
        console.error('Mobile login error:', error)
        return NextResponse.json(
            {
                success: false,
                error: 'حدث خطأ أثناء تسجيل الدخول'
            },
            { status: 500 }
        )
    }
}
