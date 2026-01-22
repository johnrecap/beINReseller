'use client'

import { Suspense } from 'react'
import Image from 'next/image'
import LoginForm from "@/components/auth/LoginForm"
import { LoginCard } from "@/components/auth/LoginCard"

function LoginPageContent() {
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
                            <Image
                                src="/images/logo.png"
                                alt="Desh Panel"
                                width={280}
                                height={80}
                                className="mx-auto"
                                priority
                            />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-1">
                            Desh Panel
                        </h1>
                        <p className="text-slate-500 text-sm">
                            Reseller Management System
                        </p>
                    </div>

                    <LoginForm />

                    <p className="text-center text-[10px] text-slate-600 mt-8 tracking-wide">
                        &copy; 2026 Desh Panel
                    </p>
                </div>
            </LoginCard>
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#0f1218]">
                <div className="w-8 h-8 border-2 border-[#00A651] border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <LoginPageContent />
        </Suspense>
    )
}
