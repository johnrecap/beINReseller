'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    ShoppingCart,
    Eye,
    ChevronLeft,
    ChevronRight,
    Package,
    Truck,
    CheckCircle,
    XCircle,
    Clock
} from 'lucide-react'
import Link from 'next/link'

interface Order {
    id: string
    orderNumber: string
    customerId: string
    customerName: string
    status: string
    currency: string
    total: number
    itemCount: number
    trackingNumber: string | null
    createdAt: string
}

interface Pagination {
    page: number
    limit: number
    total: number
    totalPages: number
}

const ORDER_STATUSES = [
    { value: 'all', label: 'الكل' },
    { value: 'PENDING', label: 'في الانتظار' },
    { value: 'PROCESSING', label: 'قيد المعالجة' },
    { value: 'SHIPPED', label: 'تم الشحن' },
    { value: 'DELIVERED', label: 'تم التوصيل' },
    { value: 'CANCELLED', label: 'ملغي' }
]

export default function MobileAppOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState('all')
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    })

    const fetchOrders = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            params.append('page', pagination.page.toString())
            params.append('limit', pagination.limit.toString())
            if (status !== 'all') params.append('status', status)

            const res = await fetch(`/api/admin/mobile-app/orders?${params}`)
            const data = await res.json()

            if (data.success) {
                setOrders(data.orders)
                setPagination(prev => ({ ...prev, ...data.pagination }))
            }
        } catch (error) {
            console.error('Failed to fetch orders:', error)
        }
        setLoading(false)
    }, [pagination.page, pagination.limit, status])

    useEffect(() => {
        fetchOrders()
    }, [fetchOrders])

    const updateOrderStatus = async (orderId: string, newStatus: string) => {
        try {
            const res = await fetch(`/api/admin/mobile-app/orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            })
            if (res.ok) {
                fetchOrders()
            }
        } catch (error) {
            console.error('Failed to update order:', error)
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    const formatCurrency = (amount: number, curr: string) => {
        return new Intl.NumberFormat('ar-SA', {
            style: 'currency',
            currency: curr
        }).format(amount)
    }

    const getStatusBadge = (s: string) => {
        const styles: Record<string, string> = {
            PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
            PROCESSING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
            SHIPPED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
            DELIVERED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        }
        return styles[s] || 'bg-gray-100 text-gray-800'
    }

    const getStatusLabel = (s: string) => {
        const labels: Record<string, string> = {
            PENDING: 'في الانتظار',
            PROCESSING: 'قيد المعالجة',
            SHIPPED: 'تم الشحن',
            DELIVERED: 'تم التوصيل',
            CANCELLED: 'ملغي'
        }
        return labels[s] || s
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <ShoppingCart className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">الطلبات</h1>
                    <p className="text-muted-foreground">إدارة طلبات المتجر</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {ORDER_STATUSES.filter(s => s.value !== 'all').map((s) => (
                    <Card key={s.value} className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() => setStatus(s.value)}>
                        <CardContent className="pt-4 pb-4">
                            <p className="text-sm text-muted-foreground">{s.label}</p>
                            <p className="text-xl font-bold">
                                {orders.filter(o => o.status === s.value).length}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-2">
                        {ORDER_STATUSES.map((s) => (
                            <Button
                                key={s.value}
                                variant={status === s.value ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setStatus(s.value)}
                            >
                                {s.label}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Orders Table */}
            <Card>
                <CardHeader>
                    <CardTitle>قائمة الطلبات</CardTitle>
                    <CardDescription>
                        عرض {orders.length} من {pagination.total} طلب
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            لا توجد طلبات
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-right py-3 px-4">رقم الطلب</th>
                                        <th className="text-right py-3 px-4">العميل</th>
                                        <th className="text-right py-3 px-4">المنتجات</th>
                                        <th className="text-right py-3 px-4">المبلغ</th>
                                        <th className="text-right py-3 px-4">الحالة</th>
                                        <th className="text-right py-3 px-4">رقم التتبع</th>
                                        <th className="text-right py-3 px-4">التاريخ</th>
                                        <th className="text-center py-3 px-4">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map((order) => (
                                        <tr key={order.id} className="border-b hover:bg-muted/50">
                                            <td className="py-3 px-4">
                                                <span className="font-mono font-medium">{order.orderNumber}</span>
                                            </td>
                                            <td className="py-3 px-4">
                                                {order.customerName}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="inline-flex items-center gap-1">
                                                    <Package className="h-4 w-4 text-muted-foreground" />
                                                    {order.itemCount} منتج
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="font-bold">
                                                    {formatCurrency(order.total, order.currency)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <select
                                                    value={order.status}
                                                    onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                                    className={`px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer ${getStatusBadge(order.status)}`}
                                                >
                                                    {ORDER_STATUSES.filter(s => s.value !== 'all').map((s) => (
                                                        <option key={s.value} value={s.value}>{s.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="py-3 px-4">
                                                {order.trackingNumber ? (
                                                    <span className="inline-flex items-center gap-1 text-sm">
                                                        <Truck className="h-4 w-4" />
                                                        {order.trackingNumber}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">-</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-sm">
                                                {formatDate(order.createdAt)}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <Link href={`/dashboard/mobile-app/orders/${order.id}`}>
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
