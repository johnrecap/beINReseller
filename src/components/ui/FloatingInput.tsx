'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string
    icon?: React.ReactNode
    error?: string
}

export const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
    ({ className, label, icon, error, id, value, onChange, ...props }, ref) => {
        const [isFocused, setIsFocused] = useState(false)
        const hasValue = value && value.toString().length > 0

        return (
            <div className="relative group">
                <div className={cn(
                    "relative flex items-center glass-input rounded-xl overflow-hidden",
                    "border-white/10 group-hover:border-white/20",
                    isFocused ? "border-violet-500/50 shadow-[0_0_20px_rgba(124,58,237,0.2)]" : "",
                    error ? "border-red-500/50" : "",
                    className
                )}>
                    {/* Icon Wrapper */}
                    {icon && (
                        <div className={cn(
                            "pl-4 pr-2 transition-colors duration-300",
                            isFocused ? "text-violet-400" : "text-slate-400"
                        )}>
                            {icon}
                        </div>
                    )}

                    {/* Input Field */}
                    <div className="relative w-full">
                        <input
                            ref={ref}
                            id={id}
                            value={value}
                            onChange={onChange}
                            className={cn(
                                "w-full h-14 bg-transparent border-none outline-none text-slate-200 placeholder-transparent z-10",
                                "pt-5 pb-1 px-2 text-base font-medium",
                                "focus:ring-0"
                            )}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            placeholder={label}
                            {...props}
                        />

                        {/* Floating Label */}
                        <label
                            htmlFor={id}
                            className={cn(
                                "absolute right-2 transition-all duration-300 pointer-events-none",
                                isFocused || hasValue
                                    ? "top-2 text-[11px] text-violet-400 font-bold tracking-wide"
                                    : "top-1/2 -translate-y-1/2 text-slate-400 font-medium md:text-sm"
                            )}
                        >
                            {label}
                        </label>
                    </div>

                    {/* Liquid Underline Effect */}
                    <motion.div
                        className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-violet-600 to-indigo-600"
                        initial={{ width: "0%" }}
                        animate={{ width: isFocused ? "100%" : "0%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                </div>

                {/* Error Message */}
                {error && (
                    <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs text-red-400 mt-1 mr-2"
                    >
                        {error}
                    </motion.p>
                )}
            </div>
        )
    }
)
FloatingInput.displayName = 'FloatingInput'
