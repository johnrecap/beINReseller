'use client'

import { Suspense } from 'react'
import LoginForm from "@/components/auth/LoginForm"
import { LoginCard } from "@/components/auth/LoginCard"

function LoginPageContent() {
    return (
        <div className="login-background min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">

            {/* Ambient Background Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/20 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />

            <LoginCard>
                <div className="flex flex-col items-center">
                    {/* Living Brand Header */}
                    <div className="mb-8 text-center relative">
                        <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white mb-6 shadow-2xl shadow-violet-500/30 animate-pulse-slow">
                            <span className="text-4xl filter drop-shadow-md">📺</span>
                            {/* Inner Glow */}
                            <div className="absolute inset-0 rounded-2xl ring-1 ring-white/30" />
                        </div>

                        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 drop-shadow-lg">
                            beIN Panel
                        </h1>
                        <p className="text-slate-300 text-sm font-medium tracking-wide/10">
                            Diamond Reseller Management
                        </p>
                    </div>

                    <LoginForm />

                    <p className="text-center text-[10px] text-slate-500 mt-8 tracking-wider uppercase font-semibold">
                        &copy; 2024 beIN Sports Reseller Panel
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
