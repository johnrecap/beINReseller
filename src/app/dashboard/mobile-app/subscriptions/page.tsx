'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    RefreshCw,
    Eye,
    ChevronLeft,
    ChevronRight,
    CheckCircle,
    XCircle,
    Clock,
    Loader2
} from 'lucide-react'
import Link from 'next/link'

interface Operation {
    id: string
    customerId: string
    customerName: string
    customerEmail: string
    type: string
    cardNumber: string
    status: string
    amount: number | null
    currency: string
    createdAt: string
    completedAt: string | null
}

interface Pagination {
    page: number
    limit: number
    total: number
    totalPages: number
}

const OPERATION_STATUSES = [
    { value: 'all', label: 'All' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'PROCESSING', label: 'Processing' },
    { value: 'AWAITING_PACKAGE', label: 'Awaiting Package' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'FAILED', label: 'Failed' }
]

const OPERATION_TYPES = [
    { value: 'all', label: 'All' },
    { value: 'RENEW', label: 'Renew' },
    { value: 'SIGNAL_REFRESH', label: 'Signal Refresh' },
    { value: 'CHECK_BALANCE', label: 'Check Balance' }
]

export default function MobileAppSubscriptionsPage() {
    const [operations, setOperations] = useState<Operation[]>([])
    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState('all')
    const [type, setType] = useState('all')
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    })

    useEffect(() => {
        const fetchOperations = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams()
                params.append('page', pagination.page.toString())
                params.append('limit', pagination.limit.toString())
                if (status !== 'all') params.append('status', status)
                if (type !== 'all') params.append('type', type)

                const res = await fetch(`/api/admin/mobile-app/subscriptions?${params}`)
                const data = await res.json()

                if (data.success) {
                    setOperations(data.operations)
                    setPagination(prev => ({ ...prev, ...data.pagination }))
                }
            } catch (error) {
                console.error('Failed to fetch operations:', error)
            }
            setLoading(false)
        }
        fetchOperations()
    }, [pagination.page, pagination.limit, status, type])

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatCurrency = (amount: number | null, curr: string) => {
        if (amount === null) return '-'
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: curr
        }).format(amount)
    }

    const maskCardNumber = (cardNumber: string) => {
        return cardNumber
    }

    const getStatusIcon = (s: string) => {
        switch (s) {
            case 'COMPLETED': return <CheckCircle className="h-4 w-4 text-green-500" />
            case 'FAILED': return <XCircle className="h-4 w-4 text-red-500" />
            case 'PROCESSING': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
            default: return <Clock className="h-4 w-4 text-yellow-500" />
        }
    }

    const getStatusBadge = (s: string) => {
        const styles: Record<string, string> = {
            PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
            PROCESSING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
            AWAITING_PACKAGE: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
            COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        }
        return styles[s] || 'bg-gray-100 text-gray-800'
    }

    const getStatusLabel = (s: string) => {
        return OPERATION_STATUSES.find(st => st.value === s)?.label || s
    }

    const getTypeLabel = (t: string) => {
        return OPERATION_TYPES.find(ty => ty.value === t)?.label || t
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <RefreshCw className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">Subscriptions</h1>
                    <p className="text-muted-foreground">Renewal and signal refresh operations</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {OPERATION_STATUSES.filter(s => ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(s.value)).map((s) => (
                    <Card key={s.value} className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() => setStatus(s.value)}>
                        <CardContent className="pt-4 pb-4">
                            <p className="text-sm text-muted-foreground">{s.label}</p>
                            <p className="text-xl font-bold">
                                {operations.filter(o => o.status === s.value).length}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-4">
                        {/* Status Filter */}
                        <div className="flex flex-wrap gap-2">
                            {OPERATION_STATUSES.map((s) => (
                                <Button
                                    key={s.value}
                                    variant={status === s.value ? 'primary' : 'outline'}
                                    size="sm"
                                    onClick={() => setStatus(s.value)}
                                >
                                    {s.label}
                                </Button>
                            ))}
                        </div>

                        {/* Type Filter */}
                        <div className="flex gap-2 border-r pr-4">
                            {OPERATION_TYPES.map((t) => (
                                <Button
                                    key={t.value}
                                    variant={type === t.value ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setType(t.value)}
                                >
                                    {t.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Operations Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Operations History</CardTitle>
                    <CardDescription>
                        Showing {operations.length} of {pagination.total} operations
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                    ) : operations.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No operations found
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-right py-3 px-4">Date</th>
                                        <th className="text-right py-3 px-4">Customer</th>
                                        <th className="text-right py-3 px-4">Type</th>
                                        <th className="text-right py-3 px-4">Card Number</th>
                                        <th className="text-right py-3 px-4">Amount</th>
                                        <th className="text-right py-3 px-4">Status</th>
                                        <th className="text-center py-3 px-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {operations.map((op) => (
                                        <tr key={op.id} className="border-b hover:bg-muted/50">
                                            <td className="py-3 px-4 text-sm">
                                                {formatDate(op.createdAt)}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div>
                                                    <p className="font-medium">{op.customerName}</p>
                                                    <p className="text-sm text-muted-foreground">{op.customerEmail}</p>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-sm">
                                                    {getTypeLabel(op.type)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 font-mono">
                                                {maskCardNumber(op.cardNumber)}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="font-bold">
                                                    {formatCurrency(op.amount, op.currency)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(op.status)}`}>
                                                    {getStatusIcon(op.status)}
                                                    {getStatusLabel(op.status)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <Link href={`/dashboard/mobile-app/customers/${op.customerId}`}>
                                                    <Button variant="ghost" size="sm">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <p className="text-sm text-muted-foreground">
                                Page {pagination.page} of {pagination.totalPages}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pagination.page <= 1}
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pagination.page >= pagination.totalPages}
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
