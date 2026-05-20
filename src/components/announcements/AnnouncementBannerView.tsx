'use client'

/**
 * AnnouncementBannerView — Shared Pure Renderer
 * ================================================
 * Used by both the live dashboard banner AND the admin preview,
 * so both always look identical.
 */

import { useState, useEffect, useMemo, type ComponentType } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
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
    onDismiss?: () => void
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
        return 5000
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
    const animationDirection = direction === 'ltr' ? 'ltr' : 'rtl'

    if (!ticker.enabled || ticker.text.trim().length === 0) {
        return null
    }

    return (
        <div
            className="announcement-ticker-strip overflow-hidden border-y border-white/10 px-0 py-2"
            style={{
                backgroundColor: ticker.backgroundColor || '#111827',
                color: ticker.textColor || '#ffffff',
            }}
            dir={direction === 'auto' ? 'auto' : direction}
        >
            <div
                className={cn(
                    'announcement-ticker-content inline-block min-w-full whitespace-nowrap px-4 text-sm font-semibold',
                    !reducedMotion && animationDirection === 'rtl' && 'announcement-ticker-rtl',
                    !reducedMotion && animationDirection === 'ltr' && 'announcement-ticker-ltr',
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
    const canNavigate = slides.length > 1
    const safeIntervalMs = clampSliderInterval(intervalMs)

    const visibleSlides = useMemo(() => {
        if (slides.length === 0) {
            return []
        }

        return [0, 1, 2].map((offset) => slides[(activeIndex + offset) % slides.length])
    }, [activeIndex, slides])

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

    return (
        <section
            className="relative w-full"
            aria-roledescription="carousel"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
        >
            <div className={cn('grid gap-3', previewMode ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')}>
                {visibleSlides.map((slide, index) => {
                    const imageSrc = resolveUploadedImageSrc(slide.imageUrl)
                    const card = (
                        <article
                            className={cn(
                                'group overflow-hidden rounded-lg border border-white/15 bg-black/55 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md',
                                index === 1 && 'hidden sm:block',
                                index === 2 && 'hidden xl:block'
                            )}
                        >
                            <div className="aspect-video w-full overflow-hidden bg-black/70">
                                {imageSrc && (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                        src={imageSrc}
                                        alt={slide.imageAlt || slide.title || 'Announcement slide'}
                                        className={cn('h-full w-full', getImageFitClass(slide.imageFit))}
                                        loading={index === 0 ? 'eager' : 'lazy'}
                                    />
                                )}
                            </div>
                            {(slide.title || slide.description || slide.linkLabel) && (
                                <div className="space-y-2 p-3 text-start">
                                    {slide.title && (
                                        <h3 className="text-sm font-bold leading-5 text-white">
                                            {slide.title}
                                        </h3>
                                    )}
                                    {slide.description && (
                                        <p className="line-clamp-2 text-xs leading-5 text-white/75">
                                            {slide.description}
                                        </p>
                                    )}
                                    {slide.linkLabel && slide.linkUrl && (
                                        <span className="inline-flex rounded-md border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/90 transition group-hover:border-white/40 group-hover:bg-white/10">
                                            {slide.linkLabel}
                                        </span>
                                    )}
                                </div>
                            )}
                        </article>
                    )

                    if (slide.linkUrl) {
                        return (
                            <a key={`${slide.id}-${index}`} href={slide.linkUrl} className="block focus:outline-none focus:ring-2 focus:ring-white/60">
                                {card}
                            </a>
                        )
                    }

                    return <div key={`${slide.id}-${index}`}>{card}</div>
                })}
            </div>

            {canNavigate && (
                <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2">
                    <button
                        type="button"
                        aria-label="Previous announcement slide"
                        onClick={goPrevious}
                        className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg backdrop-blur transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/70"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label="Next announcement slide"
                        onClick={goNext}
                        className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg backdrop-blur transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/70"
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
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
    onDismiss,
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
    const showDismissButton = Boolean(banner.isDismissable && onDismiss)
    const messageBlock = hasMessage ? (
        <div className="w-full text-center">
            <TextComponent text={banner.message} colors={colors} />
        </div>
    ) : null
    const dismissButton = showDismissButton ? (
        <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={onDismiss}
            className="absolute end-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-lg backdrop-blur transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/70"
        >
            <X className="h-4 w-4" aria-hidden="true" />
        </button>
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
                {dismissButton}
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
            {dismissButton}
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
