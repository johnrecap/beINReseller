'use client'

import Link from 'next/link'
import { LucideIcon, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickActionTileProps {
    href: string
    icon: LucideIcon
    iconColor: string
    iconBgColor: string
    title: string
    description: string
}

export default function QuickActionTile({
    href,
    icon: Icon,
    iconColor,
    iconBgColor,
    title,
    description
}: QuickActionTileProps) {
    // Determine if it's green or blue themed for hover effects
    const isGreen = iconColor.toLowerCase().includes('a651') || iconColor.toLowerCase().includes('00a6')
    
    return (
        <Link
            href={href}
            className={cn(
                // Base styles with glassmorphism
                "relative flex items-center gap-4 p-4",
                "bg-[rgba(255,255,255,0.03)]",
                "backdrop-blur-sm",
                "rounded-[var(--border-radius-md)]",
                "border border-[rgba(255,255,255,0.06)]",
                "overflow-hidden",
                // Transitions
                "transition-all duration-300 ease-out",
                // Hover effects
                "hover:bg-[rgba(255,255,255,0.06)]",
                "hover:border-[rgba(255,255,255,0.12)]",
                "hover:translate-x-[-4px]", // Slight RTL-aware movement
                isGreen 
                    ? "hover:shadow-[0_8px_30px_rgba(0,166,81,0.15)]" 
                    : "hover:shadow-[0_8px_30px_rgba(59,130,246,0.15)]",
                "group"
            )}
        >
            {/* Gradient overlay on hover */}
            <div 
                className={cn(
                    "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
                    isGreen 
                        ? "bg-gradient-to-r from-[rgba(0,166,81,0.05)] to-transparent"
                        : "bg-gradient-to-r from-[rgba(59,130,246,0.05)] to-transparent"
                )}
                aria-hidden="true"
            />
            
            {/* Icon Badge with glow effect */}
            <div
                className={cn(
                    "relative p-3 rounded-full shrink-0",
                    "transition-all duration-300",
                    "group-hover:scale-110",
                    isGreen 
                        ? "group-hover:shadow-[0_0_20px_rgba(0,166,81,0.3)]"
                        : "group-hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                )}
                style={{ backgroundColor: iconBgColor }}
            >
                <Icon
                    className="w-6 h-6 transition-transform duration-300 group-hover:scale-105"
                    style={{ color: iconColor }}
                />
            </div>

            {/* Text Content */}
            <div className="flex-1 min-w-0 relative z-10">
                <h3 className="text-[16px] font-medium text-[var(--color-text-primary)] transition-colors duration-300 group-hover:text-white">
                    {title}
                </h3>
                <p className="text-[14px] text-[var(--color-text-muted)] truncate transition-colors duration-300 group-hover:text-[var(--color-text-secondary)]">
                    {description}
                </p>
            </div>

            {/* Arrow Indicator with animation */}
            <ChevronLeft
                className={cn(
                    "w-5 h-5 shrink-0",
                    "text-[var(--color-text-muted)]",
                    "transition-all duration-300",
                    "group-hover:translate-x-[-4px]",
                    isGreen 
                        ? "group-hover:text-[var(--color-primary-green)]"
                        : "group-hover:text-blue-400"
                )}
            />
        </Link>
    )
}
