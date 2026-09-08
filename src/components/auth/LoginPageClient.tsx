'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { withRequestDeadline } from '@/lib/request-deadline'
import { signOut } from 'next-auth/react'
import LoginForm from "@/components/auth/LoginForm"
import { LoginCard } from "@/components/auth/LoginCard"
import { useTranslation } from '@/hooks/useTranslation'
import BrandLogo from '@/components/brand/BrandLogo'

function LoginPageContent({ revoked = false, unavailable = false }: { revoked?: boolean; unavailable?: boolean }) {
    const { t } = useTranslation()
    const [cleared, setCleared] = useState(!revoked)
    const [cleanupFailed, setCleanupFailed] = useState(false)
    const cleanup = useRef<Promise<unknown> | null>(null)
    useEffect(() => {
        if (!revoked) return
        let active = true
        cleanup.current ??= withRequestDeadline(() => signOut({ redirect: false }), 5_000)
        cleanup.current.then(() => { if (active) setCleared(true) })
            .catch(() => { if (active) setCleanupFailed(true) })
        return () => { active = false }
    }, [revoked])
    
    // Set dynamic page title
    useEffect(() => {
        document.title = `${t.auth.loginButton} | Desh Panel`
    }, [t.auth.loginButton])
    
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">

            {/* Background Video */}
            <div className="login-video-bg">
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                >
                    <source src="/videos/promo.webm" type="video/webm" />
                    <source src="/videos/promo.mp4" type="video/mp4" />
                </video>
            </div>

            {/* Dark Overlay */}
            <div className="login-video-overlay" />

            {/* Login Card */}
            <LoginCard>
                <div className="flex flex-col items-center w-full">

                    {/* Logo with Breathing Animation */}
                    <div className="mb-8 text-center">
                        <div className="logo-breathe mb-4">
                            <BrandLogo className="mx-auto h-32 w-72 rounded-2xl" compact />
                        </div>
                        <p className="text-slate-500 text-sm">
                            {t.panelUi.resellerSystem}
                        </p>
                    </div>

                    {unavailable || cleanupFailed ? (
                        <div role="alert" className="text-center space-y-3">
                            <p>{t.auth.unexpectedError}</p>
                            <button type="button" onClick={() => window.location.reload()}>{t.auth.tryAgain}</button>
                        </div>
                    ) : cleared ? <LoginForm /> : <p role="status">{t.common.loading}</p>}

                    <p className="text-center text-[10px] text-slate-600 mt-8 tracking-wide">
                        &copy; 2026 Desh Panel
                    </p>
                </div>
            </LoginCard>
        </div>
    )
}

export default function LoginPageClient(props: { revoked?: boolean; unavailable?: boolean }) {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#0f1218]">
                <div className="w-8 h-8 border-2 border-[#00A651] border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <LoginPageContent {...props} />
        </Suspense>
    )
}
