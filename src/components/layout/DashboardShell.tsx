'use client'

import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { useTranslation } from '@/hooks/useTranslation'
import { cn } from '@/lib/utils'

interface DashboardShellProps {
    children: React.ReactNode
}

export default function DashboardShell({ children }: DashboardShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const { t, dir } = useTranslation()

    return (
        <div className="min-h-screen bg-[var(--color-bg-main)]" dir={dir}>
            {/* Sidebar */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content Area */}
            <div className={cn(
                "min-h-screen transition-all duration-300",
                dir === 'rtl' ? "lg:mr-[var(--sidebar-width)]" : "lg:ml-[var(--sidebar-width)]"
            )}>
                {/* Header */}
                <Header title={t.common.controlPanel} onMenuClick={() => setSidebarOpen(true)} />

                {/* Page Content */}
                <main className="p-[var(--page-padding-mobile)] lg:p-[var(--page-padding)] max-w-[var(--content-max-width)] mx-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}
