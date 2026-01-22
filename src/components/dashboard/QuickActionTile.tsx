'use client'

import Link from 'next/link'
import { LucideIcon, ChevronLeft } from 'lucide-react'

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
    return (
        <Link
            href={href}
            className="
                flex items-center gap-4 p-4 
                bg-[var(--color-bg-input)] 
                rounded-[var(--border-radius-md)]
                border border-transparent
                hover:bg-[var(--color-bg-elevated)]
                hover:border-[var(--color-border-default)]
                transition-all duration-[var(--transition-normal)]
                group
            "
        >
            {/* Icon Badge */}
            <div
                className="p-3 rounded-full shrink-0"
                style={{ backgroundColor: iconBgColor }}
            >
                <Icon
                    className="w-6 h-6"
                    style={{ color: iconColor }}
                />
            </div>

            {/* Text Content */}
            <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-medium text-[var(--color-text-primary)]">
                    {title}
                </h3>
                <p className="text-[14px] text-[var(--color-text-muted)] truncate">
                    {description}
                </p>
            </div>

            {/* Arrow Indicator */}
            <ChevronLeft
                className="
                    w-5 h-5 
                    text-[var(--color-text-muted)]
                    group-hover:text-[var(--color-primary-green)]
                    transition-colors duration-[var(--transition-normal)]
                    shrink-0
                "
            />
        </Link>
    )
}
