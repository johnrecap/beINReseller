'use client'

import React, { useState } from 'react'
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
            <div className="relative">
                <div className={cn(
                    "simple-input flex items-center overflow-hidden",
                    isFocused && "border-[#00A651]",
                    error && "border-red-500",
                    className
                )}>
                    {/* Icon */}
                    {icon && (
                        <div className={cn(
                            "pl-4 pr-2 transition-colors duration-200",
                            isFocused ? "text-white" : "text-slate-500"
                        )}>
                            {icon}
                        </div>
                    )}

                    {/* Input */}
                    <div className="relative w-full">
                        <input
                            ref={ref}
                            id={id}
                            value={value}
                            onChange={onChange}
                            className={cn(
                                "w-full h-14 bg-transparent border-none outline-none text-slate-100 placeholder-transparent",
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
                                "absolute right-2 transition-all duration-200 pointer-events-none",
                                isFocused || hasValue
                                    ? "top-2 text-[10px] text-[#00A651] font-bold uppercase tracking-wider"
                                    : "top-1/2 -translate-y-1/2 text-slate-500 text-sm"
                            )}
                        >
                            {label}
                        </label>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <p className="text-xs text-red-500 mt-1 mr-2">{error}</p>
                )}
            </div>
        )
    }
)
FloatingInput.displayName = 'FloatingInput'
