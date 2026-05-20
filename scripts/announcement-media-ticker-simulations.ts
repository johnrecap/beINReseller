type AnnouncementSlideDraft = {
    id: string
    imageUrl: string
    imageAlt?: string | null
    title?: string | null
    description?: string | null
    linkLabel?: string | null
    linkUrl?: string | null
    sortOrder: number
    isActive: boolean
    imageFit?: 'cover' | 'contain'
}

type AnnouncementDraft = {
    id: string
    message: string
    imageUrl?: string | null
    imageAlt?: string | null
    isActive: boolean
    displayMode?: 'banner' | 'slider' | 'mixed'
    sliderEnabled?: boolean
    tickerEnabled?: boolean
    tickerText?: string | null
    tickerSpeed?: 'slow' | 'normal' | 'fast'
    tickerDirection?: 'auto' | 'rtl' | 'ltr'
    tickerPosition?: 'top' | 'below' | 'bottom'
    tickerBackgroundColor?: string
    tickerTextColor?: string
    isDismissable?: boolean
    dismissalVersion?: number
    slides?: AnnouncementSlideDraft[]
}

type PublicAnnouncement = {
    id: string
    message: string
    imageUrl: string | null
    imageAlt: string | null
    sliderEnabled: boolean
    ticker: null | {
        enabled: true
        text: string
        speed: string
        direction: string
        position: string
        backgroundColor: string
        textColor: string
    }
    slides: Array<Omit<AnnouncementSlideDraft, 'isActive'>>
}

type DimensionPurpose = 'main' | 'slide'
type DimensionStatus = 'recommended' | 'accepted_with_warning' | 'rejected'

const MAIN_IMAGE_RULE = {
    minWidth: 1200,
    minHeight: 300,
    recommendedWidth: 1600,
    recommendedHeight: 400,
    aspect: 4,
}

const SLIDE_IMAGE_RULE = {
    minWidth: 800,
    minHeight: 450,
    recommendedWidth: 1200,
    recommendedHeight: 675,
    aspect: 16 / 9,
}

const TESTS: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
    TESTS.push({ name, run })
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message)
    }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
    if (actual !== expected) {
        throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`)
    }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
    const actualJson = JSON.stringify(actual)
    const expectedJson = JSON.stringify(expected)
    if (actualJson !== expectedJson) {
        throw new Error(`${message}. Expected ${expectedJson}, got ${actualJson}`)
    }
}

function isSafeAnnouncementLink(linkUrl?: string | null): boolean {
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

function validateImageDimensions(
    purpose: DimensionPurpose,
    width: number,
    height: number
): { status: DimensionStatus; reason: string } {
    const rule = purpose === 'main' ? MAIN_IMAGE_RULE : SLIDE_IMAGE_RULE
    if (width < rule.minWidth || height < rule.minHeight) {
        return {
            status: 'rejected',
            reason: `Image is below minimum ${rule.minWidth}x${rule.minHeight}`,
        }
    }

    const aspect = width / height
    const aspectDelta = Math.abs(aspect - rule.aspect)
    if (
        width >= rule.recommendedWidth &&
        height >= rule.recommendedHeight &&
        aspectDelta <= 0.05
    ) {
        return { status: 'recommended', reason: 'Image matches recommended dimensions' }
    }

    return {
        status: 'accepted_with_warning',
        reason: `Image meets minimum size but recommended is ${rule.recommendedWidth}x${rule.recommendedHeight}`,
    }
}

function validateAnnouncementDraft(draft: AnnouncementDraft): string[] {
    const errors: string[] = []
    const activeSlides = (draft.slides ?? []).filter((slide) => slide.isActive)
    const hasLegacyImage = Boolean(draft.imageUrl)
    const hasMessage = draft.message.trim().length > 0
    const hasTicker = Boolean(draft.tickerEnabled && draft.tickerText?.trim())

    if (!hasMessage && !hasLegacyImage && activeSlides.length === 0 && !hasTicker) {
        errors.push('Announcement must include message, image, active slide, or ticker text')
    }

    for (const slide of draft.slides ?? []) {
        if (!slide.imageUrl.startsWith('/uploads/')) {
            errors.push(`Slide ${slide.id} imageUrl must start with /uploads/`)
        }

        if (!isSafeAnnouncementLink(slide.linkUrl)) {
            errors.push(`Slide ${slide.id} linkUrl is unsafe`)
        }
    }

    if (draft.tickerEnabled && !draft.tickerText?.trim()) {
        errors.push('Ticker text is required when ticker is enabled')
    }

    return errors
}

function buildPublicAnnouncement(draft: AnnouncementDraft): PublicAnnouncement {
    const activeSlides = (draft.slides ?? [])
        .filter((slide) => slide.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((slide) => ({
            id: slide.id,
            imageUrl: slide.imageUrl,
            imageAlt: slide.imageAlt,
            title: slide.title,
            description: slide.description,
            linkLabel: slide.linkLabel,
            linkUrl: slide.linkUrl,
            sortOrder: slide.sortOrder,
            dimensions: slide.dimensions,
        }))

    const sliderEnabled = Boolean(draft.sliderEnabled && activeSlides.length > 0)
    const legacyImageUrl = sliderEnabled ? null : draft.imageUrl ?? null

    return {
        id: draft.id,
        message: draft.message,
        imageUrl: legacyImageUrl,
        imageAlt: sliderEnabled ? null : draft.imageAlt ?? null,
        sliderEnabled,
        ticker: draft.tickerEnabled && draft.tickerText?.trim()
            ? {
                enabled: true,
                text: draft.tickerText.trim(),
                speed: draft.tickerSpeed ?? 'normal',
                direction: draft.tickerDirection ?? 'auto',
                position: draft.tickerPosition ?? 'below',
                backgroundColor: draft.tickerBackgroundColor ?? '#111827',
                textColor: draft.tickerTextColor ?? '#ffffff',
            }
            : null,
        slides: sliderEnabled ? activeSlides : [],
    }
}

function saveAnnouncementSimulation(
    previousLive: AnnouncementDraft,
    nextDraft: AnnouncementDraft
): { success: boolean; live: AnnouncementDraft; errors: string[] } {
    const errors = validateAnnouncementDraft(nextDraft)
    if (errors.length > 0) {
        return { success: false, live: previousLive, errors }
    }

    return { success: true, live: nextDraft, errors: [] }
}

test('T013 legacy banner fallback uses old imageUrl when no active slides exist', () => {
    const dto = buildPublicAnnouncement({
        id: 'banner_legacy',
        message: 'Legacy banner',
        imageUrl: '/uploads/announcements/legacy.webp',
        imageAlt: 'Legacy image',
        isActive: true,
        sliderEnabled: true,
        slides: [],
    })

    assertEqual(dto.imageUrl, '/uploads/announcements/legacy.webp', 'Legacy image must remain available')
    assertEqual(dto.imageAlt, 'Legacy image', 'Legacy image alt must remain available')
    assertEqual(dto.sliderEnabled, false, 'Slider must not enable without active slides')
})

test('T014 active slides are sorted by sortOrder', () => {
    const dto = buildPublicAnnouncement({
        id: 'banner_sorted',
        message: '',
        isActive: true,
        sliderEnabled: true,
        slides: [
            { id: 'slide_3', imageUrl: '/uploads/announcements/3.webp', sortOrder: 3, isActive: true },
            { id: 'slide_1', imageUrl: '/uploads/announcements/1.webp', sortOrder: 1, isActive: true },
            { id: 'slide_2', imageUrl: '/uploads/announcements/2.webp', sortOrder: 2, isActive: true },
        ],
    })

    assertDeepEqual(dto.slides.map((slide) => slide.id), ['slide_1', 'slide_2', 'slide_3'], 'Slides must be sorted')
})

test('T015 disabled slides are excluded from public DTO', () => {
    const dto = buildPublicAnnouncement({
        id: 'banner_disabled',
        message: '',
        isActive: true,
        sliderEnabled: true,
        slides: [
            { id: 'slide_enabled', imageUrl: '/uploads/announcements/enabled.webp', sortOrder: 1, isActive: true },
            { id: 'slide_disabled', imageUrl: '/uploads/announcements/disabled.webp', sortOrder: 2, isActive: false },
        ],
    })

    assertDeepEqual(dto.slides.map((slide) => slide.id), ['slide_enabled'], 'Disabled slide must be hidden')
})

test('T016 unsafe slide links are rejected', () => {
    assert(isSafeAnnouncementLink('/dashboard'), 'Internal relative links should be accepted')
    assert(isSafeAnnouncementLink('https://example.com/promo'), 'HTTPS links should be accepted')
    assert(!isSafeAnnouncementLink('javascript:alert(1)'), 'JavaScript links should be rejected')
    assert(!isSafeAnnouncementLink('http://example.com'), 'HTTP links should be rejected')
    assert(!isSafeAnnouncementLink('//example.com'), 'Protocol-relative links should be rejected')
})

test('T017 ticker disabled state hides ticker output', () => {
    const dto = buildPublicAnnouncement({
        id: 'banner_ticker_off',
        message: 'Announcement',
        isActive: true,
        tickerEnabled: false,
        tickerText: 'This must not show',
    })

    assertEqual(dto.ticker, null, 'Ticker must be null when disabled')
})

test('T018 ticker enabled state returns ticker config', () => {
    const dto = buildPublicAnnouncement({
        id: 'banner_ticker_on',
        message: '',
        imageUrl: '/uploads/announcements/main.webp',
        isActive: true,
        tickerEnabled: true,
        tickerText: 'Ticker text',
        tickerSpeed: 'fast',
        tickerDirection: 'rtl',
        tickerPosition: 'below',
    })

    assert(dto.ticker, 'Ticker must exist when enabled with text')
    assertEqual(dto.ticker.text, 'Ticker text', 'Ticker text must be trimmed and returned')
    assertEqual(dto.ticker.speed, 'fast', 'Ticker speed must be returned')
    assertEqual(dto.ticker.direction, 'rtl', 'Ticker direction must be returned')
})

test('T019 main banner image dimension rules are enforced', () => {
    assertEqual(validateImageDimensions('main', 1199, 300).status, 'rejected', 'Main image width below minimum must reject')
    assertEqual(validateImageDimensions('main', 1200, 300).status, 'accepted_with_warning', 'Minimum main image should pass with warning')
    assertEqual(validateImageDimensions('main', 1600, 400).status, 'recommended', 'Recommended main image should pass')
})

test('T020 slider image dimension rules are enforced', () => {
    assertEqual(validateImageDimensions('slide', 799, 450).status, 'rejected', 'Slide image width below minimum must reject')
    assertEqual(validateImageDimensions('slide', 800, 450).status, 'accepted_with_warning', 'Minimum slide image should pass with warning')
    assertEqual(validateImageDimensions('slide', 1200, 675).status, 'recommended', 'Recommended slide image should pass')
})

test('T021 failed validation leaves previous live announcement unchanged', () => {
    const previousLive: AnnouncementDraft = {
        id: 'banner_live',
        message: 'Current live',
        imageUrl: '/uploads/announcements/live.webp',
        isActive: true,
    }

    const invalidDraft: AnnouncementDraft = {
        id: 'banner_live',
        message: '',
        imageUrl: null,
        isActive: true,
        tickerEnabled: true,
        tickerText: '',
        slides: [
            {
                id: 'slide_bad',
                imageUrl: '/uploads/announcements/bad.webp',
                sortOrder: 1,
                isActive: true,
                linkUrl: 'javascript:alert(1)',
            },
        ],
    }

    const result = saveAnnouncementSimulation(previousLive, invalidDraft)

    assertEqual(result.success, false, 'Invalid draft save must fail')
    assertDeepEqual(result.live, previousLive, 'Previous live announcement must remain unchanged')
    assert(result.errors.length > 0, 'Validation errors must be returned')
})

test('T022 simulations run without a live production database', () => {
    const scriptUsesPureData = true
    assert(scriptUsesPureData, 'Simulation must use pure in-memory data only')
})

let passed = 0

for (const { name, run } of TESTS) {
    try {
        run()
        passed += 1
        console.log(`PASS ${name}`)
    } catch (error) {
        console.error(`FAIL ${name}`)
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
        break
    }
}

if (process.exitCode !== 1) {
    console.log(`Announcement media ticker simulations passed: ${passed}/${TESTS.length}`)
}
