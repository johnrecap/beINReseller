'use client'

import { useEffect, useState } from 'react'
import Lottie from 'lottie-react'

type EnvelopeState = 'idle' | 'opening' | 'celebration'

type EidRewardEnvelopeProps = {
    state: EnvelopeState
}

const animationByState: Record<EnvelopeState, string> = {
    idle: '/assets/eid-rewards/animation2.json',
    opening: '/assets/eid-rewards/animation1.json',
    celebration: '/assets/eid-rewards/animation3.json',
}

export default function EidRewardEnvelope({ state }: EidRewardEnvelopeProps) {
    const [loaded, setLoaded] = useState<{
        state: EnvelopeState | null
        data: unknown | null
        failed: boolean
    }>({ state: null, data: null, failed: false })

    useEffect(() => {
        let cancelled = false

        fetch(animationByState[state], { cache: 'force-cache' })
            .then((response) => {
                if (!response.ok) throw new Error('Animation not found')
                return response.json()
            })
            .then((data) => {
                if (!cancelled) setLoaded({ state, data, failed: false })
            })
            .catch(() => {
                if (!cancelled) setLoaded({ state, data: null, failed: true })
            })

        return () => {
            cancelled = true
        }
    }, [state])

    const animationData = loaded.state === state ? loaded.data : null
    const failed = loaded.state === state && loaded.failed

    if (!failed && animationData) {
        return (
            <div className="mx-auto h-44 w-44 sm:h-56 sm:w-56">
                <Lottie animationData={animationData} loop={state !== 'opening'} />
            </div>
        )
    }

    return (
        <div className="mx-auto flex h-44 w-44 items-center justify-center sm:h-56 sm:w-56">
            <div className={`eid-fallback-envelope ${state}`}>
                <div className="eid-fallback-flap" />
                <div className="eid-fallback-body" />
                <div className="eid-fallback-sparkles">
                    <span />
                    <span />
                    <span />
                    <span />
                </div>
            </div>
            <style jsx>{`
                .eid-fallback-envelope {
                    position: relative;
                    width: 132px;
                    height: 92px;
                    transform-style: preserve-3d;
                    animation: eid-shake 1.8s ease-in-out infinite;
                }
                .eid-fallback-envelope.opening,
                .eid-fallback-envelope.celebration {
                    animation: none;
                }
                .eid-fallback-body {
                    position: absolute;
                    inset: 22px 0 0;
                    border-radius: 10px;
                    background: linear-gradient(135deg, #f6c453, #c73737);
                    box-shadow: 0 20px 50px rgba(246, 196, 83, 0.28);
                }
                .eid-fallback-flap {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 0;
                    height: 0;
                    border-left: 66px solid transparent;
                    border-right: 66px solid transparent;
                    border-bottom: 52px solid #f6c453;
                    transform-origin: bottom center;
                    transition: transform 600ms ease;
                    z-index: 2;
                }
                .eid-fallback-envelope.opening .eid-fallback-flap,
                .eid-fallback-envelope.celebration .eid-fallback-flap {
                    transform: rotateX(155deg);
                }
                .eid-fallback-sparkles span {
                    position: absolute;
                    width: 7px;
                    height: 7px;
                    border-radius: 999px;
                    background: #ffffff;
                    opacity: 0;
                    animation: eid-sparkle 1.2s ease-in-out infinite;
                }
                .eid-fallback-sparkles span:nth-child(1) { left: 10px; top: -16px; animation-delay: 0ms; }
                .eid-fallback-sparkles span:nth-child(2) { right: 8px; top: 4px; animation-delay: 180ms; }
                .eid-fallback-sparkles span:nth-child(3) { left: 32px; bottom: -20px; animation-delay: 320ms; }
                .eid-fallback-sparkles span:nth-child(4) { right: 30px; bottom: -12px; animation-delay: 480ms; }
                .eid-fallback-envelope.idle .eid-fallback-sparkles span {
                    display: none;
                }
                @keyframes eid-shake {
                    0%, 100% { transform: rotate(0deg); }
                    25% { transform: rotate(2deg); }
                    75% { transform: rotate(-2deg); }
                }
                @keyframes eid-sparkle {
                    0% { opacity: 0; transform: translateY(8px) scale(0.7); }
                    50% { opacity: 1; transform: translateY(-4px) scale(1); }
                    100% { opacity: 0; transform: translateY(-18px) scale(0.8); }
                }
            `}</style>
        </div>
    )
}
