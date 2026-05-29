import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { decryptSecret } from '@/lib/crypto'
import { HttpsProxyAgent } from 'https-proxy-agent'
import axios from 'axios'

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
        const { host, port, username } = proxy as {
            host: string
            port: number
            username: string | null
        }
        const password = proxy.password ? decryptSecret(proxy.password) : null

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

            const response = await axios.get<{ ip: string }>('https://api.ipify.org?format=json', {
                httpsAgent: agent,
                proxy: false,
                timeout: 15000,
                validateStatus: status => status < 500,
            })

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = response.data
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

