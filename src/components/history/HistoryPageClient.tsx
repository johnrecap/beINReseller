'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { useTranslation } from '@/hooks/useTranslation'
import { Clock } from 'lucide-react'
import HistoryFilters, { FilterValues } from '@/components/history/HistoryFilters'
import OperationsTable from '@/components/history/OperationsTable'

interface Operation {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    responseMessage?: string
    createdAt: string
}

export default function HistoryPageClient() {
    const { data: session } = useSession()
    const { t } = useTranslation()
    const { load, loading, error, cancel } = usePanelRequest()
    const [total, setTotal] = useState(0)
    const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'amount' | 'status'; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' })
    const [operations, setOperations] = useState<Operation[]>([])
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [filters, setFilters] = useState<FilterValues>({
        type: '',
        status: '',
        cardNumber: '',
        from: '',
        to: '',
    })

    const fetchOperations = useCallback(async () => {
        const params = new URLSearchParams({ page: String(page), limit: '10',
            sortBy: sortConfig.key === 'date' ? 'createdAt' : sortConfig.key, sortOrder: sortConfig.direction })
        for (const [key, value] of Object.entries(filters)) if (value.trim()) params.set(key, value.trim())
        await load<{ operations: Operation[]; totalPages: number; total: number }>(`/api/operations?${params}`, data => {
            setOperations(data.operations)
            setTotalPages(data.totalPages)
            setTotal(data.total)
            if (page > Math.max(1, data.totalPages)) setPage(Math.max(1, data.totalPages))
        })
    }, [page, filters, sortConfig, load])

    useEffect(() => {
        if (session) {
            fetchOperations()
        }
        return cancel
    }, [session, fetchOperations, cancel])

    const handleFilter = (newFilters: FilterValues) => {
        setFilters(newFilters)
        setPage(1) // Reset to first page when filtering
    }

    const handlePageChange = (newPage: number) => {
        setPage(newPage)
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 rounded-full bg-[#3B82F6] flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
                        <Clock className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{t.panelUi.historyTitle}</h1>
                        <p className="text-muted-foreground text-sm font-medium">{t.panelUi.historyDescription}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <HistoryFilters onFilter={handleFilter} loading={loading} />

            {/* Table */}
            {error !== null ? <PanelLoadError status={error} retry={fetchOperations} /> : <OperationsTable
                operations={operations}
                loading={loading}
                page={page}
                totalPages={totalPages}
                total={total}
                sortConfig={sortConfig}
                onSortChange={(sort) => { setSortConfig(sort); setPage(1) }}
                onPageChange={handlePageChange}
                onRefresh={fetchOperations}
            />}
        </div>
    )
}
