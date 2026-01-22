'use client'

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface StatCardProps {
    title: string
    value: string | number
    icon: LucideIcon
    description?: string
    trend?: 'up' | 'down' | 'neutral'
    className?: string
    valueClassName?: string
}

export function StatCard({
    title,
    value,
    icon: Icon,
    description,
    trend,
    className,
    valueClassName
}: StatCardProps) {
    return (
        <Card variant="primary" hover className={cn("relative overflow-hidden", className)}>
            <CardContent className="p-[var(--space-6)]">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[var(--font-size-sm)] font-medium text-[var(--color-text-secondary)]">
                            {title}
                        </p>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className={cn(
                                "text-[var(--font-size-3xl)] font-bold text-[var(--color-text-primary)]",
                                valueClassName
                            )}>
                                {value}
                            </span>
                        </div>
                        {description && (
                            <p className="mt-1 text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
                                {description}
                            </p>
                        )}
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-primary-green)]/10 text-[var(--color-primary-green)]">
                        <Icon className="h-6 w-6" />
                    </div>
                </div>

                {trend && (
                    <div className={cn(
                        "absolute bottom-0 left-0 h-1 w-full opacity-50",
                        trend === 'up' ? "bg-[var(--color-success)]" :
                            trend === 'down' ? "bg-[var(--color-primary-red)]" : "bg-[var(--color-text-muted)]"
                    )} />
                )}
            </CardContent>
        </Card>
    )
}
