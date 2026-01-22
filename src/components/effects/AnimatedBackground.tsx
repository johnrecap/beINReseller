'use client'

import { motion } from 'framer-motion'

interface AnimatedBackgroundProps {
    variant?: 'default' | 'login' | 'subtle'
    className?: string
}

// Pre-compute particle positions to avoid Math.random during render
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: (i * 5 + 3) % 100,
    top: ((i * 7 + 11) % 100),
    duration: 3 + (i % 4),
    delay: (i % 5) * 0.4,
}))

export function AnimatedBackground({ variant = 'default', className = '' }: AnimatedBackgroundProps) {
    if (variant === 'login') {
        return (
            <div className={`absolute inset-0 overflow-hidden ${className}`}>
                {/* Gradient Base - beIN Navy/Black */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0F1218] via-[#020617] to-[#1a1e29]" />

                {/* Noise Texture Overlay */}
                <div className="noise-overlay" />

                {/* Animated Blobs - beIN Colors */}
                <motion.div
                    className="absolute -top-40 -right-40 w-80 h-80 bg-[#00A651]/20 rounded-full blur-3xl"
                    animate={{
                        x: [0, 50, 0],
                        y: [0, 30, 0],
                        scale: [1, 1.1, 1],
                    }}
                    transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
                <motion.div
                    className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#ED1C24]/10 rounded-full blur-3xl"
                    animate={{
                        x: [0, -30, 0],
                        y: [0, -50, 0],
                        scale: [1, 0.9, 1],
                    }}
                    transition={{
                        duration: 10,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
                <motion.div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#00A651]/10 rounded-full blur-3xl"
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.2, 0.4, 0.2],
                    }}
                    transition={{
                        duration: 6,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />

                {/* Particles */}
                {PARTICLES.map((particle) => (
                    <motion.div
                        key={particle.id}
                        className="absolute w-1 h-1 bg-white/20 rounded-full"
                        style={{
                            left: `${particle.left}%`,
                            top: `${particle.top}%`,
                        }}
                        animate={{
                            y: [0, -30, 0],
                            opacity: [0.1, 0.5, 0.1],
                        }}
                        transition={{
                            duration: particle.duration,
                            repeat: Infinity,
                            delay: particle.delay,
                            ease: "easeInOut"
                        }}
                    />
                ))}
            </div>
        )
    }

    if (variant === 'subtle') {
        return (
            <div className={`fixed inset-0 -z-10 overflow-hidden pointer-events-none ${className}`}>
                {/* Very subtle gradient */}
                <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-primary/5 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-gradient-to-tr from-accent/5 via-transparent to-transparent" />
            </div>
        )
    }

    // Default variant
    return (
        <div className={`fixed inset-0 -z-10 overflow-hidden pointer-events-none ${className}`}>
            {/* Gradient Orbs */}
            <motion.div
                className="absolute -top-20 -right-20 w-96 h-96 bg-primary/10 dark:bg-primary/20 rounded-full blur-3xl"
                animate={{
                    x: [0, 30, 0],
                    y: [0, 20, 0],
                }}
                transition={{
                    duration: 12,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />
            <motion.div
                className="absolute -bottom-20 -left-20 w-80 h-80 bg-accent/10 dark:bg-accent/20 rounded-full blur-3xl"
                animate={{
                    x: [0, -20, 0],
                    y: [0, -30, 0],
                }}
                transition={{
                    duration: 15,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />
        </div>
    )
}
