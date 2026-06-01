import test from 'node:test'
import assert from 'node:assert/strict'
import nextConfig from '../../next.config'
import {
    UPLOAD_CACHE_CONTROL,
    STATIC_IMAGE_CACHE_CONTROL,
    buildMediaCacheHeaders,
    createFileCacheMetadata,
    isRequestNotModified,
} from '@/lib/uploads/media-cache'

const FILE_TIME = new Date('2026-06-01T10:00:00.000Z')

test('builds long immutable cache headers for public uploaded images', () => {
    const metadata = createFileCacheMetadata({ size: 12345, mtime: FILE_TIME })
    const headers = buildMediaCacheHeaders({
        contentType: 'image/png',
        metadata,
        cacheControl: UPLOAD_CACHE_CONTROL,
    })

    assert.equal(headers['Content-Type'], 'image/png')
    assert.equal(headers['Content-Length'], '12345')
    assert.equal(headers['Cache-Control'], UPLOAD_CACHE_CONTROL)
    assert.equal(headers['Last-Modified'], FILE_TIME.toUTCString())
    assert.equal(headers['X-Content-Type-Options'], 'nosniff')
    assert.match(headers.ETag, /^"[a-z0-9]+-[a-z0-9]+"$/)
})

test('builds moderate cache headers for non-versioned static images', () => {
    const metadata = createFileCacheMetadata({ size: 500, mtime: FILE_TIME })
    const headers = buildMediaCacheHeaders({
        contentType: 'image/jpeg',
        metadata,
        cacheControl: STATIC_IMAGE_CACHE_CONTROL,
    })

    assert.equal(headers['Cache-Control'], STATIC_IMAGE_CACHE_CONTROL)
    assert.doesNotMatch(headers['Cache-Control'], /31536000/)
    assert.doesNotMatch(headers['Cache-Control'], /immutable/)
})

test('recognizes current ETag and Last-Modified validators as not modified', () => {
    const metadata = createFileCacheMetadata({ size: 12345, mtime: FILE_TIME })

    assert.equal(isRequestNotModified(new Headers({ 'if-none-match': metadata.etag }), metadata), true)
    assert.equal(isRequestNotModified(new Headers({ 'if-none-match': metadata.etag.replaceAll('"', '') }), metadata), true)
    assert.equal(isRequestNotModified(new Headers({ 'if-modified-since': FILE_TIME.toUTCString() }), metadata), true)
    assert.equal(isRequestNotModified(new Headers({ 'if-none-match': '"different"' }), metadata), false)
    assert.equal(
        isRequestNotModified(new Headers({ 'if-modified-since': new Date('2026-06-01T09:59:59.000Z').toUTCString() }), metadata),
        false
    )
})

test('next cache headers exclude public media from blanket no-store rule', async () => {
    const headers = await nextConfig.headers?.()
    assert.ok(headers)

    const noStoreRule = headers.find((rule) =>
        rule.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store'))
    )
    const staticImageRule = headers.find((rule) => rule.source === '/images/:path*')

    assert.ok(noStoreRule)
    assert.ok(staticImageRule)
    assert.match(noStoreRule.source, /api\/uploads/)
    assert.match(noStoreRule.source, /images/)
    assert.doesNotMatch(staticImageRule.headers[0].value, /no-store/)
})
