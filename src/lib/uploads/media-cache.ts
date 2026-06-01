export const UPLOAD_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const STATIC_IMAGE_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'

export interface FileCacheMetadataInput {
    size: number
    mtime: Date
}

export interface FileCacheMetadata {
    contentLength: number
    etag: string
    lastModified: string
}

export function createFileCacheMetadata(input: FileCacheMetadataInput): FileCacheMetadata {
    const modifiedTime = Math.floor(input.mtime.getTime() / 1000) * 1000

    return {
        contentLength: input.size,
        etag: `"${input.size.toString(36)}-${modifiedTime.toString(36)}"`,
        lastModified: new Date(modifiedTime).toUTCString(),
    }
}

export function buildMediaCacheHeaders({
    contentType,
    metadata,
    cacheControl,
}: {
    contentType: string
    metadata: FileCacheMetadata
    cacheControl: string
}): Record<string, string> {
    return {
        'Content-Type': contentType,
        'Content-Length': String(metadata.contentLength),
        'Cache-Control': cacheControl,
        ETag: metadata.etag,
        'Last-Modified': metadata.lastModified,
        'X-Content-Type-Options': 'nosniff',
    }
}

function normalizeEtag(value: string): string {
    return value.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
}

export function isRequestNotModified(headers: Headers, metadata: FileCacheMetadata): boolean {
    const ifNoneMatch = headers.get('if-none-match')
    if (ifNoneMatch) {
        const matches = ifNoneMatch
            .split(',')
            .map(normalizeEtag)
            .includes(normalizeEtag(metadata.etag))

        if (matches) {
            return true
        }
    }

    const ifModifiedSince = headers.get('if-modified-since')
    if (!ifModifiedSince) {
        return false
    }

    const since = new Date(ifModifiedSince).getTime()
    const modified = new Date(metadata.lastModified).getTime()
    return Number.isFinite(since) && since >= modified
}
