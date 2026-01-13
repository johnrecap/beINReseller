'use client'

import { Suspense } from 'react'
import LoginForm from "@/components/auth/LoginForm"

function LoginPageContent() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">

            {/* Brand Header */}
            <div className="mb-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary text-white mb-4 shadow-lg shadow-primary/20">
                    <span className="text-3xl">📺</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    beIN Panel
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
                    Professional Reseller Management
                </p>
            </div>

            {/* Login Container */}
            <div className="w-full max-w-[400px]">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-200 dark:border-slate-800 p-6 md:p-8">
                    <LoginForm />
                </div>

                <p className="text-center text-xs text-slate-400 mt-8">
                    &copy; 2024 beIN Sports Reseller Panel. All rights reserved.
                </p>
            </div>

        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <div className="animate-pulse w-8 h-8 rounded-full bg-primary/20"></div>
            </div>
        }>
            <LoginPageContent />
        </Suspense>
    )
}
