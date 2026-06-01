export interface AnnouncementSliderSlide {
    id: string
    imageUrl: string
}

export interface AnnouncementSliderFrame<TSlide extends AnnouncementSliderSlide> {
    activeSlide: TSlide | null
    activeIndex: number
    canNavigate: boolean
    preloadSlides: TSlide[]
}

export function normalizeAnnouncementSlideIndex(index: number, slideCount: number): number {
    if (slideCount <= 0) {
        return 0
    }

    return ((index % slideCount) + slideCount) % slideCount
}

export function getAnnouncementSliderFrame<TSlide extends AnnouncementSliderSlide>(
    slides: TSlide[],
    activeIndex: number,
    getImageUrl: (slide: TSlide) => string = (slide) => slide.imageUrl
): AnnouncementSliderFrame<TSlide> {
    if (slides.length === 0) {
        return {
            activeSlide: null,
            activeIndex: 0,
            canNavigate: false,
            preloadSlides: [],
        }
    }

    const normalizedIndex = normalizeAnnouncementSlideIndex(activeIndex, slides.length)
    const activeSlide = slides[normalizedIndex]
    const canNavigate = slides.length > 1

    if (!canNavigate) {
        return {
            activeSlide,
            activeIndex: normalizedIndex,
            canNavigate,
            preloadSlides: [],
        }
    }

    const preloadSlides: TSlide[] = []
    const seenUrls = new Set<string>()
    const adjacentIndexes = [
        normalizeAnnouncementSlideIndex(normalizedIndex + 1, slides.length),
        normalizeAnnouncementSlideIndex(normalizedIndex - 1, slides.length),
    ]

    for (const index of adjacentIndexes) {
        const slide = slides[index]
        const imageUrl = getImageUrl(slide)
        if (!imageUrl || seenUrls.has(imageUrl)) {
            continue
        }

        seenUrls.add(imageUrl)
        preloadSlides.push(slide)
    }

    return {
        activeSlide,
        activeIndex: normalizedIndex,
        canNavigate,
        preloadSlides,
    }
}
