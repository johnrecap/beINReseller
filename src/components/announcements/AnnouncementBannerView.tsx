'use client'

/**
 * AnnouncementBannerView — Shared Pure Renderer
 * ================================================
 * Used by both the live dashboard banner AND the admin preview,
 * so both always look identical.
 */

import { useState, useEffect, useMemo, type ComponentType } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    TEXT_SIZE_CLASSES,
    DEFAULT_GRADIENT_COLORS,
    MIN_SLIDER_INTERVAL_MS,
    MAX_SLIDER_INTERVAL_MS,
    type AnimationType,
    type TextSize,
    type BannerPosition,
    type AnnouncementDisplayMode,
    type AnnouncementImageFit,
    type AnnouncementTickerDirection,
    type AnnouncementTickerPosition,
    type AnnouncementTickerSpeed,
} from '@/lib/announcement/constants'
import { resolveUploadedImageSrc } from '@/lib/announcement/helpers'
import { getAnnouncementSliderFrame } from '@/lib/announcement/slider-performance'

/* ── Props ──────────────────────────────────────────── */

export interface BannerViewData {
    id?: string
    message: string
    imageUrl?: string | null
    imageAlt?: string | null
    animationType: AnimationType | string
    colors: string[]
    textSize: TextSize | string
    position: BannerPosition | string
    displayMode?: AnnouncementDisplayMode | string
    imageFit?: AnnouncementImageFit | string
    sliderEnabled?: boolean
    sliderAutoplay?: boolean
    sliderIntervalMs?: number
    ticker?: AnnouncementTickerViewData | null
    isDismissable?: boolean
    dismissalVersion?: number
    updatedAt?: string | null
    slides?: AnnouncementSlideViewData[]
}

export interface AnnouncementSlideViewData {
    id: string
    imageUrl: string
    imageAlt?: string | null
    title?: string | null
    description?: string | null
    linkLabel?: string | null
    linkUrl?: string | null
    imageFit?: AnnouncementImageFit | string
}

export interface AnnouncementTickerViewData {
    enabled: boolean
    text: string
    speed: AnnouncementTickerSpeed | string
    direction: AnnouncementTickerDirection | string
    position: AnnouncementTickerPosition | string
    backgroundColor: string
    textColor: string
}

export interface AnnouncementBannerViewProps {
    banner: BannerViewData
    /** When true, renders in a compact preview frame (no position/animation entrance) */
    previewMode?: boolean
    className?: string
}

/* ── Animation Sub-components ───────────────────────── */

const defaultColors = DEFAULT_GRADIENT_COLORS as unknown as string[]

function GradientText({ text, colors }: { text: string; colors: string[] }) {
    const gradientColors = colors.length >= 2 ? colors : defaultColors
    const gradientStr = gradientColors.join(', ')

    return (
        <span
            className="inline-block font-semibold whitespace-pre-line break-words"
            style={{
                background: `linear-gradient(90deg, ${gradientStr})`,
                backgroundSize: '300% 100%',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'gradient-flow 4s ease infinite'
            }}
        >
            {text}
        </span>
    )
}

function TypingText({ text, colors }: { text: string; colors: string[] }) {
    const [displayText, setDisplayText] = useState('')
    const textColor = colors[0] || '#00ff00'

    useEffect(() => {
        if (displayText.length < text.length) {
            const timer = setTimeout(() => {
                setDisplayText(text.slice(0, displayText.length + 1))
            }, 50)
            return () => clearTimeout(timer)
        } else {
            const timer = setTimeout(() => {
                setDisplayText('')
            }, 3000)
            return () => clearTimeout(timer)
        }
    }, [displayText, text])

    return (
        <span className="font-semibold whitespace-pre-line break-words" style={{ color: textColor }}>
            {displayText}
            <span
                className="inline-block w-0.5 h-[1em] ml-0.5 align-middle"
                style={{
                    backgroundColor: textColor,
                    animation: 'cursor-blink 1s step-end infinite'
                }}
            />
        </span>
    )
}

function GlowText({ text, colors }: { text: string; colors: string[] }) {
    const glowColor = colors[0] || '#00ff00'

    return (
        <span
            className="font-bold whitespace-pre-line break-words"
            style={{
                color: glowColor,
                animation: 'text-glow-pulse 2s ease-in-out infinite'
            }}
        >
            {text}
        </span>
    )
}

function SlideText({ text, colors }: { text: string; colors: string[] }) {
    const textColor = colors[0] || '#ffffff'

    return (
        <motion.span
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="font-semibold inline-block whitespace-pre-line break-words"
            style={{ color: textColor }}
        >
            {text}
        </motion.span>
    )
}

function MarqueeText({ text, colors }: { text: string; colors: string[] }) {
    const textColor = colors[0] || '#ffffff'
    const marqueeText = text.replace(/\s*\n+\s*/g, '   -   ')

    return (
        <div className="overflow-hidden whitespace-nowrap">
            <span
                className="inline-block font-semibold"
                style={{
                    color: textColor,
                    animation: 'marquee 15s linear infinite'
                }}
            >
                {marqueeText}
            </span>
        </div>
    )
}

function StaticText({ text, colors }: { text: string; colors: string[] }) {
    const textColor = colors[0] || '#ffffff'

    return (
        <span className="font-semibold whitespace-pre-line break-words" style={{ color: textColor }}>
            {text}
        </span>
    )
}

/* ── Text Component Map ────────────────────────────── */

const TEXT_COMPONENTS: Record<string, ComponentType<{ text: string; colors: string[] }>> = {
    gradient: GradientText,
    typing: TypingText,
    glow: GlowText,
    slide: SlideText,
    marquee: MarqueeText,
    none: StaticText,
}

/* ── Main Renderer ──────────────────────────────────── */

function useReducedMotionPreference() {
    const getSnapshot = () => (
        typeof window !== 'undefined'
        && Boolean(window.matchMedia)
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(getSnapshot)

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) {
            return
        }

        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
        const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches)
        mediaQuery.addEventListener?.('change', handleChange)
        return () => mediaQuery.removeEventListener?.('change', handleChange)
    }, [])

    return prefersReducedMotion
}

function clampSliderInterval(intervalMs?: number) {
    if (!intervalMs || Number.isNaN(intervalMs)) {
        return 4800
    }

    return Math.min(Math.max(intervalMs, MIN_SLIDER_INTERVAL_MS), MAX_SLIDER_INTERVAL_MS)
}

function getImageFitClass(fit?: string | null) {
    return fit === 'contain' ? 'object-contain' : 'object-cover'
}

function getTickerDuration(speed?: string) {
    if (speed === 'slow') return '32s'
    if (speed === 'fast') return '14s'
    return '22s'
}

function getEffectiveTickerDirection(ticker: AnnouncementTickerViewData) {
    if (ticker.direction === 'ltr') return 'ltr'
    if (ticker.direction === 'rtl') return 'rtl'
    return 'auto'
}

function TickerStrip({
    ticker,
    reducedMotion,
}: {
    ticker: AnnouncementTickerViewData
    reducedMotion: boolean
}) {
    const direction = getEffectiveTickerDirection(ticker)

    if (!ticker.enabled || ticker.text.trim().length === 0) {
        return null
    }

    return (
        <div
            className="overflow-hidden border-y border-white/10 bg-[#1f1f26]/80 px-0 py-3 backdrop-blur-xl"
            style={{
                backgroundColor: ticker.backgroundColor || undefined,
                color: ticker.textColor || '#ffffff',
            }}
            dir={direction === 'auto' ? 'auto' : direction}
        >
            <div
                className={cn(
                    'stitch-label px-4 text-[#c0caae]',
                    !reducedMotion && 'stitch-ticker-track',
                    reducedMotion && 'text-center'
                )}
                style={{ animationDuration: getTickerDuration(ticker.speed) }}
            >
                {ticker.text}
            </div>
        </div>
    )
}

function AnnouncementSlider({
    slides,
    autoplay,
    intervalMs,
    reducedMotion,
    previewMode,
}: {
    slides: AnnouncementSlideViewData[]
    autoplay?: boolean
    intervalMs?: number
    reducedMotion: boolean
    previewMode: boolean
}) {
    const [activeIndex, setActiveIndex] = useState(0)
    const [isPaused, setIsPaused] = useState(false)
    const safeIntervalMs = clampSliderInterval(intervalMs)
    const frame = useMemo(() => {
        return getAnnouncementSliderFrame(
            slides,
            activeIndex,
            (slide) => resolveUploadedImageSrc(slide.imageUrl)
        )
    }, [activeIndex, slides])
    const { activeSlide, canNavigate, preloadSlides } = frame
    const activeImageSrc = activeSlide ? resolveUploadedImageSrc(activeSlide.imageUrl) : ''

    useEffect(() => {
        if (!autoplay || reducedMotion || isPaused || !canNavigate) {
            return
        }

        const timer = window.setInterval(() => {
            setActiveIndex((current) => (current + 1) % slides.length)
        }, safeIntervalMs)

        return () => window.clearInterval(timer)
    }, [autoplay, canNavigate, isPaused, reducedMotion, safeIntervalMs, slides.length])

    const goPrevious = () => {
        setActiveIndex((current) => (current - 1 + slides.length) % slides.length)
    }

    const goNext = () => {
        setActiveIndex((current) => (current + 1) % slides.length)
    }

    if (!activeSlide || !activeImageSrc) {
        return null
    }

    return (
        <section
            className="relative w-full"
            aria-roledescription="carousel"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
        >
            <div className={cn('relative w-full', canNavigate && 'pr-12', previewMode ? 'aspect-[21/10]' : 'aspect-[21/9]')}>
                <article className="absolute inset-0 overflow-hidden rounded-xl border border-white/10 bg-[#131319] shadow-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={activeImageSrc}
                        alt={activeSlide.imageAlt || activeSlide.title || 'Announcement slide'}
                        className={cn('absolute inset-0 h-full w-full', getImageFitClass(activeSlide.imageFit))}
                        loading="eager"
                        decoding="async"
                    />
                    <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/20 via-black/5 to-transparent" />
                    <div className="absolute left-0 top-0 z-30 h-1 w-full bg-[#571bc1]" />
                    {activeSlide.linkUrl && (
                        <a
                            href={activeSlide.linkUrl}
                            className="absolute inset-0 z-20 focus:outline-none focus:ring-2 focus:ring-[#9ffb06]/70"
                        >
                            <span className="sr-only">
                                {activeSlide.linkLabel || activeSlide.title || 'Open announcement slide'}
                            </span>
                        </a>
                    )}
                    {(activeSlide.title || activeSlide.description) && (
                        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-end p-8 text-start">
                            {activeSlide.title && (
                                <h3 className={cn(
                                    'mb-3 font-bold leading-tight text-white drop-shadow-lg',
                                    previewMode ? 'text-2xl' : 'text-4xl'
                                )}>
                                    {activeSlide.title}
                                </h3>
                            )}
                            {activeSlide.description && (
                                <p className={cn(
                                    'mb-6 max-w-3xl leading-relaxed text-[#c0caae]',
                                    previewMode ? 'line-clamp-2 text-sm' : 'text-lg'
                                )}>
                                    {activeSlide.description}
                                </p>
                            )}
                        </div>
                    )}
                </article>
                <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0">
                    {preloadSlides.map((slide) => {
                        const preloadSrc = resolveUploadedImageSrc(slide.imageUrl)
                        if (!preloadSrc) return null

                        return (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                key={`${slide.id}-${preloadSrc}`}
                                src={preloadSrc}
                                alt=""
                                loading="eager"
                                decoding="async"
                                className="h-px w-px opacity-0"
                            />
                        )
                    })}
                </div>
            </div>

            {canNavigate && (
                <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-40 flex items-center justify-between px-3">
                    <button
                        type="button"
                        aria-label="Previous announcement slide"
                        onClick={goPrevious}
                        className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#1f1f26]/80 text-[#c0caae] shadow-lg backdrop-blur transition hover:border-[#9ffb06]/50 hover:text-[#9ffb06] focus:outline-none focus:ring-2 focus:ring-[#9ffb06]/70"
                    >
                        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label="Next announcement slide"
                        onClick={goNext}
                        className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#1f1f26]/80 text-[#c0caae] shadow-lg backdrop-blur transition hover:border-[#9ffb06]/50 hover:text-[#9ffb06] focus:outline-none focus:ring-2 focus:ring-[#9ffb06]/70"
                    >
                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
            )}
        </section>
    )
}

export default function AnnouncementBannerView({
    banner,
    previewMode = false,
    className,
}: AnnouncementBannerViewProps) {
    const TextComponent = TEXT_COMPONENTS[banner.animationType] || StaticText
    const reducedMotion = useReducedMotionPreference()

    const colors = Array.isArray(banner.colors) && banner.colors.length > 0
        ? banner.colors
        : defaultColors

    const bannerImageSrc = resolveUploadedImageSrc(banner.imageUrl)
    const activeSlides = Array.isArray(banner.slides)
        ? banner.slides.filter((slide) => Boolean(resolveUploadedImageSrc(slide.imageUrl)))
        : []
    const shouldRenderSlider = Boolean(
        banner.sliderEnabled
        && activeSlides.length > 0
        && (banner.displayMode === 'slider' || banner.displayMode === 'mixed')
    )
    const shouldRenderLegacyImage = !shouldRenderSlider && Boolean(bannerImageSrc)
    const hasMessage = banner.message.trim().length > 0
    const textSizeClass = TEXT_SIZE_CLASSES[banner.textSize as TextSize] || TEXT_SIZE_CLASSES.medium
    const ticker = banner.ticker?.enabled ? banner.ticker : null
    const showTickerTop = ticker?.position === 'top'
    const showTickerBottom = ticker?.position === 'bottom' || ticker?.position === 'below'
    const messageBlock = hasMessage ? (
        <div className="w-full text-center">
            <TextComponent text={banner.message} colors={colors} />
        </div>
    ) : null

    /* ── Preview mode: simplified frame ──────────────── */
    if (previewMode) {
        return (
            <div
                className={cn(
                    "relative rounded-lg overflow-hidden",
                    shouldRenderLegacyImage || shouldRenderSlider
                        ? "py-2 px-0"
                        : "py-3 px-4 bg-[rgba(0,0,0,0.6)] backdrop-blur-md border border-[rgba(255,255,255,0.1)]",
                    textSizeClass,
                    className
                )}
            >
                {ticker && showTickerTop && <TickerStrip ticker={ticker} reducedMotion={reducedMotion} />}
                <div className={cn(
                    shouldRenderLegacyImage || shouldRenderSlider ? "w-full" : "flex items-center justify-center"
                )}>
                    {shouldRenderSlider ? (
                        <div className="w-full px-4">
                            {messageBlock && (
                                <div className="mb-3 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-center backdrop-blur-sm">
                                    {messageBlock}
                                </div>
                            )}
                            <AnnouncementSlider
                                slides={activeSlides}
                                autoplay={banner.sliderAutoplay}
                                intervalMs={banner.sliderIntervalMs}
                                reducedMotion={reducedMotion}
                                previewMode={previewMode}
                            />
                        </div>
                    ) : shouldRenderLegacyImage ? (
                        <div className="w-full px-4">
                            <div className="aspect-[4/1] max-h-[200px] w-full overflow-hidden rounded-xl border border-white/15 bg-black shadow-[0_10px_35px_rgba(0,0,0,0.4)]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={bannerImageSrc || ''}
                                    alt={banner.imageAlt || 'Announcement image'}
                                    className={cn('block h-full w-full', getImageFitClass(banner.imageFit))}
                                />
                            </div>
                            {hasMessage && (
                                <div className="mt-3 text-center px-2">
                                    <div className="inline-block max-w-full rounded-md bg-black/40 px-3 py-2 backdrop-blur-sm border border-white/10">
                                        <TextComponent text={banner.message} colors={colors} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        messageBlock || (
                            <div className="w-full text-center">
                                <TextComponent text="Announcement text will appear here..." colors={colors} />
                            </div>
                        )
                    )}
                </div>
                {ticker && showTickerBottom && <TickerStrip ticker={ticker} reducedMotion={reducedMotion} />}
            </div>
        )
    }

    /* ── Live mode: full banner with motion ──────────── */
    return (
        <div
            className={cn(
                "relative w-full",
                shouldRenderLegacyImage || shouldRenderSlider
                    ? "py-2 px-0"
                    : "py-3 px-4 bg-[rgba(0,0,0,0.6)] backdrop-blur-md border-b border-[rgba(255,255,255,0.1)]",
                textSizeClass,
                banner.position === 'floating' && "rounded-lg mx-4 mb-4 border",
                banner.position === 'bottom' && "fixed bottom-0 left-0 right-0 z-50",
                className
            )}
        >
            {ticker && showTickerTop && <TickerStrip ticker={ticker} reducedMotion={reducedMotion} />}
            <div className={cn(
                shouldRenderLegacyImage || shouldRenderSlider ? "w-full" : "container mx-auto flex items-center justify-center"
            )}>
                {shouldRenderSlider ? (
                    <div className="w-full px-4">
                        {messageBlock && (
                            <div className="mx-auto mb-3 max-w-5xl rounded-md border border-white/10 bg-black/40 px-3 py-2 text-center backdrop-blur-sm">
                                {messageBlock}
                            </div>
                        )}
                        <AnnouncementSlider
                            slides={activeSlides}
                            autoplay={banner.sliderAutoplay}
                            intervalMs={banner.sliderIntervalMs}
                            reducedMotion={reducedMotion}
                            previewMode={previewMode}
                        />
                    </div>
                ) : shouldRenderLegacyImage ? (
                    <div className="w-full px-4">
                        <div className="aspect-[4/1] max-h-[70vh] w-full overflow-hidden rounded-xl border border-white/15 bg-black shadow-[0_10px_35px_rgba(0,0,0,0.4)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={bannerImageSrc || ''}
                                alt={banner.imageAlt || 'Announcement image'}
                                className={cn('block h-full w-full', getImageFitClass(banner.imageFit))}
                            />
                        </div>
                        {hasMessage && (
                            <div className="mt-3 text-center px-2">
                                <div className="inline-block max-w-full rounded-md bg-black/40 px-3 py-2 backdrop-blur-sm border border-white/10">
                                    <TextComponent text={banner.message} colors={colors} />
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    messageBlock
                )}
            </div>
            {ticker && showTickerBottom && <TickerStrip ticker={ticker} reducedMotion={reducedMotion} />}
        </div>
    )
}
