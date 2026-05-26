'use client'

import { Suspense } from 'react'
import { ShieldAlert } from 'lucide-react'
import LogsTable from '@/components/admin/LogsTable'

export default function LogsReportPanel() {
    return (
        <div className="space-y-6" dir="rtl">
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg">
                    <ShieldAlert className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Activity Logs</h1>
                    <p className="text-sm text-muted-foreground">Track all operations and actions in the system</p>
                </div>
            </div>

            <Suspense fallback={<div>Loading...</div>}>
                <LogsTable />
            </Suspense>
        </div>
    )
}
