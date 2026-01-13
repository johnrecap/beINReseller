'use client'

import { Suspense } from 'react'
import LoginForm from "@/components/auth/LoginForm"
import { AnimatedBackground } from '@/components/effects'
import { motion } from 'framer-motion'

function LoginPageContent() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background */}
            <AnimatedBackground variant="login" />

            {/* Content */}
            <motion.div
                className="relative w-full max-w-md z-10"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            >
                {/* Logo */}
                <motion.div
                    className="text-center mb-8"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    <motion.div
                        className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 shadow-2xl shadow-amber-500/40 mb-4"
                        whileHover={{ scale: 1.05, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 400 }}
                    >
                        <span className="text-4xl">📺</span>
                    </motion.div>
                    <motion.h1
                        className="text-3xl font-bold text-white mb-2"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        beIN Panel
                    </motion.h1>
                    <motion.p
                        className="text-purple-200"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                    >
                        لوحة تحكم موزعي الخدمات
                    </motion.p>
                </motion.div>

                {/* Login Card */}
                <motion.div
                    className="glass-strong rounded-3xl p-8 shadow-2xl border border-white/20"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(24px)',
                    }}
                >
                    <LoginForm />
                </motion.div>

                {/* Footer */}
                <motion.p
                    className="text-center text-purple-300 text-sm mt-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                >
                    © 2024 beIN Sports Reseller Panel
                </motion.p>
            </motion.div>
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 flex items-center justify-center">
                <motion.div
                    className="text-white text-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ repeat: Infinity, repeatType: "reverse", duration: 1 }}
                >
                    جاري التحميل...
                </motion.div>
            </div>
        }>
            <LoginPageContent />
        </Suspense>
    )
}
