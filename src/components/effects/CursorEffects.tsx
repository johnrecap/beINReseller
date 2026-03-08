'use client'

import { useEffect, useRef, useSyncExternalStore, type JSX } from 'react'

/* ── palette defaults ─────────────────────────────────────── */
const DEFAULT_TRAIL_COLORS = ['#00A651', '#00c764', '#3b82f6', '#60a5fa', '#f59e0b']
const DEFAULT_CLICK_COLORS = ['#00A651', '#22c55e', '#ffffff', '#f59e0b']
const DEFAULT_RING_COLOR = 'rgba(0, 166, 81, 0.6)'
const TAU = Math.PI * 2

/* ── tunables ─────────────────────────────────────────────── */
const TRAIL_THROTTLE_MS = 30          // spawn trail every 30 ms max
const TRAIL_COUNT_MIN = 1             // particles per accepted mousemove
const TRAIL_COUNT_MAX = 2
const CLICK_COUNT_MIN = 5             // particles per click burst
const CLICK_COUNT_MAX = 8
const MAX_RINGS = 3
const DPR_CAP = 1.5                   // never allocate > 1.5x backing pixels

export interface CursorEffectsProps {
    enabled?: boolean
    trailEnabled?: boolean
    clickEnabled?: boolean
    trailColors?: string[]
    clickColors?: string[]
    ringColor?: string
    maxParticles?: number
}

/* ── internal types ───────────────────────────────────────── */
interface Particle {
    x: number
    y: number
    vx: number
    vy: number
    gravity: number
    color: string
    size: number
    alpha: number
    life: number        // remaining 0→1
    decay: number       // how much life decreases per dt
}

interface Ring {
    x: number
    y: number
    progress: number    // 0→1
    speed: number       // progress increment per dt
    color: string
}

/* ── helpers ──────────────────────────────────────────────── */
function rand(min: number, max: number) {
    return min + Math.random() * (max - min)
}
function randInt(min: number, max: number) {
    return Math.floor(rand(min, max + 1))
}
function pick(arr: string[]) {
    return arr[Math.floor(Math.random() * arr.length)]
}
function palette(custom: string[] | undefined, fallback: string[]): string[] {
    const c = custom?.filter(s => s.trim().length > 0)
    return c && c.length > 0 ? c : fallback
}

/* ── media query hook (SSR-safe) ──────────────────────────── */
function useMedia(query: string): boolean {
    return useSyncExternalStore(
        cb => {
            if (typeof window === 'undefined') return () => { }
            const mql = window.matchMedia(query)
            mql.addEventListener('change', cb)
            return () => mql.removeEventListener('change', cb)
        },
        () => typeof window !== 'undefined' && window.matchMedia(query).matches,
        () => false,
    )
}

/* ── component ────────────────────────────────────────────── */
export function CursorEffects({
    enabled = true,
    trailEnabled = true,
    clickEnabled = true,
    trailColors,
    clickColors,
    ringColor = DEFAULT_RING_COLOR,
    maxParticles = 50,
}: CursorEffectsProps): JSX.Element | null {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const reducedMotion = useMedia('(prefers-reduced-motion: reduce)')
    const finePointer = useMedia('(any-hover: hover) and (any-pointer: fine)')
    const active = enabled && (trailEnabled || clickEnabled) && !reducedMotion && finePointer

    useEffect(() => {
        if (!active) return

        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d', { alpha: true })
        if (!ctx) return

        const tPalette = palette(trailColors, DEFAULT_TRAIL_COLORS)
        const cPalette = palette(clickColors, DEFAULT_CLICK_COLORS)
        const rColor = ringColor.trim() || DEFAULT_RING_COLOR
        const cap = Math.max(0, Math.floor(maxParticles))

        let particles: Particle[] = []
        let rings: Ring[] = []
        let rafId: number | null = null
        let lastSpawn = 0
        let w = 0
        let h = 0

        /* ── canvas sizing ──────────────────────────────── */
        const resize = () => {
            w = window.innerWidth
            h = window.innerHeight
            const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
            canvas.style.width = `${w}px`
            canvas.style.height = `${h}px`
            canvas.width = Math.floor(w * dpr)
            canvas.height = Math.floor(h * dpr)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }

        /* ── animation loop ─────────────────────────────── */
        const tick = () => {
            rafId = null

            try {
                ctx.clearRect(0, 0, w, h)

                // update & draw particles
                let alive = 0
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i]
                    p.life -= p.decay
                    if (p.life <= 0) continue

                    p.vy += p.gravity
                    p.x += p.vx
                    p.y += p.vy
                    p.alpha = p.life
                    p.size *= 0.98

                    if (p.size < 0.3) continue

                    ctx.globalAlpha = p.alpha
                    ctx.fillStyle = p.color
                    ctx.beginPath()
                    ctx.arc(p.x, p.y, p.size, 0, TAU)
                    ctx.fill()

                    particles[alive++] = p
                }
                particles.length = alive

                // update & draw rings
                let rAlive = 0
                for (let i = 0; i < rings.length; i++) {
                    const r = rings[i]
                    r.progress += r.speed
                    if (r.progress >= 1) continue

                    const radius = 35 * r.progress
                    const fade = 1 - r.progress
                    ctx.globalAlpha = fade * 0.5
                    ctx.strokeStyle = r.color
                    ctx.lineWidth = 1.5 * fade
                    ctx.beginPath()
                    ctx.arc(r.x, r.y, radius, 0, TAU)
                    ctx.stroke()

                    rings[rAlive++] = r
                }
                rings.length = rAlive

                ctx.globalAlpha = 1
            } catch {
                // swallow to keep RAF chain alive
            }

            if (particles.length > 0 || rings.length > 0) {
                rafId = requestAnimationFrame(tick)
            }
        }

        const kick = () => {
            if (rafId === null && (particles.length > 0 || rings.length > 0)) {
                rafId = requestAnimationFrame(tick)
            }
        }

        /* ── spawn helpers ──────────────────────────────── */
        const spawnTrail = (x: number, y: number) => {
            const count = randInt(TRAIL_COUNT_MIN, TRAIL_COUNT_MAX)
            for (let i = 0; i < count; i++) {
                if (particles.length >= cap) particles.shift()
                particles.push({
                    x,
                    y,
                    vx: rand(-1.5, 1.5),
                    vy: rand(-2, 0.5),
                    gravity: rand(0.04, 0.09),
                    color: pick(tPalette),
                    size: rand(2, 4),
                    alpha: 0.85,
                    life: 1,
                    decay: rand(0.015, 0.03),
                })
            }
        }

        const spawnBurst = (x: number, y: number) => {
            const count = randInt(CLICK_COUNT_MIN, CLICK_COUNT_MAX)
            for (let i = 0; i < count; i++) {
                if (particles.length >= cap) particles.shift()
                const angle = (TAU / count) * i + rand(-0.25, 0.25)
                const speed = rand(2.5, 5)
                particles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    gravity: rand(0.02, 0.05),
                    color: pick(cPalette),
                    size: rand(2.5, 5),
                    alpha: 0.9,
                    life: 1,
                    decay: rand(0.01, 0.022),
                })
            }
            // ring
            if (rings.length >= MAX_RINGS) rings.shift()
            rings.push({ x, y, progress: 0, speed: rand(0.035, 0.05), color: rColor })
        }

        /* ── event handlers ─────────────────────────────── */
        const onMove = (e: MouseEvent) => {
            if (!trailEnabled) return
            const now = e.timeStamp
            if (now - lastSpawn < TRAIL_THROTTLE_MS) return
            lastSpawn = now
            spawnTrail(e.clientX, e.clientY)
            kick()
        }

        const onDown = (e: MouseEvent) => {
            if (!clickEnabled || e.button !== 0) return
            spawnBurst(e.clientX, e.clientY)
            kick()
        }

        /* ── attach ─────────────────────────────────────── */
        resize()
        window.addEventListener('resize', resize)
        window.addEventListener('mousemove', onMove, { passive: true })
        window.addEventListener('mousedown', onDown, { passive: true })

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId)
            window.removeEventListener('resize', resize)
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mousedown', onDown)
            particles = []
            rings = []
            ctx.clearRect(0, 0, w, h)
        }
    }, [active, trailEnabled, clickEnabled, trailColors, clickColors, ringColor, maxParticles])

    if (!active) return null

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none fixed inset-0"
            style={{ zIndex: 50 }}
        />
    )
}
