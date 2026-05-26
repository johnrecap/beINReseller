'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ReportCenterTab, ReportCenterTabKey } from './report-tabs'

type ReportCenterTabsProps = {
    activeTab: ReportCenterTabKey
    tabs: readonly ReportCenterTab[]
    onTabChange: (value: ReportCenterTabKey) => void
}

export function ReportCenterTabs({ activeTab, tabs, onTabChange }: ReportCenterTabsProps) {
    return (
        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as ReportCenterTabKey)}>
            <div className="overflow-x-auto pb-1">
                <TabsList className="h-auto min-h-10 w-max justify-start gap-1 bg-card p-1">
                    {tabs.map((tab) => (
                        <TabsTrigger
                            key={tab.key}
                            value={tab.key}
                            className="h-9 min-w-[9rem] px-3 text-sm"
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
        </Tabs>
    )
}
