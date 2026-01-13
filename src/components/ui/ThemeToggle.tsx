'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'

// Avoid hydration mismatch by checking if mounted
const subscribe = () => () => { }
const getSnapshot = () => true
const getServerSnapshot = () => false

export function ThemeToggle() {
    const { setTheme, resolvedTheme } = useTheme()
    const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    if (!mounted) {
        return (
            <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
        )
    }

    const isDark = resolvedTheme === 'dark'

    return (
        <motion.button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center overflow-hidden shadow-lg hover:shadow-xl transition-shadow border border-gray-200 dark:border-gray-600"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            <AnimatePresence mode="wait">
                {isDark ? (
                    <motion.div
                        key="moon"
                        initial={{ rotate: -90, opacity: 0, scale: 0 }}
                        animate={{ rotate: 0, opacity: 1, scale: 1 }}
                        exit={{ rotate: 90, opacity: 0, scale: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="absolute"
                    >
                        <Moon className="w-5 h-5 text-purple-300" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="sun"
                        initial={{ rotate: 90, opacity: 0, scale: 0 }}
                        animate={{ rotate: 0, opacity: 1, scale: 1 }}
                        exit={{ rotate: -90, opacity: 0, scale: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="absolute"
                    >
                        <Sun className="w-5 h-5 text-amber-500" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Glow effect */}
            <div className={`absolute inset-0 rounded-xl opacity-0 hover:opacity-100 transition-opacity duration-300 ${isDark ? 'bg-purple-500/20' : 'bg-amber-500/20'}`} />
        </motion.button>
    )
}
