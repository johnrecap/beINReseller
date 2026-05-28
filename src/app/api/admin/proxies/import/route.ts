import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import { encryptSecret } from '@/lib/crypto'
import {
    buildProxyImportPreview,
    DEFAULT_PROXY_IMPORT_LABEL_PREFIX,
    MAX_PROXY_IMPORT_ROWS,
} from '@/lib/proxies/bulk-import'

const MAX_IMPORT_TEXT_LENGTH = 80_000

function isUniqueConstraintError(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const body = await request.json()
        const mode = body?.mode
        const text = body?.text
        const labelPrefix = typeof body?.labelPrefix === 'string'
            ? body.labelPrefix
            : DEFAULT_PROXY_IMPORT_LABEL_PREFIX
        const isActive = body?.isActive !== false

        if (mode !== 'preview' && mode !== 'commit') {
            return NextResponse.json({ error: 'Invalid import mode' }, { status: 400 })
        }

        if (typeof text !== 'string' || text.trim().length === 0) {
            return NextResponse.json({ error: 'Proxy list is required' }, { status: 400 })
        }

        if (text.length > MAX_IMPORT_TEXT_LENGTH) {
            return NextResponse.json({ error: 'Proxy list is too large' }, { status: 400 })
        }

        const existingProxies = await prisma.proxy.findMany({
            select: {
                host: true,
                port: true,
                label: true,
            },
        })

        const preview = buildProxyImportPreview({
            text,
            existingProxies,
            existingLabels: existingProxies.map(proxy => proxy.label),
            labelPrefix,
            maxRows: MAX_PROXY_IMPORT_ROWS,
        })

        if (mode === 'preview') {
            return NextResponse.json({
                success: true,
                summary: preview.summary,
                validRows: preview.validRows,
                duplicates: preview.duplicates,
                invalidRows: preview.invalidRows,
            })
        }

        if (preview.rowsForImport.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No valid proxies to import',
                summary: preview.summary,
                duplicates: preview.duplicates,
                invalidRows: preview.invalidRows,
            }, { status: 400 })
        }

        try {
            const created = await prisma.$transaction(
                preview.rowsForImport.map(row => prisma.proxy.create({
                    data: {
                        host: row.host,
                        port: row.port,
                        username: row.username || null,
                        password: row.password ? encryptSecret(row.password) : null,
                        label: row.label,
                        isActive,
                    },
                    select: {
                        id: true,
                        host: true,
                        port: true,
                        username: true,
                        password: true,
                        label: true,
                        isActive: true,
                        createdAt: true,
                    },
                }))
            )

            return NextResponse.json({
                success: true,
                summary: {
                    totalLines: preview.summary.totalLines,
                    blankLines: preview.summary.blankLines,
                    importedCount: created.length,
                    duplicateCount: preview.summary.duplicateCount,
                    invalidCount: preview.summary.invalidCount,
                },
                createdProxies: created.map(proxy => ({
                    id: proxy.id,
                    host: proxy.host,
                    port: proxy.port,
                    username: proxy.username,
                    hasPassword: !!proxy.password,
                    label: proxy.label,
                    isActive: proxy.isActive,
                    createdAt: proxy.createdAt,
                    accountsCount: 0,
                })),
                duplicates: preview.duplicates,
                invalidRows: preview.invalidRows,
            })
        } catch (error) {
            if (isUniqueConstraintError(error)) {
                return NextResponse.json({
                    success: false,
                    error: 'Some proxies were added by another request. Refresh preview and try again.',
                }, { status: 409 })
            }

            throw error
        }
    } catch (error) {
        console.error('Bulk proxy import error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
