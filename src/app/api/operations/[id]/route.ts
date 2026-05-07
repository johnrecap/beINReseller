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

const SENSITIVE_RESPONSE_KEYS = new Set([
    'sessionData',
    'cookies',
    'storageState',
    'viewState',
    '__VIEWSTATE',
    '__VIEWSTATEGENERATOR',
    '__EVENTVALIDATION',
])

function redactOperationResponseData(value: unknown): unknown {
    if (!value) return value

    if (typeof value === 'string') {
        try {
            return redactOperationResponseData(JSON.parse(value))
        } catch {
            return value
        }
    }

    if (Array.isArray(value)) {
        return value.map(item => redactOperationResponseData(item))
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([key]) => !SENSITIVE_RESPONSE_KEYS.has(key))
                .map(([key, entry]) => [key, redactOperationResponseData(entry)])
        )
    }

    return value
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Check authentication (supports both web session and mobile token)
        const authUser = await getAuthUser(request)
        if (!authUser?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params

        // Get operation
        const operation = await prisma.operation.findUnique({
            where: { id },
            select: {
                id: true,
                type: true,
                cardNumber: true,
                amount: true,
                status: true,
                responseMessage: true,
                responseData: true,  // Required for signal refresh card status
                stbNumber: true,
                createdAt: true,
                updatedAt: true,
                userId: true,
            },
        })

        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found' },
                { status: 404 }
            )
        }

        // Check ownership (user can only see their own operations)
        if (operation.userId !== authUser.id && authUser.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            )
        }

        // Remove userId from response
        const operationData = { ...operation }
        delete (operationData as { userId?: string }).userId

        return NextResponse.json({
            ...operationData,
            responseData: redactOperationResponseData(operationData.responseData),
        })

    } catch (error) {
        console.error('Get operation error:', error)
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        )
    }
}
