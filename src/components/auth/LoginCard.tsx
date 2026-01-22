'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface LoginCardProps {
    children: React.ReactNode
    className?: string
}

export function LoginCard({ children, className }: LoginCardProps) {
    return (
        <div
            className={cn(
                "login-card w-full max-w-[420px] p-8 md:p-10",
                className
            )}
        >
            {children}
        </div>
    )
}
