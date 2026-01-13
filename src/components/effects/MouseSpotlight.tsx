'use client'

import { useEffect, useState } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'

interface MouseSpotlightProps {
    size?: number
    color?: string
    opacity?: number
    blur?: number
    enabled?: boolean
}

export function MouseSpotlight({
    size = 400,
    color = 'rgba(139, 92, 246, 0.15)',
    opacity = 1,
    blur = 100,
    enabled = true
}: MouseSpotlightProps) {
    const [mounted, setMounted] = useState(false)
    const mouseX = useMotionValue(0)
    const mouseY = useMotionValue(0)

    const springConfig = { damping: 25, stiffness: 150 }
    const x = useSpring(mouseX, springConfig)
    const y = useSpring(mouseY, springConfig)

    useEffect(() => {
        setMounted(true)

        if (!enabled) return

        const handleMouseMove = (e: MouseEvent) => {
            mouseX.set(e.clientX - size / 2)
            mouseY.set(e.clientY - size / 2)
        }

        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [enabled, mouseX, mouseY, size])

    if (!mounted || !enabled) return null

    return (
        <motion.div
            className="fixed pointer-events-none z-0"
            style={{
                x,
                y,
                width: size,
                height: size,
                background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
                opacity,
                filter: `blur(${blur}px)`,
            }}
        />
    )
}

// Simple glow that follows mouse on a specific element
interface ElementSpotlightProps {
    children: React.ReactNode
    className?: string
    spotlightSize?: number
    spotlightColor?: string
}

export function ElementSpotlight({
    children,
    className = '',
    spotlightSize = 200,
    spotlightColor = 'rgba(139, 92, 246, 0.2)'
}: ElementSpotlightProps) {
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isHovered, setIsHovered] = useState(false)

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setPosition({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        })
    }

    return (
        <div
            className={`relative overflow-hidden ${className}`}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Spotlight effect */}
            <motion.div
                className="absolute pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                style={{
                    width: spotlightSize,
                    height: spotlightSize,
                    left: position.x - spotlightSize / 2,
                    top: position.y - spotlightSize / 2,
                    background: `radial-gradient(circle, ${spotlightColor} 0%, transparent 70%)`,
                }}
            />
            {/* Content */}
            <div className="relative z-10">
                {children}
            </div>
        </div>
    )
}
