import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'

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

        // Construct proxy URL
        const host = process.env.PROXY_HOST || 'brd.superproxy.io'
        const port = process.env.PROXY_PORT || '33335'
        const username = process.env.PROXY_USERNAME
        const password = process.env.PROXY_PASSWORD

        if (!username || !password) {
            return NextResponse.json({ error: 'إعدادات البروكسي غير مكتملة في السيرفر' }, { status: 500 })
        }

        // Construct session-based username
        // Format: username-session-sessionId
        // Note: Session ID must not contain hyphens (causes 407), replace with underscores
        const sanitizedSessionId = proxy.sessionId.replace(/-/g, '_')
        const sessionUsername = `${username}-session-${sanitizedSessionId}`
        const proxyUrl = `http://${sessionUsername}:${password}@${host}:${port}`

        console.log(`Testing proxy: ${proxy.sessionId} -> ${host}:${port}`)

        const start = Date.now()

        try {
            const proxyAgent = new HttpsProxyAgent(proxyUrl, {
                rejectUnauthorized: false // Skip SSL verification for proxy
            })

            // ipify to check IP  
            const res = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent,
                timeout: 10000, // 10s timeout
                proxy: false // Disable axios built-in proxy to use our agent
            })

            const duration = Date.now() - start
            const ip = res.data.ip

            // Update proxy stats
            await prisma.proxy.update({
                where: { id },
                data: {
                    lastTestedAt: new Date(),
                    lastIp: ip,
                    responseTimeMs: duration,
                    failureCount: 0 // Reset failures on success
                }
            })

            return NextResponse.json({
                success: true,
                result: {
                    ip,
                    duration,
                    sessionId: proxy.sessionId
                }
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
