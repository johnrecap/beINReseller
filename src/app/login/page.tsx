'use client'

import { Suspense } from 'react'
import LoginForm from "@/components/auth/LoginForm"
import { LoginCard } from "@/components/auth/LoginCard"

import { VideoFrame } from "@/components/auth/VideoFrame"
import { AnimatedBackground } from "@/components/effects/AnimatedBackground"

function LoginPageContent() {
    return (
        <div className="login-background min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">

            {/* Animated Background Elements */}
            <AnimatedBackground variant="login" />

            <LoginCard className="mt-8">
                <div className="flex flex-col items-center w-full">

                    {/* Hero Video Frame */}
                    <div className="mb-8 w-full">
                        <VideoFrame
                            videoSrc="/videos/promo.mp4"
                            className="w-full"
                        />
                    </div>

                    <div className="text-center mb-6">
                        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 drop-shadow-lg">
                            beIN Panel
                        </h1>
                        <p className="text-slate-400 text-sm font-medium tracking-wide">
                            Diamond Reseller Management
                        </p>
                    </div>

                    <LoginForm />

                    <p className="text-center text-[10px] text-slate-600 mt-8 tracking-wider uppercase font-semibold">
                        &copy; 2026 beIN Sports Reseller Panel
                    </p>
                </div>
            </LoginCard>
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#020617]">
                <div className="animate-pulse w-12 h-12 rounded-full bg-violet-600/20 ring-4 ring-violet-600/10"></div>
            </div>
        }>
            <LoginPageContent />
        </Suspense>
    )
}
