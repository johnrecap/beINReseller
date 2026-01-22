'use client'

import { useState } from 'react'
import { Search, RotateCcw } from 'lucide-react'
import { OPERATION_TYPE_LABELS, OPERATION_STATUS_LABELS } from '@/lib/constants'
import { useTranslation } from '@/hooks/useTranslation'

interface HistoryFiltersProps {
    onFilter: (filters: FilterValues) => void
    loading?: boolean
}

export interface FilterValues {
    type: string
    status: string
    from: string
    to: string
}

const initialFilters: FilterValues = {
    type: '',
    status: '',
    from: '',
    to: '',
}

export default function HistoryFilters({ onFilter, loading }: HistoryFiltersProps) {
    const { t } = useTranslation()
    const [filters, setFilters] = useState<FilterValues>(initialFilters)

    const handleChange = (key: keyof FilterValues, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onFilter(filters)
    }

    const handleReset = () => {
        setFilters(initialFilters)
        onFilter(initialFilters)
    }

    return (
        <form onSubmit={handleSubmit} className="bg-[#1a1d26] rounded-xl shadow-sm border border-border/50 p-4 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Type Filter */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 px-1">{t.history.type}</label>
                    <select
                        title={t.history.type}
                        value={filters.type}
                        onChange={(e) => handleChange('type', e.target.value)}
                        className="w-full px-3 py-2.5 bg-background border border-border rounded-lg focus:border-[#00A651] focus:ring-1 focus:ring-[#00A651] focus:outline-none text-sm transition-all"
                    >
                        <option value="">{t.common.all}</option>
                        {Object.entries(OPERATION_TYPE_LABELS).map(([value]) => (
                            <option key={value} value={value}>{(t.operations as Record<string, string>)[value === 'CHECK_BALANCE' ? 'checkBalance' : value === 'SIGNAL_REFRESH' ? 'refreshSignal' : 'renew'] || value}</option>
                        ))}
                    </select>
                </div>

                {/* Status Filter */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 px-1">{t.history.status}</label>
                    <select
                        title={t.history.status}
                        value={filters.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                        className="w-full px-3 py-2.5 bg-background border border-border rounded-lg focus:border-[#00A651] focus:ring-1 focus:ring-[#00A651] focus:outline-none text-sm transition-all"
                    >
                        <option value="">{t.common.all}</option>
                        {Object.entries(OPERATION_STATUS_LABELS).map(([value]) => (
                            <option key={value} value={value}>{(t.status as Record<string, string>)?.[value === 'AWAITING_CAPTCHA' ? 'awaitingCaptcha' : (typeof value === 'string' ? value.toLowerCase() : value)] ?? value}</option>
                        ))}
                    </select>
                </div>

                {/* From Date */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 px-1">{t.history.fromDate}</label>
                    <input
                        type="date"
                        value={filters.from}
                        onChange={(e) => handleChange('from', e.target.value)}
                        aria-label={t.history.fromDate}
                        className="w-full px-3 py-2.5 bg-background border border-border rounded-lg focus:border-[#00A651] focus:ring-1 focus:ring-[#00A651] focus:outline-none text-sm transition-all"
                    />
                </div>

                {/* To Date */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 px-1">{t.history.toDate}</label>
                    <input
                        type="date"
                        value={filters.to}
                        onChange={(e) => handleChange('to', e.target.value)}
                        aria-label={t.history.toDate}
                        className="w-full px-3 py-2.5 bg-background border border-border rounded-lg focus:border-[#00A651] focus:ring-1 focus:ring-[#00A651] focus:outline-none text-sm transition-all"
                    />
                </div>

                {/* Buttons */}
                <div className="flex items-end gap-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00A651] hover:bg-[#008f45] text-white rounded-xl font-bold shadow-lg shadow-green-500/20 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                        <Search className="w-4 h-4" />
                        {t.common.search || 'بحث'}
                    </button>
                    <button
                        type="button"
                        onClick={handleReset}
                        className="p-2.5 bg-transparent border border-[#374151] text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-all"
                        title={t.common.reset}
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </form>
    )
}
