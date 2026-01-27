import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getMobileUserFromRequest } from '@/lib/mobile-auth'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    const session = await auth()
    if (session?.user?.id) return session.user
    return getMobileUserFromRequest(request)
}

/**
 * GET /api/operations/[id]/captcha
 * Returns the CAPTCHA image and expiry time
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const { id } = await params

        const operation = await prisma.operation.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                status: true,
                captchaImage: true,
                captchaExpiry: true,
            },
        })

        if (!operation) {
            return NextResponse.json({ error: 'العملية غير موجودة' }, { status: 404 })
        }

        if (operation.userId !== authUser.id) {
            return NextResponse.json({ error: 'غير مصرح لك بالوصول لهذه العملية' }, { status: 403 })
        }

        if (operation.status !== 'AWAITING_CAPTCHA') {
            return NextResponse.json({ error: 'رقم التحقق غير مطلوب لهذه العملية' }, { status: 400 })
        }

        if (!operation.captchaImage) {
            return NextResponse.json({ error: 'صورة التحقق غير متوفرة' }, { status: 404 })
        }

        const expiryTime = operation.captchaExpiry ? new Date(operation.captchaExpiry).getTime() : 0
        const now = Date.now()
        const expiresIn = Math.max(0, Math.floor((expiryTime - now) / 1000))

        return NextResponse.json({
            captchaImage: operation.captchaImage,
            expiresIn: expiresIn
        })

    } catch (error) {
        console.error('Get CAPTCHA error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}

/**
 * POST /api/operations/[id]/captcha
 * Submits the CAPTCHA solution
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
        }

        const { id } = await params

        const body = await request.json()
        // Accept both 'solution' (backend standard) and 'captcha' (Flutter sends this)
        const { solution, captcha } = body
        const captchaSolution = solution || captcha

        if (!captchaSolution || typeof captchaSolution !== 'string') {
            return NextResponse.json({ error: 'رمز التحقق مطلوب' }, { status: 400 })
        }

        const operation = await prisma.operation.findUnique({
            where: { id },
            select: { id: true, userId: true, status: true }
        })

        if (!operation) {
            return NextResponse.json({ error: 'العملية غير موجودة' }, { status: 404 })
        }

        if (operation.userId !== authUser.id) {
            return NextResponse.json({ error: 'غير مصرح لك بهذه العملية' }, { status: 403 })
        }

        if (operation.status !== 'AWAITING_CAPTCHA') {
            return NextResponse.json({ error: 'هذه العملية لا تنتظر رمز تحقق' }, { status: 400 })
        }

        // Update with solution
        await prisma.operation.update({
            where: { id },
            data: { captchaSolution: captchaSolution }
        })

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Submit CAPTCHA error:', error)
        return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
    }
}
