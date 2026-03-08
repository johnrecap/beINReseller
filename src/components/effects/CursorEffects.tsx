'use client'

import { useEffect, useRef, useSyncExternalStore, type JSX } from 'react'

const DEFAULT_TRAIL_COLORS = ['#00A651', '#00c764', '#3b82f6', '#60a5fa', '#f59e0b'] as const
const DEFAULT_CLICK_COLORS = ['#00A651', '#22c55e', '#ffffff', '#f59e0b'] as const
const DEFAULT_RING_COLOR = 'rgba(0, 166, 81, 0.6)'
const TAU = Math.PI * 2
const TRAIL_SPAWN_INTERVAL_MS = 16
const MAX_ACTIVE_RINGS = 4

export interface CursorEffectsProps {
    enabled?: boolean
    trailEnabled?: boolean
    clickEnabled?: boolean
    trailColors?: string[]
    clickColors?: string[]
    ringColor?: string
    maxParticles?: number
}

interface Particle {
    x: number
    y: number
    vx: number
    vy: number
    gravity: number
    color: string
    initialSize: number
    initialAlpha: number
    shadowBlur: number
    lifeMs: number
    createdAt: number
}

interface RingRipple {
    x: number
    y: number
    maxRadius: number
    initialLineWidth: number
    color: string
    lifeMs: number
    createdAt: number
}

interface CanvasSize {
    width: number
    height: number
    dpr: number
}

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number): number {
    return Math.floor(randomBetween(min, max + 1))
}

function pickRandomColor(colors: string[]): string {
    return colors[randomInt(0, colors.length - 1)]
}

function normalizeColors(colors: string[] | undefined, fallback: readonly string[]): string[] {
    const filteredColors = colors?.map((color) => color.trim()).filter((color) => color.length > 0) ?? []
    return filteredColors.length > 0 ? filteredColors : [...fallback]
}

function attachMediaQueryListener(query: MediaQueryList, handler: () => void): () => void {
    if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', handler)
        return () => query.removeEventListener('change', handler)
    }

    const legacyHandler = handler as unknown as (this: MediaQueryList, event: MediaQueryListEvent) => void
    query.addListener(legacyHandler)
    return () => query.removeListener(legacyHandler)
}

function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (onStoreChange) => {
            if (typeof window === 'undefined') {
                return () => undefined
            }

            const mediaQuery = window.matchMedia(query)
            return attachMediaQueryListener(mediaQuery, onStoreChange)
        },
        () => {
            if (typeof window === 'undefined') {
                return false
            }

            return window.matchMedia(query).matches
        },
        () => false,
    )
}

export function CursorEffects({
    enabled = true,
    trailEnabled = true,
    clickEnabled = true,
    trailColors,
    clickColors,
    ringColor = DEFAULT_RING_COLOR,
    maxParticles = 80,
}: CursorEffectsProps): JSX.Element | null {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const particlesRef = useRef<Particle[]>([])
    const ringsRef = useRef<RingRipple[]>([])
    const animationFrameRef = useRef<number | null>(null)
    const lastFrameTimeRef = useRef<number | null>(null)
    const lastTrailSpawnTimeRef = useRef(0)
    const canvasSizeRef = useRef<CanvasSize>({ width: 0, height: 0, dpr: 1 })
    const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
    const hasFinePointer = useMediaQuery('(any-hover: hover) and (any-pointer: fine)')
    const shouldRender = enabled && (trailEnabled || clickEnabled) && !prefersReducedMotion && hasFinePointer

    useEffect(() => {
        if (!shouldRender) {
            return
        }

        const canvas = canvasRef.current
        if (!canvas) {
            return
        }

        const context = canvas.getContext('2d')
        if (!context) {
            return
        }

        const trailPalette = normalizeColors(trailColors, DEFAULT_TRAIL_COLORS)
        const clickPalette = normalizeColors(clickColors, DEFAULT_CLICK_COLORS)
        const resolvedRingColor = ringColor.trim().length > 0 ? ringColor : DEFAULT_RING_COLOR
        const particleLimit = Math.max(0, Math.floor(maxParticles))

        const stopAnimation = () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current)
                animationFrameRef.current = null
            }
            lastFrameTimeRef.current = null
        }

        const clearCanvas = () => {
            context.setTransform(canvasSizeRef.current.dpr, 0, 0, canvasSizeRef.current.dpr, 0, 0)
            context.clearRect(0, 0, canvasSizeRef.current.width, canvasSizeRef.current.height)
            context.globalAlpha = 1
            context.shadowBlur = 0
        }

        const resizeCanvas = () => {
            const width = window.innerWidth
            const height = window.innerHeight
            const dpr = Math.min(window.devicePixelRatio || 1, 2)

            canvasSizeRef.current = { width, height, dpr }
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            canvas.width = Math.floor(width * dpr)
            canvas.height = Math.floor(height * dpr)
            context.setTransform(dpr, 0, 0, dpr, 0, 0)
            context.lineCap = 'round'
            context.lineJoin = 'round'
            clearCanvas()
        }

        const trimParticleOverflow = (incomingCount: number) => {
            if (particleLimit <= 0) {
                particlesRef.current = []
                return
            }

            const overflow = particlesRef.current.length + incomingCount - particleLimit
            if (overflow > 0) {
                particlesRef.current.splice(0, overflow)
            }
        }

        const drawFrame = (timestamp: number) => {
            const previousFrameTime = lastFrameTimeRef.current
            const delta = previousFrameTime === null
                ? 1
                : Math.min((timestamp - previousFrameTime) / 16.67, 2)

            lastFrameTimeRef.current = timestamp
            clearCanvas()

            const nextParticles: Particle[] = []
            for (const particle of particlesRef.current) {
                const progress = (timestamp - particle.createdAt) / particle.lifeMs
                if (progress >= 1) {
                    continue
                }

                particle.vy += particle.gravity * delta
                particle.x += particle.vx * delta
                particle.y += particle.vy * delta

                const alpha = particle.initialAlpha * (1 - progress)
                const size = particle.initialSize * (1 - progress)
                if (alpha <= 0.01 || size <= 0.1) {
                    continue
                }

                context.globalAlpha = alpha
                context.fillStyle = particle.color
                context.shadowColor = particle.color
                context.shadowBlur = particle.shadowBlur * (1 - progress * 0.35)
                context.beginPath()
                context.arc(particle.x, particle.y, size, 0, TAU)
                context.fill()

                nextParticles.push(particle)
            }

            const nextRings: RingRipple[] = []
            for (const ring of ringsRef.current) {
                const progress = (timestamp - ring.createdAt) / ring.lifeMs
                if (progress >= 1) {
                    continue
                }

                const easedProgress = 1 - (1 - progress) * (1 - progress)
                const lineWidth = ring.initialLineWidth * (1 - progress)
                if (lineWidth <= 0.05) {
                    continue
                }

                context.globalAlpha = 1 - progress
                context.strokeStyle = ring.color
                context.lineWidth = lineWidth
                context.shadowColor = ring.color
                context.shadowBlur = 12 * (1 - progress)
                context.beginPath()
                context.arc(ring.x, ring.y, ring.maxRadius * easedProgress, 0, TAU)
                context.stroke()

                nextRings.push(ring)
            }

            context.globalAlpha = 1
            context.shadowBlur = 0

            particlesRef.current = nextParticles
            ringsRef.current = nextRings

            if (nextParticles.length > 0 || nextRings.length > 0) {
                animationFrameRef.current = requestAnimationFrame(drawFrame)
                return
            }

            animationFrameRef.current = null
            lastFrameTimeRef.current = null
        }

        const ensureAnimationLoop = () => {
            if (animationFrameRef.current !== null) {
                return
            }

            if (particlesRef.current.length === 0 && ringsRef.current.length === 0) {
                return
            }

            lastFrameTimeRef.current = null
            animationFrameRef.current = requestAnimationFrame(drawFrame)
        }

        const handleMouseMove = (event: MouseEvent) => {
            if (!trailEnabled) {
                return
            }

            if (event.timeStamp - lastTrailSpawnTimeRef.current < TRAIL_SPAWN_INTERVAL_MS) {
                return
            }

            lastTrailSpawnTimeRef.current = event.timeStamp

            const particleCount = randomInt(2, 3)
            const createdAt = performance.now()
            trimParticleOverflow(particleCount)

            if (particleLimit > 0) {
                for (let index = 0; index < particleCount; index += 1) {
                    particlesRef.current.push({
                        x: event.clientX,
                        y: event.clientY,
                        vx: randomBetween(-0.8, 0.8),
                        vy: randomBetween(-0.35, 0.45),
                        gravity: randomBetween(0.03, 0.06),
                        color: pickRandomColor(trailPalette),
                        initialSize: randomBetween(1.5, 4),
                        initialAlpha: 0.8,
                        shadowBlur: randomBetween(8, 14),
                        lifeMs: randomBetween(400, 800),
                        createdAt,
                    })
                }
            }

            ensureAnimationLoop()
        }

        const handleMouseDown = (event: MouseEvent) => {
            if (!clickEnabled || event.button !== 0) {
                return
            }

            const particleCount = randomInt(8, 12)
            const createdAt = performance.now()
            trimParticleOverflow(particleCount)

            if (particleLimit > 0) {
                const angleStep = TAU / particleCount
                for (let index = 0; index < particleCount; index += 1) {
                    const angle = index * angleStep + randomBetween(-0.18, 0.18)
                    const speed = randomBetween(1.8, 4.2)

                    particlesRef.current.push({
                        x: event.clientX,
                        y: event.clientY,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        gravity: randomBetween(0.01, 0.03),
                        color: pickRandomColor(clickPalette),
                        initialSize: randomBetween(2, 5),
                        initialAlpha: 0.9,
                        shadowBlur: randomBetween(10, 18),
                        lifeMs: randomBetween(500, 1000),
                        createdAt,
                    })
                }
            }

            if (ringsRef.current.length >= MAX_ACTIVE_RINGS) {
                ringsRef.current.shift()
            }

            ringsRef.current.push({
                x: event.clientX,
                y: event.clientY,
                maxRadius: 40,
                initialLineWidth: 2,
                color: resolvedRingColor,
                lifeMs: 400,
                createdAt,
            })

            ensureAnimationLoop()
        }

        particlesRef.current = []
        ringsRef.current = []
        lastTrailSpawnTimeRef.current = 0
        resizeCanvas()

        window.addEventListener('resize', resizeCanvas)
        window.addEventListener('mousemove', handleMouseMove, { passive: true })
        window.addEventListener('mousedown', handleMouseDown, { passive: true })

        return () => {
            stopAnimation()
            window.removeEventListener('resize', resizeCanvas)
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mousedown', handleMouseDown)
            particlesRef.current = []
            ringsRef.current = []
            clearCanvas()
        }
    }, [shouldRender, trailEnabled, clickEnabled, trailColors, clickColors, ringColor, maxParticles])

    if (!shouldRender) {
        return null
    }

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[9999]"
        />
    )
}
