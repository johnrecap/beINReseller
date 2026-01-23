'use client'

import { ReactNode } from 'react'

interface PageHeaderProps {
    icon: ReactNode
    iconGradient?: string
    title: string
    subtitle: string
    action?: ReactNode
}

/**
 * Unified Page Header Component for Admin Pages
 * Uses design tokens from tokens.css for consistency
 */
export default function PageHeader({
    icon,
    iconGradient = 'from-[#00A651] to-[#008f45]',
    title,
    subtitle,
    action
}: PageHeaderProps) {
    return (
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center shadow-lg`}>
                    {icon}
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{title}</h1>
                    <p className="text-muted-foreground text-sm">{subtitle}</p>
                </div>
            </div>
            {action && (
                <div className="flex gap-2">
                    {action}
                </div>
            )}
        </div>
    )
}
