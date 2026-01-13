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
        <div className="min-h-screen bg-background" dir={dir}>
            {/* Sidebar */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content Area */}
            <div className={cn(
                "min-h-screen transition-all duration-300",
                dir === 'rtl' ? "lg:mr-72" : "lg:ml-72"
            )}>
                {/* Header */}
                <Header title={t.common.controlPanel} onMenuClick={() => setSidebarOpen(true)} />

                {/* Page Content */}
                <main className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}
