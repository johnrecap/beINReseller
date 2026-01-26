'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'

interface Banner {
    id: string
    message: string
    animationType: 'gradient' | 'typing' | 'glow' | 'slide' | 'marquee' | 'none'
    colors: string[]
    textSize: 'small' | 'medium' | 'large'
    position: 'top' | 'bottom' | 'floating'
    isDismissable: boolean
}

// Text size classes
const textSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg md:text-xl'
}

// Default gradient colors
const defaultColors = ['#ff0080', '#ff8c00', '#40e0d0', '#ff0080']

/**
 * GradientText - Animated flowing gradient text
 */
function GradientText({ text, colors }: { text: string; colors: string[] }) {
    const gradientColors = colors.length >= 2 ? colors : defaultColors
    const gradientStr = gradientColors.join(', ')
    
    return (
        <span 
            className="inline-block font-semibold"
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
    const [isTyping, setIsTyping] = useState(true)
    const textColor = colors[0] || '#00ff00'
    
    useEffect(() => {
        if (isTyping) {
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
        }
    }, [displayText, text, isTyping])
    
    return (
        <span className="font-semibold" style={{ color: textColor }}>
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
            className="font-bold"
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
            className="font-semibold inline-block"
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
    
    return (
        <div className="overflow-hidden whitespace-nowrap">
            <span 
                className="inline-block font-semibold"
                style={{
                    color: textColor,
                    animation: 'marquee 15s linear infinite'
                }}
            >
                {text}
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
        <span className="font-semibold" style={{ color: textColor }}>
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
        const dismissed = localStorage.getItem('dismissed_banner_id')
        if (dismissed && banner && dismissed === banner.id) {
            setIsDismissed(true)
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
            localStorage.setItem('dismissed_banner_id', banner.id)
            // Set expiry for 24 hours
            localStorage.setItem('dismissed_banner_expiry', String(Date.now() + 24 * 60 * 60 * 1000))
        }
        setIsDismissed(true)
    }, [banner])

    // Check if dismiss has expired
    useEffect(() => {
        const expiry = localStorage.getItem('dismissed_banner_expiry')
        if (expiry && Date.now() > parseInt(expiry)) {
            localStorage.removeItem('dismissed_banner_id')
            localStorage.removeItem('dismissed_banner_expiry')
            setIsDismissed(false)
        }
    }, [])

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

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={cn(
                    // Base styles
                    "relative w-full py-3 px-4",
                    "bg-[rgba(0,0,0,0.6)] backdrop-blur-md",
                    "border-b border-[rgba(255,255,255,0.1)]",
                    // Text size
                    textSizeClasses[banner.textSize],
                    // Position styles
                    banner.position === 'floating' && "rounded-lg mx-4 mb-4 border",
                    banner.position === 'bottom' && "fixed bottom-0 left-0 right-0 z-50"
                )}
            >
                <div className="container mx-auto flex items-center justify-center">
                    {/* Announcement text with animation */}
                    <div className="flex-1 text-center">
                        <TextComponent text={banner.message} colors={colors} />
                    </div>

                    {/* Dismiss button */}
                    {banner.isDismissable && (
                        <button
                            onClick={handleDismiss}
                            className={cn(
                                "absolute top-1/2 -translate-y-1/2 p-1.5 rounded-full",
                                "text-white/60 hover:text-white hover:bg-white/10",
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
