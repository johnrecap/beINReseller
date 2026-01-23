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

        // Get proxy config from database (new schema)
        const { host, port, username, password } = proxy as {
            host: string
            port: number
            username: string | null
            password: string | null
        }

        console.log(`Testing proxy: ${host}:${port}`)

        const start = Date.now()

        try {
            // Build curl command based on auth
            let curlCommand: string

            if (username && password) {
                // Authenticated proxy
                curlCommand = `curl -k -s -x "http://${username}:${password}@${host}:${port}" https://api.ipify.org?format=json --max-time 15`
            } else {
                // Unauthenticated proxy
                curlCommand = `curl -k -s -x "http://${host}:${port}" https://api.ipify.org?format=json --max-time 15`
            }

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
                error: `فشل الاتصال: ${errorMessage}`,
                duration: Date.now() - start
            })
        }

    } catch (error) {
        console.error('Test proxy error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

