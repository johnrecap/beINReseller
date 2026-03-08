/**
 * Announcement Domain — Shared Helpers
 * ======================================
 * Pure utilities used by both client components and API routes.
 */

/**
 * Normalize an optional text value: trim, return null if empty.
 * Replaces the duplicated `normalizeOptionalText` in API routes.
 */
export function normalizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

/**
 * Resolve an uploaded image path to its API-served URL.
 * Replaces the duplicated `resolveUploadedImageSrc` in components.
 */
export function resolveUploadedImageSrc(url?: string | null): string {
    if (!url) return ''
    return url.startsWith('/uploads/')
        ? `/api/uploads/${url.replace(/^\/uploads\//, '')}`
        : url
}

/**
 * Generate a revision-aware dismiss key for a banner.
 * Changes when the banner is edited, so updated banners reappear.
 */
export function getDismissKey(banner: { id: string; updatedAt?: string | Date }): string {
    const ts = banner.updatedAt
        ? typeof banner.updatedAt === 'string'
            ? banner.updatedAt
            : banner.updatedAt.toISOString()
        : ''
    return `dismiss_banner_${banner.id}_${ts}`
}

/**
 * Validate that an image URL is a valid uploaded path.
 */
export function isValidUploadUrl(url: string): boolean {
    return url.startsWith('/uploads/')
}
