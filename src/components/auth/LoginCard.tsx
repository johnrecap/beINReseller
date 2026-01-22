'use client'

import React, { useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { cn } from '@/lib/utils'

interface LoginCardProps {
    children: React.ReactNode
    className?: string
}

export function LoginCard({ children, className }: LoginCardProps) {
    const ref = useRef<HTMLDivElement>(null)
    const [isHovered, setIsHovered] = useState(false)

    // Mouse position state
    const x = useMotionValue(0)
    const y = useMotionValue(0)

    // Smooth spring animation for tilt
    const mouseX = useSpring(x, { stiffness: 300, damping: 30 })
    const mouseY = useSpring(y, { stiffness: 300, damping: 30 })

    // Calculate rotation based on mouse position
    const rotateX = useTransform(mouseY, [-0.5, 0.5], ["7deg", "-7deg"])
    const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-7deg", "7deg"])

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return

        const rect = ref.current.getBoundingClientRect()
        const width = rect.width
        const height = rect.height

        const mouseXPos = e.clientX - rect.left
        const mouseYPos = e.clientY - rect.top

        // Normalize mouse coordinates to -0.5 to 0.5
        const xPct = mouseXPos / width - 0.5
        const yPct = mouseYPos / height - 0.5

        x.set(xPct)
        y.set(yPct)
    }

    const handleMouseLeave = () => {
        setIsHovered(false)
        x.set(0)
        y.set(0)
    }

    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={handleMouseLeave}
            style={{
                perspective: 1000,
            }}
            className="w-full max-w-[450px]"
        >
            <motion.div
                style={{
                    rotateX,
                    rotateY,
                    transformStyle: "preserve-3d",
                }}
                className={cn(
                    "relative glass-card rounded-2xl p-8 md:p-10 transition-all duration-200",
                    className
                )}
            >
                {/* Spotlight Effect */}
                <motion.div
                    className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 pointer-events-none"
                    style={{
                        background: useTransform(
                            [mouseX, mouseY],
                            (values: number[]) => {
                                const latestX = values[0];
                                const latestY = values[1];
                                return `radial-gradient(600px circle at ${(latestX + 0.5) * 100}% ${(latestY + 0.5) * 100}%, rgba(139, 92, 246, 0.15), transparent 40%)`
                            }
                        ),
                        opacity: isHovered ? 1 : 0
                    }}
                />

                {/* Content */}
                <div className="relative z-10 transform-gpu">
                    {children}
                </div>

                {/* Neon Border Glow */}
                <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10 group-hover:ring-white/20 transition-all duration-500" />
            </motion.div>
        </motion.div>
    )
}
