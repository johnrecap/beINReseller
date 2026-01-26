'use client'

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"
import { ReactNode } from "react"

interface StatCardProps {
    title: string
    value: ReactNode
    icon: LucideIcon
    description?: string
    trend?: 'up' | 'down' | 'neutral'
    className?: string
    valueClassName?: string
    isHero?: boolean
}

export function StatCard({
    title,
    value,
    icon: Icon,
    description,
    trend,
    className,
    valueClassName,
    isHero = false
}: StatCardProps) {
    return (
        <Card 
            variant="primary" 
            hover 
            className={cn(
                // Base glassmorphism styles
                "relative overflow-hidden",
                "bg-[rgba(255,255,255,0.03)] dark:bg-[rgba(255,255,255,0.03)]",
                "backdrop-blur-md",
                "border border-[rgba(255,255,255,0.08)]",
                // Hover effects
                "transition-all duration-300 ease-out",
                "hover:bg-[rgba(255,255,255,0.06)]",
                "hover:border-[rgba(255,255,255,0.12)]",
                "hover:translate-y-[-4px]",
                "hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]",
                // Hero card special styles
                isHero && [
                    "border-l-[3px] border-l-[var(--color-primary-green)]",
                    "hover:shadow-[0_20px_50px_rgba(0,166,81,0.2)]",
                ],
                className
            )}
        >
            {/* Gradient overlay for hero card */}
            {isHero && (
                <div 
                    className="absolute inset-0 bg-gradient-to-br from-[rgba(0,166,81,0.08)] via-transparent to-transparent pointer-events-none"
                    aria-hidden="true"
                />
            )}
            
            <CardContent className="p-[var(--space-6)] relative z-10">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <p className="text-[var(--font-size-sm)] font-medium text-[var(--color-text-secondary)] truncate">
                            {title}
                        </p>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className={cn(
                                "font-bold text-[var(--color-text-primary)] transition-all duration-300",
                                isHero 
                                    ? "text-[36px] text-[var(--color-primary-green)]" 
                                    : "text-[var(--font-size-3xl)]",
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
                    
                    {/* Icon container with glow effect */}
                    <div className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full",
                        "transition-all duration-300",
                        isHero 
                            ? [
                                "bg-[var(--color-primary-green)]/15",
                                "text-[var(--color-primary-green)]",
                                "shadow-[0_0_20px_rgba(0,166,81,0.2)]",
                                "group-hover:shadow-[0_0_30px_rgba(0,166,81,0.3)]"
                            ]
                            : [
                                "bg-[var(--color-primary-green)]/10",
                                "text-[var(--color-primary-green)]"
                            ]
                    )}>
                        <Icon className={cn(
                            "h-6 w-6 transition-transform duration-300",
                            "group-hover:scale-110"
                        )} />
                    </div>
                </div>

                {/* Trend indicator bar */}
                {trend && (
                    <div className={cn(
                        "absolute bottom-0 left-0 h-1 w-full opacity-60",
                        "transition-opacity duration-300",
                        "group-hover:opacity-80",
                        trend === 'up' && "bg-gradient-to-r from-[var(--color-success)] to-[var(--color-primary-green)]",
                        trend === 'down' && "bg-gradient-to-r from-[var(--color-primary-red)] to-red-600",
                        trend === 'neutral' && "bg-[var(--color-text-muted)]"
                    )} />
                )}
                
                {/* Animated border glow on hover (for hero card) */}
                {isHero && (
                    <div 
                        className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[inherit]"
                        style={{
                            background: 'linear-gradient(90deg, rgba(0,166,81,0.1), rgba(59,130,246,0.1), rgba(0,166,81,0.1))',
                            backgroundSize: '200% 100%',
                            animation: 'gradient-shift 3s ease infinite'
                        }}
                        aria-hidden="true"
                    />
                )}
            </CardContent>
        </Card>
    )
}
