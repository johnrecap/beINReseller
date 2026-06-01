import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { readFile, stat } from 'fs/promises'
import path from 'path'
import {
    UPLOAD_CACHE_CONTROL,
    buildMediaCacheHeaders,
    createFileCacheMetadata,
    isRequestNotModified,
} from '@/lib/uploads/media-cache'
import { contentTypeForUploadPath, isAllowedUploadExtension } from '@/lib/uploads/image-validation'

interface RouteParams {
    params: Promise<{ path: string[] }>
}

const ALLOWED_FOLDERS = new Set(['products', 'categories', 'announcements'])

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

export async function GET(request: NextRequest, { params }: RouteParams) {
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

        const requestedFile = parts[parts.length - 1]
        if (!isAllowedUploadExtension(requestedFile)) {
            return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
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

            const fileStats = await stat(normalizedCandidate).catch(() => null)
            if (!fileStats) {
                continue
            }

            if (!fileStats.isFile()) {
                continue
            }

            const contentType = contentTypeForUploadPath(normalizedCandidate)
            if (!contentType) {
                return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
            }

            const metadata = createFileCacheMetadata({
                size: fileStats.size,
                mtime: fileStats.mtime,
            })
            const headers = buildMediaCacheHeaders({
                contentType,
                metadata,
                cacheControl: UPLOAD_CACHE_CONTROL,
            })

            if (isRequestNotModified(request.headers, metadata)) {
                return new NextResponse(null, { status: 304, headers })
            }

            const buffer = await readFile(normalizedCandidate)
            return new NextResponse(buffer, { headers })
        }

        return NextResponse.json({ error: 'File not found' }, { status: 404 })
    } catch (error) {
        console.error('Upload file serve error:', error)
        return NextResponse.json({ error: 'Failed to load file' }, { status: 500 })
    }
}
