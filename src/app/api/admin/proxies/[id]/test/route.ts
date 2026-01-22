import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface RouteParams {
    params: Promise<{ id: string }>
}

// POST /api/admin/proxies/[id]/test - Test proxy connection
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await auth()

        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const proxy = await prisma.proxy.findUnique({
            where: { id }
        })

        if (!proxy) {
            return NextResponse.json({ error: 'البروكسي غير موجود' }, { status: 404 })
        }

        // Get proxy config from env
        const host = process.env.PROXY_HOST || 'brd.superproxy.io'
        const port = process.env.PROXY_PORT || '33335'
        const username = process.env.PROXY_USERNAME
        const password = process.env.PROXY_PASSWORD

        if (!username || !password) {
            return NextResponse.json({ error: 'إعدادات البروكسي غير مكتملة في السيرفر' }, { status: 500 })
        }

        // Build session username (replace hyphens with underscores to avoid 407)
        const sanitizedSessionId = proxy.sessionId.replace(/-/g, '_')
        const sessionUsername = `${username}-session-${sanitizedSessionId}`

        console.log(`Testing proxy: ${proxy.sessionId} -> ${host}:${port}`)

        const start = Date.now()

        try {
            // Use curl command - we know this works!
            const curlCommand = `curl -k -s -x "http://${sessionUsername}:${password}@${host}:${port}" https://api.ipify.org?format=json --max-time 15`

            const { stdout, stderr } = await execAsync(curlCommand)

            if (stderr && !stdout) {
                throw new Error(stderr)
            }

            const data = JSON.parse(stdout.trim()) as { ip: string }
            const duration = Date.now() - start
            const ip = data.ip

            // Update proxy stats on success
            await prisma.proxy.update({
                where: { id },
                data: {
                    lastTestedAt: new Date(),
                    lastIp: ip,
                    responseTimeMs: duration,
                    failureCount: 0
                }
            })

            return NextResponse.json({
                success: true,
                result: { ip, duration, sessionId: proxy.sessionId }
            })

        } catch (connError: unknown) {
            const errorMessage = connError instanceof Error ? connError.message : 'Unknown error'
            console.error('Proxy connection error:', errorMessage)

            // Update failure count
            await prisma.proxy.update({
                where: { id },
                data: {
                    lastTestedAt: new Date(),
                    failureCount: { increment: 1 }
                }
            })

            return NextResponse.json({
                success: false,
                error: `فشل الاتصال: ${errorMessage}`,
                duration: Date.now() - start
            })
        }

    } catch (error) {
        console.error('Test proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
