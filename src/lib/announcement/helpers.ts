/**
 * Announcement Domain — Shared Helpers
 * ======================================
 * Pure utilities used by both client components and API routes.
 */

import {
    ANNOUNCEMENT_IMAGE_DIMENSION_RULES,
    type AnnouncementImagePurpose,
} from './constants'

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
 * Validate that an image URL is a valid uploaded path.
 */
export function isValidUploadUrl(url: string): boolean {
    return url.startsWith('/uploads/')
}

export function isSafeAnnouncementLink(linkUrl?: string | null): boolean {
    if (!linkUrl || linkUrl.trim().length === 0) return true

    const value = linkUrl.trim()
    if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
        return true
    }

    try {
        const parsed = new URL(value)
        return parsed.protocol === 'https:'
    } catch {
        return false
    }
}

export type AnnouncementImageDimensionStatus = 'recommended' | 'accepted_with_warning' | 'rejected'

export function validateAnnouncementImageDimensions(
    purpose: AnnouncementImagePurpose,
    width: number,
    height: number
): { status: AnnouncementImageDimensionStatus; reason: string } {
    const rule = ANNOUNCEMENT_IMAGE_DIMENSION_RULES[purpose]
    if (width < rule.minWidth || height < rule.minHeight) {
        return {
            status: 'rejected',
            reason: `Image is below minimum ${rule.minWidth}x${rule.minHeight}`,
        }
    }

    const aspectDelta = Math.abs(width / height - rule.aspectRatio)
    if (
        width >= rule.recommendedWidth &&
        height >= rule.recommendedHeight &&
        aspectDelta <= 0.05
    ) {
        return {
            status: 'recommended',
            reason: 'Image matches recommended dimensions',
        }
    }

    return {
        status: 'accepted_with_warning',
        reason: `Image meets minimum size but recommended is ${rule.recommendedWidth}x${rule.recommendedHeight}`,
    }
}

export interface AnnouncementSlideLike {
    id: string
    imageUrl: string
    imageAlt?: string | null
    title?: string | null
    description?: string | null
    linkLabel?: string | null
    linkUrl?: string | null
    sortOrder: number
    isActive: boolean
    imageFit?: string | null
}

export interface AnnouncementBannerLike {
    id: string
    message: string
    imageUrl?: string | null
    imageAlt?: string | null
    animationType?: string | null
    colors?: unknown
    textSize?: string | null
    position?: string | null
    displayMode?: string | null
    imageFit?: string | null
    sliderEnabled?: boolean | null
    sliderAutoplay?: boolean | null
    sliderIntervalMs?: number | null
    tickerEnabled?: boolean | null
    tickerText?: string | null
    tickerSpeed?: string | null
    tickerDirection?: string | null
    tickerPosition?: string | null
    tickerBackgroundColor?: string | null
    tickerTextColor?: string | null
    isDismissable?: boolean | null
    dismissalVersion?: number | null
    updatedAt?: Date | string | null
    slides?: AnnouncementSlideLike[]
}

export function getActiveAnnouncementSlides(slides?: AnnouncementSlideLike[]): AnnouncementSlideLike[] {
    return [...(slides ?? [])]
        .filter((slide) => slide.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function shouldUseAnnouncementSlider(banner: AnnouncementBannerLike): boolean {
    return Boolean(banner.sliderEnabled && getActiveAnnouncementSlides(banner.slides).length > 0)
}

export function getLegacyAnnouncementImageFallback(banner: AnnouncementBannerLike): {
    imageUrl: string | null
    imageAlt: string | null
} {
    if (shouldUseAnnouncementSlider(banner)) {
        return { imageUrl: null, imageAlt: null }
    }

    return {
        imageUrl: banner.imageUrl ?? null,
        imageAlt: banner.imageAlt ?? null,
    }
}

export function getNextDismissalVersion(currentVersion?: number | null): number {
    return Math.max(1, currentVersion ?? 1) + 1
}

export function shouldIncrementDismissalVersion(
    previous: Pick<AnnouncementBannerLike, 'message' | 'imageUrl' | 'tickerText'>,
    next: Pick<AnnouncementBannerLike, 'message' | 'imageUrl' | 'tickerText'>
): boolean {
    return (
        previous.message !== next.message ||
        previous.imageUrl !== next.imageUrl ||
        previous.tickerText !== next.tickerText
    )
}

export function buildPublicAnnouncementDto(banner: AnnouncementBannerLike) {
    const slides = getActiveAnnouncementSlides(banner.slides).map((slide) => ({
        id: slide.id,
        imageUrl: slide.imageUrl,
        imageAlt: slide.imageAlt ?? null,
        title: slide.title ?? null,
        description: slide.description ?? null,
        linkLabel: slide.linkLabel ?? null,
        linkUrl: isSafeAnnouncementLink(slide.linkUrl) ? slide.linkUrl ?? null : null,
        sortOrder: slide.sortOrder,
        imageFit: slide.imageFit ?? 'cover',
    }))
    const sliderEnabled = Boolean(banner.sliderEnabled && slides.length > 0)
    const legacyImage = getLegacyAnnouncementImageFallback(banner)
    const tickerEnabled = Boolean(banner.tickerEnabled && banner.tickerText?.trim())

    return {
        id: banner.id,
        message: banner.message,
        imageUrl: legacyImage.imageUrl,
        imageAlt: legacyImage.imageAlt,
        animationType: banner.animationType ?? 'gradient',
        colors: Array.isArray(banner.colors) ? banner.colors : [],
        textSize: banner.textSize ?? 'medium',
        position: banner.position ?? 'top',
        displayMode: banner.displayMode ?? 'banner',
        imageFit: banner.imageFit ?? 'cover',
        sliderEnabled,
        sliderAutoplay: Boolean(banner.sliderAutoplay),
        sliderIntervalMs: banner.sliderIntervalMs ?? 5000,
        ticker: tickerEnabled
            ? {
                enabled: true,
                text: banner.tickerText?.trim() ?? '',
                speed: banner.tickerSpeed ?? 'normal',
                direction: banner.tickerDirection ?? 'auto',
                position: banner.tickerPosition ?? 'below',
                backgroundColor: banner.tickerBackgroundColor ?? '#111827',
                textColor: banner.tickerTextColor ?? '#ffffff',
            }
            : null,
        isDismissable: Boolean(banner.isDismissable),
        dismissalVersion: banner.dismissalVersion ?? 1,
        updatedAt: banner.updatedAt instanceof Date
            ? banner.updatedAt.toISOString()
            : banner.updatedAt ?? null,
        slides: sliderEnabled ? slides : [],
    }
}
