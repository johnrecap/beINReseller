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
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Type Filter */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.history.type}</label>
                    <select
                        value={filters.type}
                        onChange={(e) => handleChange('type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-sm"
                    >
                        <option value="">{t.common.all}</option>
                        {Object.entries(OPERATION_TYPE_LABELS).map(([value]) => (
                            <option key={value} value={value}>{(t.operations as any)[value === 'CHECK_BALANCE' ? 'checkBalance' : value === 'SIGNAL_REFRESH' ? 'refreshSignal' : 'renew'] || value}</option>
                        ))}
                    </select>
                </div>

                {/* Status Filter */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.history.status}</label>
                    <select
                        value={filters.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-sm"
                    >
                        <option value="">{t.common.all}</option>
                        {Object.entries(OPERATION_STATUS_LABELS).map(([value]) => (
                            <option key={value} value={value}>{(t.status as Record<string, string>)?.[value === 'AWAITING_CAPTCHA' ? 'awaitingCaptcha' : (typeof value === 'string' ? value.toLowerCase() : value)] ?? value}</option>
                        ))}
                    </select>
                </div>

                {/* From Date */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.history.fromDate}</label>
                    <input
                        type="date"
                        value={filters.from}
                        onChange={(e) => handleChange('from', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-sm"
                    />
                </div>

                {/* To Date */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.history.toDate}</label>
                    <input
                        type="date"
                        value={filters.to}
                        onChange={(e) => handleChange('to', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-sm"
                    />
                </div>

                {/* Buttons */}
                <div className="flex items-end gap-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all text-sm font-medium"
                    >
                        <Search className="w-4 h-4" />
                        {t.common.search}
                    </button>
                    <button
                        type="button"
                        onClick={handleReset}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-all"
                        title={t.common.reset}
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </form>
    )
}
