'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    CreditCard,
    Download,
    Calendar,
    CheckCircle,
    XCircle,
    Clock,
    ChevronLeft,
    ChevronRight,
    Filter
} from 'lucide-react'

interface Payment {
    id: string
    customerId: string
    customerName: string
    customerEmail: string
    amount: number
    currency: string
    status: 'succeeded' | 'pending' | 'failed'
    stripePaymentIntentId: string | null
    createdAt: string
}

interface Pagination {
    page: number
    limit: number
    total: number
    totalPages: number
}

export default function MobileAppPaymentsPage() {
    const [payments, setPayments] = useState<Payment[]>([])
    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState<'all' | 'succeeded' | 'pending' | 'failed'>('all')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    })

    const fetchPayments = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            params.append('page', pagination.page.toString())
            params.append('limit', pagination.limit.toString())
            if (status !== 'all') params.append('status', status)
            if (dateFrom) params.append('dateFrom', dateFrom)
            if (dateTo) params.append('dateTo', dateTo)

            const res = await fetch(`/api/admin/mobile-app/payments?${params}`)
            const data = await res.json()

            if (data.success) {
                setPayments(data.payments)
                setPagination(prev => ({ ...prev, ...data.pagination }))
            }
        } catch (error) {
            console.error('Failed to fetch payments:', error)
        }
        setLoading(false)
    }, [pagination.page, pagination.limit, status, dateFrom, dateTo])

    useEffect(() => {
        fetchPayments()
    }, [fetchPayments])

    const exportToCSV = () => {
        const headers = ['التاريخ', 'العميل', 'البريد', 'المبلغ', 'العملة', 'الحالة', 'Stripe ID']
        const rows = payments.map(p => [
            new Date(p.createdAt).toLocaleDateString('ar-SA'),
            p.customerName,
            p.customerEmail,
            p.amount.toString(),
            p.currency,
            p.status,
            p.stripePaymentIntentId || ''
        ])

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `payments_${new Date().toISOString().slice(0, 10)}.csv`
        link.click()
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatCurrency = (amount: number, curr: string) => {
        return new Intl.NumberFormat('ar-SA', {
            style: 'currency',
            currency: curr
        }).format(amount)
    }

    const getStatusIcon = (s: string) => {
        switch (s) {
            case 'succeeded': return <CheckCircle className="h-4 w-4 text-green-500" />
            case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />
            case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
            default: return null
        }
    }

    const getStatusBadge = (s: string) => {
        const styles = {
            succeeded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
            failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        }
        return styles[s as keyof typeof styles] || ''
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <CreditCard className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">المدفوعات</h1>
                        <p className="text-muted-foreground">مدفوعات شحن المحفظة عبر Stripe</p>
                    </div>
                </div>
                <Button onClick={exportToCSV} variant="outline">
                    <Download className="h-4 w-4 ml-2" />
                    تصدير CSV
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-4">
                        {/* Status Filter */}
                        <div className="flex gap-2">
                            {(['all', 'succeeded', 'pending', 'failed'] as const).map((s) => (
                                <Button
                                    key={s}
                                    variant={status === s ? 'primary' : 'outline'}
                                    size="sm"
                                    onClick={() => setStatus(s)}
                                >
                                    {s === 'all' ? 'الكل' :
                                        s === 'succeeded' ? 'ناجح' :
                                            s === 'pending' ? 'معلق' : 'فاشل'}
                                </Button>
                            ))}
                        </div>

                        {/* Date Range */}
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="w-40"
                            />
                            <span>-</span>
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="w-40"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Payments Table */}
            <Card>
                <CardHeader>
                    <CardTitle>سجل المدفوعات</CardTitle>
                    <CardDescription>
                        عرض {payments.length} من {pagination.total} دفعة
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                    ) : payments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            لا توجد مدفوعات
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-right py-3 px-4">التاريخ</th>
                                        <th className="text-right py-3 px-4">العميل</th>
                                        <th className="text-right py-3 px-4">المبلغ</th>
                                        <th className="text-right py-3 px-4">الحالة</th>
                                        <th className="text-right py-3 px-4">Stripe ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((payment) => (
                                        <tr key={payment.id} className="border-b hover:bg-muted/50">
                                            <td className="py-3 px-4 text-sm">
                                                {formatDate(payment.createdAt)}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div>
                                                    <p className="font-medium">{payment.customerName}</p>
                                                    <p className="text-sm text-muted-foreground">{payment.customerEmail}</p>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="font-bold text-green-600">
                                                    {formatCurrency(payment.amount, payment.currency)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(payment.status)}`}>
                                                    {getStatusIcon(payment.status)}
                                                    {payment.status === 'succeeded' ? 'ناجح' :
                                                        payment.status === 'pending' ? 'معلق' : 'فاشل'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-sm font-mono text-muted-foreground">
                                                {payment.stripePaymentIntentId?.slice(0, 20)}...
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
                                صفحة {pagination.page} من {pagination.totalPages}
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
