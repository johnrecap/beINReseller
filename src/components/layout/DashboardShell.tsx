'use client'

import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { AnimatedBackground } from '@/components/effects'
import { useTranslation } from '@/hooks/useTranslation'
import { cn } from '@/lib/utils'

interface DashboardShellProps {
    children: React.ReactNode
}

export default function DashboardShell({ children }: DashboardShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const { t, dir } = useTranslation()

    return (
        <div className="min-h-screen bg-background transition-colors duration-300" dir={dir}>
            {/* Subtle animated background */}
            <AnimatedBackground variant="subtle" />

            {/* Sidebar - Fixed on the left/right */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content - margin for sidebar */}
            <div className={cn(
                "min-h-screen transition-all duration-300",
                dir === 'rtl' ? "lg:mr-72" : "lg:ml-72"
            )}>
                {/* Header */}
                <Header title={t.common.controlPanel} onMenuClick={() => setSidebarOpen(true)} />

                {/* Page Content */}
                <main className="p-4 lg:p-6 relative">
                    {children}
                </main>
            </div>
        </div>
    )
}
