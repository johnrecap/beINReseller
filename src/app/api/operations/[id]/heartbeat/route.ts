/**
 * Operation Heartbeat API
 * 
 * Frontend sends heartbeat every 5 seconds to keep operation alive.
 * If no heartbeat received for 15 seconds, operation will be auto-cancelled.
 * 
 * This handles:
 * - Browser close
 * - Tab close
 * - Network disconnect
 * - User leaving page
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { OperationStatus } from '@prisma/client'

// Configuration
const HEARTBEAT_TTL_SECONDS = 15  // Operation expires after 15s without heartbeat

// Statuses that require heartbeat
const HEARTBEAT_REQUIRED_STATUSES: OperationStatus[] = [
    'AWAITING_PACKAGE',
    'AWAITING_FINAL_CONFIRM',
    'AWAITING_CAPTCHA'
]

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = await auth()
        
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        
        // Verify operation belongs to user and is in awaiting state
        const operation = await prisma.operation.findFirst({
            where: {
                id,
                userId: session.user.id,
                status: { in: HEARTBEAT_REQUIRED_STATUSES }
            },
            select: {
                id: true,
                status: true,
                beinAccountId: true
            }
        })
        
        if (!operation) {
            return NextResponse.json(
                { error: 'Operation not found or not in waiting state' },
                { status: 404 }
            )
        }
        
        const now = new Date()
        const expiryTime = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000)
        
        // Update heartbeat in database
        await prisma.operation.update({
            where: { id },
            data: {
                lastHeartbeat: now,
                heartbeatExpiry: expiryTime
            }
        })
        
        // Also store in Redis for fast checking by cleanup job
        await redis.setex(
            `operation:heartbeat:${id}`,
            HEARTBEAT_TTL_SECONDS + 5,  // Redis TTL slightly longer for safety
            JSON.stringify({
                timestamp: now.toISOString(),
                status: operation.status,
                beinAccountId: operation.beinAccountId
            })
        )
        
        return NextResponse.json({
            success: true,
            expiresAt: expiryTime.toISOString(),
            ttlSeconds: HEARTBEAT_TTL_SECONDS,
            status: operation.status
        })
        
    } catch (error) {
        console.error('[Heartbeat] Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * GET - Check heartbeat status (for debugging)
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = await auth()
        
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        
        const operation = await prisma.operation.findFirst({
            where: {
                id,
                userId: session.user.id
            },
            select: {
                id: true,
                status: true,
                lastHeartbeat: true,
                heartbeatExpiry: true
            }
        })
        
        if (!operation) {
            return NextResponse.json({ error: 'Operation not found' }, { status: 404 })
        }
        
        const now = new Date()
        const isExpired = operation.heartbeatExpiry 
            ? now > operation.heartbeatExpiry 
            : false
        
        return NextResponse.json({
            operationId: operation.id,
            status: operation.status,
            lastHeartbeat: operation.lastHeartbeat?.toISOString() || null,
            heartbeatExpiry: operation.heartbeatExpiry?.toISOString() || null,
            isExpired,
            requiresHeartbeat: HEARTBEAT_REQUIRED_STATUSES.includes(operation.status)
        })
        
    } catch (error) {
        console.error('[Heartbeat] GET Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
