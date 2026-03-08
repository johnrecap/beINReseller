'use client'

/**
 * AnnouncementBannerView — Shared Pure Renderer
 * ================================================
 * Used by both the live dashboard banner AND the admin preview,
 * so both always look identical.
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
    TEXT_SIZE_CLASSES,
    DEFAULT_GRADIENT_COLORS,
    type AnimationType,
    type TextSize,
    type BannerPosition,
} from '@/lib/announcement/constants'
import { resolveUploadedImageSrc } from '@/lib/announcement/helpers'

/* ── Props ──────────────────────────────────────────── */

export interface BannerViewData {
    message: string
    imageUrl?: string | null
    imageAlt?: string | null
    animationType: AnimationType | string
    colors: string[]
    textSize: TextSize | string
    position: BannerPosition | string
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

function StaticText({ text, colors }: { text: string; colors: string[] }) {
    const textColor = colors[0] || '#ffffff'

    return (
        <span className="font-semibold whitespace-pre-line break-words" style={{ color: textColor }}>
            {text}
        </span>
    )
}

/* ── Text Component Map ────────────────────────────── */

const TEXT_COMPONENTS: Record<string, React.ComponentType<{ text: string; colors: string[] }>> = {
    gradient: GradientText,
    typing: TypingText,
    glow: GlowText,
    slide: SlideText,
    marquee: MarqueeText,
    none: StaticText,
}

/* ── Main Renderer ──────────────────────────────────── */

export default function AnnouncementBannerView({
    banner,
    previewMode = false,
    className,
}: AnnouncementBannerViewProps) {
    const TextComponent = TEXT_COMPONENTS[banner.animationType] || StaticText

    const colors = Array.isArray(banner.colors) && banner.colors.length > 0
        ? banner.colors
        : defaultColors

    const bannerImageSrc = resolveUploadedImageSrc(banner.imageUrl)
    const hasMessage = banner.message.trim().length > 0
    const textSizeClass = TEXT_SIZE_CLASSES[banner.textSize as TextSize] || TEXT_SIZE_CLASSES.medium

    /* ── Preview mode: simplified frame ──────────────── */
    if (previewMode) {
        return (
            <div
                className={cn(
                    "rounded-lg overflow-hidden",
                    bannerImageSrc
                        ? "py-2 px-0"
                        : "py-3 px-4 bg-[rgba(0,0,0,0.6)] backdrop-blur-md border border-[rgba(255,255,255,0.1)]",
                    textSizeClass,
                    className
                )}
            >
                <div className={cn(
                    bannerImageSrc ? "w-full" : "flex items-center justify-center"
                )}>
                    {bannerImageSrc ? (
                        <div className="w-full px-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={bannerImageSrc}
                                alt={banner.imageAlt || 'Announcement image'}
                                className="block w-full h-auto max-h-[200px] rounded-xl border border-white/15 object-contain bg-black shadow-[0_10px_35px_rgba(0,0,0,0.4)]"
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
                            <TextComponent text={banner.message || 'Announcement text will appear here...'} colors={colors} />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    /* ── Live mode: full banner with motion ──────────── */
    return (
        <div
            className={cn(
                "relative w-full",
                bannerImageSrc
                    ? "py-2 px-0"
                    : "py-3 px-4 bg-[rgba(0,0,0,0.6)] backdrop-blur-md border-b border-[rgba(255,255,255,0.1)]",
                textSizeClass,
                banner.position === 'floating' && "rounded-lg mx-4 mb-4 border",
                banner.position === 'bottom' && "fixed bottom-0 left-0 right-0 z-50",
                className
            )}
        >
            <div className={cn(
                bannerImageSrc ? "w-full" : "container mx-auto flex items-center justify-center"
            )}>
                {bannerImageSrc ? (
                    <div className="w-full px-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
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
            </div>
        </div>
    )
}
