'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'
import {
    TEXT_SIZE_CLASSES,
    DEFAULT_GRADIENT_COLORS,
    DISMISS_DURATION_MS,
    type AnimationType,
    type TextSize,
    type BannerPosition,
} from '@/lib/announcement/constants'
import { resolveUploadedImageSrc, getDismissKey } from '@/lib/announcement/helpers'

interface Banner {
    id: string
    message: string
    imageUrl?: string | null
    imageAlt?: string | null
    animationType: AnimationType
    colors: string[]
    textSize: TextSize
    position: BannerPosition
    isDismissable: boolean
    updatedAt?: string
}

// Default gradient colors
const defaultColors = DEFAULT_GRADIENT_COLORS

/**
 * GradientText - Animated flowing gradient text
 */
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

/**
 * TypingText - Typewriter effect with cursor
 */
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
            // Pause at end, then restart
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

/**
 * GlowText - Pulsing neon glow effect
 */
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

/**
 * SlideText - Slide in animation
 */
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

/**
 * MarqueeText - Scrolling marquee effect
 */
function MarqueeText({ text, colors }: { text: string; colors: string[] }) {
    const textColor = colors[0] || '#ffffff'
    const marqueeText = text.replace(/\s*\n+\s*/g, '   •   ')

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

/**
 * StaticText - No animation
 */
function StaticText({ text, colors }: { text: string; colors: string[] }) {
    const textColor = colors[0] || '#ffffff'

    return (
        <span className="font-semibold whitespace-pre-line break-words" style={{ color: textColor }}>
            {text}
        </span>
    )
}

/**
 * AnnouncementBanner - Dynamic announcement banner with multiple animation types
 */
export default function AnnouncementBanner() {
    const { t } = useTranslation()
    const [banner, setBanner] = useState<Banner | null>(null)
    const [isDismissed, setIsDismissed] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // Check localStorage for dismissed state
    useEffect(() => {
        if (!banner) return
        const key = getDismissKey(banner)
        const dismissed = localStorage.getItem(key)
        if (dismissed) {
            const expiry = localStorage.getItem(`${key}_expiry`)
            if (expiry && Date.now() > parseInt(expiry)) {
                localStorage.removeItem(key)
                localStorage.removeItem(`${key}_expiry`)
            } else {
                setIsDismissed(true)
            }
        }
    }, [banner])

    // Fetch active banner
    useEffect(() => {
        const fetchBanner = async () => {
            try {
                const res = await fetch('/api/announcement/active')
                const data = await res.json()

                if (data.success && data.banner) {
                    setBanner(data.banner)

                    // Check if this specific banner was dismissed
                    const dismissedId = localStorage.getItem('dismissed_banner_id')
                    if (dismissedId === data.banner.id) {
                        setIsDismissed(true)
                    }
                }
            } catch (error) {
                console.error('Failed to fetch banner:', error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchBanner()
    }, [])

    // Handle dismiss
    const handleDismiss = useCallback(() => {
        if (banner) {
            const key = getDismissKey(banner)
            localStorage.setItem(key, '1')
            localStorage.setItem(`${key}_expiry`, String(Date.now() + DISMISS_DURATION_MS))
        }
        setIsDismissed(true)
    }, [banner])



    // Don't render if loading, no banner, or dismissed
    if (isLoading || !banner || isDismissed) {
        return null
    }

    // Get the appropriate text component based on animation type
    const TextComponent = {
        gradient: GradientText,
        typing: TypingText,
        glow: GlowText,
        slide: SlideText,
        marquee: MarqueeText,
        none: StaticText
    }[banner.animationType] || StaticText

    const colors = Array.isArray(banner.colors) && banner.colors.length > 0
        ? banner.colors
        : defaultColors
    const bannerImageSrc = resolveUploadedImageSrc(banner.imageUrl)
    const hasMessage = banner.message.trim().length > 0

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={cn(
                    // Base styles
                    "relative w-full",
                    bannerImageSrc
                        ? "py-2 px-0"
                        : "py-3 px-4 bg-[rgba(0,0,0,0.6)] backdrop-blur-md border-b border-[rgba(255,255,255,0.1)]",
                    // Text size
                    TEXT_SIZE_CLASSES[banner.textSize],
                    // Position styles
                    banner.position === 'floating' && "rounded-lg mx-4 mb-4 border",
                    banner.position === 'bottom' && "fixed bottom-0 left-0 right-0 z-50"
                )}
            >
                <div className={cn(
                    bannerImageSrc ? "w-full" : "container mx-auto flex items-center justify-center"
                )}>
                    {bannerImageSrc ? (
                        <div className="w-full px-4">
                            <img
                                src={bannerImageSrc}
                                alt={banner.imageAlt || 'Announcement image'}
                                className="block w-full h-auto max-h-[70vh] rounded-xl border border-white/15 object-contain bg-black shadow-[0_10px_35px_rgba(0,0,0,0.4)]"
                            />
                            {hasMessage && (
                                <div className="mt-3 text-center px-2">
                                    <div className="inline-block max-w-full rounded-md bg-black/40 px-3 py-2 backdrop-blur-sm border border-white/10">
                                        <TextComponent text={banner.message} colors={colors} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="w-full text-center">
                            <TextComponent text={banner.message} colors={colors} />
                        </div>
                    )}

                    {/* Dismiss button */}
                    {banner.isDismissable && (
                        <button
                            onClick={handleDismiss}
                            className={cn(
                                "absolute top-3 p-1.5 rounded-full z-20",
                                "bg-black/55 text-white/80 hover:text-white hover:bg-black/70",
                                "transition-colors duration-200",
                                "end-3"
                            )}
                            aria-label={t.common?.close || 'Close'}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
