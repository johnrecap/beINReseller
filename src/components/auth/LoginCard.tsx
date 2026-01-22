'use client'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface LoginCardProps {
    children: React.ReactNode
    className?: string
}

export function LoginCard({ children, className }: LoginCardProps) {
    return (
        <Card
            variant="primary"
            className={cn(
                "w-full max-w-[420px] p-8 md:p-10 animate-in fade-in zoom-in-95 duration-500",
                "shadow-[var(--shadow-card)] border-[var(--color-border-default)] bg-[var(--color-bg-card)]",
                className
            )}
        >
            {children}
        </Card>
    )
}
