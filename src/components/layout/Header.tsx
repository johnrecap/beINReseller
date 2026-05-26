'use client'

import { MobileMenuButton } from './Sidebar'
import NotificationBell from '@/components/NotificationBell'
import LanguageSwitcher from '@/components/LanguageSwitcher'
// Theme toggle removed - dark theme is now permanent

interface HeaderProps {
    title: string
    onMenuClick: () => void
}

export default function Header({ title, onMenuClick }: HeaderProps) {
    return (
        <header className="h-[var(--header-height)] bg-[var(--color-bg-card)] border-b border-[var(--color-border-default)] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-[var(--z-header)] transition-colors duration-300">
            {/* Right Side - Menu + Title */}
            <div className="flex items-center gap-3">
                <MobileMenuButton onClick={onMenuClick} />
                <h1 className="sr-only">{title}</h1>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/images/brand/logo_big1.png"
                    alt={title}
                    className="h-8 w-24 object-contain object-right min-[390px]:w-32 sm:h-10 sm:w-52 lg:h-11 lg:w-64"
                />
            </div>

            {/* Left Side */}
            <div className="flex items-center gap-2 lg:gap-4">
                {/* Language Switcher */}
                <LanguageSwitcher />

                {/* Notifications */}
                <NotificationBell />
            </div>
        </header>
    )
}
