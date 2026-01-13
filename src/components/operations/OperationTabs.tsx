'use client'

import { useState } from 'react'
import { Zap, Search, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import RenewForm from '@/components/operations/RenewForm'
import CheckBalanceForm from '@/components/operations/CheckBalanceForm'
import SignalRefreshForm from '@/components/operations/SignalRefreshForm'

const tabs = [
    { id: 'renew', label: 'تجديد اشتراك', icon: Zap, color: 'text-purple-600' },
    { id: 'balance', label: 'استعلام رصيد', icon: Search, color: 'text-blue-600' },
    { id: 'signal', label: 'تنشيط إشارة', icon: Radio, color: 'text-green-600' },
]

export default function OperationTabs() {
    const [activeTab, setActiveTab] = useState('renew')

    return (
        <div className="bg-card rounded-2xl shadow-lg overflow-hidden">
            {/* Tabs Header */}
            <div className="flex border-b border-border">
                {tabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-4 px-4 font-medium transition-all",
                                isActive
                                    ? "bg-gradient-to-b from-purple-50 dark:from-purple-900/20 to-transparent border-b-2 border-purple-500 text-purple-700 dark:text-purple-400"
                                    : "text-muted-foreground hover:bg-secondary"
                            )}
                        >
                            <Icon className={cn("w-5 h-5", isActive ? tab.color : "")} />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    )
                })}
            </div>

            {/* Tab Content */}
            <div className="p-6">
                {activeTab === 'renew' && <RenewForm />}
                {activeTab === 'balance' && <CheckBalanceForm />}
                {activeTab === 'signal' && <SignalRefreshForm />}
            </div>
        </div>
    )
}
