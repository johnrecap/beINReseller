'use client'

import { MobileMenuButton } from './Sidebar'
import NotificationBell from '@/components/NotificationBell'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { PanelCommandMenu } from '@/components/providers/PanelCommandProvider'
// Theme toggle removed - dark theme is now permanent

interface HeaderProps {
    sidebarOpen?: boolean
    title: string
    onMenuClick: () => void
}

export default function Header({ title, onMenuClick, sidebarOpen }: HeaderProps) {
    return (
        <header className="h-[var(--header-height)] bg-[var(--color-bg-card)] border-b border-[var(--color-border-default)] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-[var(--z-header)] transition-colors duration-300">
            {/* Right Side - Menu + Title */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <MobileMenuButton expanded={sidebarOpen} onClick={onMenuClick} />
                <h1 className="sr-only">{title}</h1>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/images/brand/logo_big1.png"
                    alt={title}
                    className="h-9 min-w-0 w-28 rounded-md object-contain object-center sm:h-11 sm:w-60 lg:h-12 lg:w-80"
                />
            </div>

            {/* Left Side */}
            <div className="flex shrink-0 items-center gap-2 lg:gap-4">
                <PanelCommandMenu />
                <LanguageSwitcher />

                {/* Notifications */}
                <NotificationBell />
            </div>
        </header>
    )
}
