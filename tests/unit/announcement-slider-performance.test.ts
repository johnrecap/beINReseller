import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
    getAnnouncementSliderFrame,
    normalizeAnnouncementSlideIndex,
    type AnnouncementSliderSlide,
} from '@/lib/announcement/slider-performance'

const slides: AnnouncementSliderSlide[] = [
    { id: 'slide-1', imageUrl: '/uploads/announcements/one.jpg' },
    { id: 'slide-2', imageUrl: '/uploads/announcements/two.jpg' },
    { id: 'slide-3', imageUrl: '/uploads/announcements/three.jpg' },
]

test('selects one active slide and no preload work for empty or single-slide banners', () => {
    const empty = getAnnouncementSliderFrame([], 0)
    assert.equal(empty.activeSlide, null)
    assert.equal(empty.activeIndex, 0)
    assert.equal(empty.canNavigate, false)
    assert.deepEqual(empty.preloadSlides, [])

    const single = getAnnouncementSliderFrame([slides[0]], 4)
    assert.equal(single.activeSlide?.id, 'slide-1')
    assert.equal(single.activeIndex, 0)
    assert.equal(single.canNavigate, false)
    assert.deepEqual(single.preloadSlides, [])
})

test('wraps active slide indexes safely', () => {
    assert.equal(normalizeAnnouncementSlideIndex(0, slides.length), 0)
    assert.equal(normalizeAnnouncementSlideIndex(3, slides.length), 0)
    assert.equal(normalizeAnnouncementSlideIndex(4, slides.length), 1)
    assert.equal(normalizeAnnouncementSlideIndex(-1, slides.length), 2)
    assert.equal(normalizeAnnouncementSlideIndex(-4, slides.length), 2)
})

test('preloads a single adjacent image for two-slide banners without duplication', () => {
    const frame = getAnnouncementSliderFrame(slides.slice(0, 2), 0)

    assert.equal(frame.activeSlide?.id, 'slide-1')
    assert.equal(frame.canNavigate, true)
    assert.deepEqual(frame.preloadSlides.map((slide) => slide.id), ['slide-2'])
})

test('preloads next then previous unique images for three or more slides', () => {
    const frame = getAnnouncementSliderFrame(slides, 1)

    assert.equal(frame.activeSlide?.id, 'slide-2')
    assert.equal(frame.canNavigate, true)
    assert.deepEqual(frame.preloadSlides.map((slide) => slide.id), ['slide-3', 'slide-1'])
})

test('deduplicates adjacent preload images by resolved image URL', () => {
    const duplicateUrlSlides: AnnouncementSliderSlide[] = [
        { id: 'slide-1', imageUrl: '/uploads/announcements/shared.jpg' },
        { id: 'slide-2', imageUrl: '/uploads/announcements/two.jpg' },
        { id: 'slide-3', imageUrl: '/uploads/announcements/shared.jpg' },
    ]

    const frame = getAnnouncementSliderFrame(
        duplicateUrlSlides,
        1,
        (slide) => `/api${slide.imageUrl}`
    )

    assert.deepEqual(frame.preloadSlides.map((slide) => slide.id), ['slide-3'])
})

test('keeps hidden preload images inside the slider bounds to avoid horizontal page overflow', () => {
    const source = readFileSync(
        path.join(process.cwd(), 'src/components/announcements/AnnouncementBannerView.tsx'),
        'utf8'
    )

    assert.equal(source.includes('-left-[9999px]'), false)
    assert.match(source, /absolute left-0 top-0 h-px w-px/)
})
