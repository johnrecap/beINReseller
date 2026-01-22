'use client'

import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"
import { Card } from "./card"

interface ActivityItemProps {
    title: string
    subtitle?: string
    status?: 'success' | 'pending' | 'failed' | 'default'
    timestamp: string
    icon?: LucideIcon
    className?: string
}

export function ActivityItem({
    title,
    subtitle,
    status = 'default',
    timestamp,
    icon: Icon,
    className
}: ActivityItemProps) {

    const statusColors = {
        success: "text-[var(--color-success)] bg-[var(--color-success-bg)]",
        pending: "text-[var(--color-warning)] bg-[var(--color-warning-bg)]",
        failed: "text-[var(--color-error)] bg-[var(--color-error-bg)]",
        default: "text-[var(--color-text-secondary)] bg-[var(--color-bg-elevated)]"
    }

    return (
        <div className={cn("flex items-start gap-4 p-4 rounded-lg hover:bg-[var(--color-bg-elevated)] transition-colors", className)}>
            {Icon && (
                <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    statusColors[status]
                )}>
                    <Icon className="h-5 w-5" />
                </div>
            )}

            <div className="flex-1 min-w-0">
                <p className="text-[var(--font-size-sm)] font-medium text-[var(--color-text-primary)] truncate">
                    {title}
                </p>
                {subtitle && (
                    <p className="text-[var(--font-size-xs)] text-[var(--color-text-secondary)] mt-0.5">
                        {subtitle}
                    </p>
                )}
            </div>

            <span className="text-[var(--font-size-xs)] text-[var(--color-text-muted)] whitespace-nowrap">
                {timestamp}
            </span>
        </div>
    )
}
