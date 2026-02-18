import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'

interface RouteParams {
    params: Promise<{ path: string[] }>
}

const ALLOWED_FOLDERS = new Set(['products', 'categories', 'announcements'])

function getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
    if (ext === '.png') return 'image/png'
    if (ext === '.webp') return 'image/webp'
    if (ext === '.gif') return 'image/gif'
    if (ext === '.svg') return 'image/svg+xml'
    return 'application/octet-stream'
}

function resolveUploadRoots(): string[] {
    const cwd = process.cwd()
    const candidates = [
        cwd,
        path.join(cwd, 'bein-reseller-panel1')
    ]

    const roots = candidates.filter((root) =>
        existsSync(path.join(root, 'public', 'uploads'))
    )

    return roots.length > 0 ? Array.from(new Set(roots)) : [cwd]
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { path: parts } = await params

        if (!Array.isArray(parts) || parts.length < 2) {
            return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
        }

        if (parts.some((part) => !part || part.includes('..') || part.includes('\\'))) {
            return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
        }

        if (!ALLOWED_FOLDERS.has(parts[0])) {
            return NextResponse.json({ error: 'Invalid upload folder' }, { status: 400 })
        }

        const roots = resolveUploadRoots()
        for (const root of roots) {
            const baseDir = path.join(root, 'public', 'uploads')
            const candidatePath = path.join(baseDir, ...parts)

            const normalizedBase = path.resolve(baseDir) + path.sep
            const normalizedCandidate = path.resolve(candidatePath)
            if (!normalizedCandidate.startsWith(normalizedBase)) {
                continue
            }

            if (!existsSync(normalizedCandidate)) {
                continue
            }

            const buffer = await readFile(normalizedCandidate)
            return new NextResponse(buffer, {
                headers: {
                    'Content-Type': getContentType(normalizedCandidate),
                    'Cache-Control': 'public, max-age=3600'
                }
            })
        }

        return NextResponse.json({ error: 'File not found' }, { status: 404 })
    } catch (error) {
        console.error('Upload file serve error:', error)
        return NextResponse.json({ error: 'Failed to load file' }, { status: 500 })
    }
}
