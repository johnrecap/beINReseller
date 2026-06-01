'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import BrandLogo from '@/components/brand/BrandLogo'

interface MaintenanceOverlayProps {
    message?: string
    pauseUntil?: string | null
}

function getRemainingParts(pauseUntil?: string | null) {
    if (!pauseUntil) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: false }
    }

    const target = new Date(pauseUntil).getTime()
    const remaining = Math.max(0, target - Date.now())
    const totalSeconds = Math.floor(remaining / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    return { days, hours, minutes, seconds, ended: target <= Date.now() }
}

function CountdownCell({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
    return (
        <div className="group relative flex flex-col items-center justify-center overflow-hidden rounded-lg border border-white/5 bg-[#1f1f26]/50 p-6">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <span className={accent ? "font-mono text-5xl font-bold leading-none text-[#9ffb06]" : "font-mono text-5xl font-bold leading-none text-[#e4e1ea]"}>
                {String(value).padStart(2, '0')}
            </span>
            <span className="stitch-label mt-2 text-[#c0caae]">{label}</span>
        </div>
    )
}

/**
 * Non-dismissable overlay that blocks interaction when maintenance mode is enabled
 * Used specifically on the renewal page
 */
export default function MaintenanceOverlay({ message, pauseUntil }: MaintenanceOverlayProps) {
    const { t } = useTranslation()
    const [, setNowTick] = useState(0)

    const defaultMessage = (t.maintenance as { message?: string })?.message || 'System is under maintenance, please try again later'
    const remaining = getRemainingParts(pauseUntil)

    useEffect(() => {
        const timer = window.setInterval(() => setNowTick((current) => current + 1), 1000)
        return () => window.clearInterval(timer)
    }, [])

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#0e0e14] px-5 text-[#e4e1ea]"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="pointer-events-none absolute inset-0 opacity-25 stitch-grid-bg" />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[55vh] overflow-hidden">
                <div className="stitch-perspective-grid absolute inset-x-0 top-0 bottom-[-50%]" />
            </div>
            <div className="pointer-events-none absolute h-[640px] w-[640px] rounded-full bg-[#571bc1]/20 blur-[150px]" />
            <main className="relative z-10 w-full max-w-4xl">
                <div className="stitch-glass stitch-tech-glow flex flex-col items-center rounded-xl p-8 text-center md:p-12">
                    <div className="mb-12">
                        <BrandLogo className="mx-auto h-36 w-full max-w-md rounded-2xl" />
                        <div className="mx-auto mt-5 h-px w-40 bg-gradient-to-r from-transparent via-[#9ffb06] to-transparent opacity-60" />
                    </div>

                    <div className="mb-16 max-w-2xl space-y-4">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#ffb4ab]/20 bg-[#93000a]/20 px-4 py-1.5">
                            <AlertTriangle className="h-4 w-4 text-[#ffb4ab]" />
                            <span className="stitch-label text-[#ffb4ab]">System Offline</span>
                        </div>
                        <h2 className="text-3xl font-bold text-[#e4e1ea]">
                            {(t.maintenance as { title?: string })?.title || 'Panel Under Maintenance'}
                        </h2>
                        <p className="text-lg leading-relaxed text-[#c0caae]">
                            {message || defaultMessage}
                        </p>
                    </div>

                    <div className="mb-16 grid w-full max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
                        <CountdownCell value={remaining.days} label="Days" />
                        <CountdownCell value={remaining.hours} label="Hours" />
                        <CountdownCell value={remaining.minutes} label="Minutes" />
                        <CountdownCell value={remaining.seconds} label="Seconds" accent />
                    </div>

                    <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#2a2930]/60 px-6 py-3">
                        <RefreshCw className="h-5 w-5 text-[#d0bcff]" />
                        <span className="text-sm text-[#c0caae]">
                            {remaining.ended && pauseUntil
                                ? 'Service resume time has passed. Checking service status.'
                                : 'Service will resume automatically when the timer ends.'}
                        </span>
                    </div>
                </div>
            </main>
        </div>
    )
}
