'use client'

import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

interface DashboardShellProps {
    children: React.ReactNode
}

import { useTranslation } from '@/hooks/useTranslation'
import { cn } from '@/lib/utils'

export default function DashboardShell({ children }: DashboardShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const { t, dir } = useTranslation()

    return (
        <div className="min-h-screen bg-gray-50" dir={dir}>
            {/* Sidebar - Fixed on the left/right */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content - margin for sidebar */}
            <div className={cn(
                "min-h-screen transition-all",
                dir === 'rtl' ? "lg:mr-72" : "lg:ml-72"
            )}>
                {/* Header */}
                <Header title={t.common.controlPanel} onMenuClick={() => setSidebarOpen(true)} />

                {/* Page Content */}
                <main className="p-4 lg:p-6">
                    {children}
                </main>
            </div>
        </div>
    )
}
