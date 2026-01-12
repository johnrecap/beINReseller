'use client'

import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

interface DashboardShellProps {
    children: React.ReactNode
}

export default function DashboardShell({ children }: DashboardShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false)

    return (
        <div className="min-h-screen bg-gray-50" dir="ltr">
            {/* Sidebar - Fixed on the left */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content - margin-left on desktop for sidebar (appears on left) */}
            <div className="lg:ml-72 min-h-screen transition-all">
                {/* Header */}
                <Header title="لوحة التحكم" onMenuClick={() => setSidebarOpen(true)} />

                {/* Page Content - RTL direction for Arabic content */}
                <main className="p-4 lg:p-6" dir="rtl">
                    {children}
                </main>
            </div>
        </div>
    )
}
