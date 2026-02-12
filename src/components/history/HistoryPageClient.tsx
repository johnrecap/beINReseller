'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
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
    const [operations, setOperations] = useState<Operation[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [filters, setFilters] = useState<FilterValues>({
        type: '',
        status: '',
        from: '',
        to: '',
    })

    const fetchOperations = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '10',
            })

            if (filters.type) params.append('type', filters.type)
            if (filters.status) params.append('status', filters.status)
            if (filters.from) params.append('from', filters.from)
            if (filters.to) params.append('to', filters.to)

            const res = await fetch(`/api/operations?${params}`)
            const data = await res.json()

            if (res.ok) {
                setOperations(data.operations)
                setTotalPages(data.totalPages)
            }
        } catch (error) {
            console.error('Failed to fetch operations:', error)
        } finally {
            setLoading(false)
        }
    }, [page, filters])

    useEffect(() => {
        if (session) {
            fetchOperations()
        }
    }, [session, fetchOperations])

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
                        <h1 className="text-2xl font-bold text-foreground">Operations History</h1>
                        <p className="text-muted-foreground text-sm font-medium">View all past operations</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <HistoryFilters onFilter={handleFilter} loading={loading} />

            {/* Table */}
            <OperationsTable
                operations={operations}
                loading={loading}
                page={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                onRefresh={fetchOperations}
            />
        </div>
    )
}
