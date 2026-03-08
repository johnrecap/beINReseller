import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { HttpsProxyAgent } from 'https-proxy-agent'

interface RouteParams {
    params: Promise<{ id: string }>
}

// POST /api/admin/proxies/[id]/test - Test proxy connection
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { id } = await params
        const proxy = await prisma.proxy.findUnique({
            where: { id }
        })

        if (!proxy) {
            return NextResponse.json({ error: 'Proxy not found' }, { status: 404 })
        }

        // Get proxy config from database
        const { host, port, username, password } = proxy as {
            host: string
            port: number
            username: string | null
            password: string | null
        }

        // SECURITY: Validate host — only allow hostname/IP characters
        if (!/^[a-zA-Z0-9.\-]+$/.test(host)) {
            return NextResponse.json({ error: 'Invalid proxy host' }, { status: 400 })
        }

        // SECURITY: Validate port — must be a valid port number
        if (!port || port < 1 || port > 65535) {
            return NextResponse.json({ error: 'Invalid proxy port' }, { status: 400 })
        }

        console.log(`Testing proxy: ${host}:${port}`)

        const start = Date.now()

        try {
            // Build proxy URL safely with proper encoding
            const proxyUrl = username && password
                ? `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`
                : `http://${host}:${port}`

            const agent = new HttpsProxyAgent(proxyUrl)

            // Use AbortController for timeout instead of shell --max-time
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 15000)

            const response = await fetch('https://api.ipify.org?format=json', {
                agent,
                signal: controller.signal,
            } as RequestInit)
            clearTimeout(timeout)

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = await response.json() as { ip: string }
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
                result: {
                    ip,
                    duration,
                    host,
                    port,
                    hasAuth: !!(username && password)
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
                error: `Connection failed: ${errorMessage}`,
                duration: Date.now() - start
            })
        }

    } catch (error) {
        console.error('Test proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

