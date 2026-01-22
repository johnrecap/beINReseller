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
                    "relative flex items-center glass-input rounded-xl overflow-hidden transition-all duration-300",
                    "border-white/10 group-hover:border-white/20",
                    isFocused ? "border-[#00A651] shadow-[0_0_20px_rgba(0,166,81,0.25)] bg-[#0F1218]" : "bg-[#0a0e12]",
                    error ? "border-red-500/50" : "",
                    className
                )}>
                    {/* Icon Wrapper */}
                    {icon && (
                        <div className={cn(
                            "pl-4 pr-2 transition-colors duration-300",
                            isFocused ? "text-white" : "text-slate-500 group-hover:text-slate-400"
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
                                "w-full h-14 bg-transparent border-none outline-none text-slate-100 placeholder-transparent z-10",
                                "pt-5 pb-1 px-2 text-base font-medium",
                                "focus:ring-0 selection:bg-[#00A651]/30"
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
                                    ? "top-2 text-[10px] text-[#00A651] font-extrabold tracking-wider uppercase"
                                    : "top-1/2 -translate-y-1/2 text-slate-500 font-medium md:text-sm group-hover:text-slate-400"
                            )}
                        >
                            {label}
                        </label>
                    </div>

                    {/* Liquid Underline Effect */}
                    <motion.div
                        className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-[#00A651] to-[#006837]"
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
                        className="text-xs text-red-500 mt-1 mr-2 font-medium bg-red-500/10 px-2 py-1 rounded-md inline-block border border-red-500/20"
                    >
                        {error}
                    </motion.p>
                )}
            </div>
        )
    }
)
FloatingInput.displayName = 'FloatingInput'
