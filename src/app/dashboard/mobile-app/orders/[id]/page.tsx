'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    ArrowRight,
    Package,
    Truck,
    User,
    MapPin,
    Phone,
    Calendar,
    CreditCard,
    Save,
    AlertCircle
} from 'lucide-react'
import Link from 'next/link'

interface OrderItem {
    id: string
    name: string
    nameAr: string
    image: string | null
    quantity: number
    price: number
}

interface Order {
    id: string
    orderNumber: string
    status: string
    currency: string
    subtotal: number
    shippingCost: number
    discount: number
    total: number
    shipping: {
        name: string
        phone: string
        country: string
        city: string
        address: string
        notes: string | null
    }
    trackingNumber: string | null
    items: OrderItem[]
    createdAt: string
    paidAt: string | null
    processedAt: string | null
    shippedAt: string | null
    deliveredAt: string | null
    customer: {
        id: string
        name: string
        email: string
    }
}

const ORDER_STATUSES = [
    { value: 'PENDING', label: 'في الانتظار', color: 'yellow' },
    { value: 'PROCESSING', label: 'قيد المعالجة', color: 'blue' },
    { value: 'SHIPPED', label: 'تم الشحن', color: 'purple' },
    { value: 'DELIVERED', label: 'تم التوصيل', color: 'green' },
    { value: 'CANCELLED', label: 'ملغي', color: 'red' }
]

export default function OrderDetailPage() {
    const params = useParams()
    const orderId = params.id as string

    const [order, setOrder] = useState<Order | null>(null)
    const [loading, setLoading] = useState(true)
    const [trackingNumber, setTrackingNumber] = useState('')
    const [saving, setSaving] = useState(false)

    const fetchOrder = useCallback(async () => {
        try {
            const res = await fetch(`/api/admin/mobile-app/orders/${orderId}`)
            const data = await res.json()
            if (data.success) {
                setOrder(data.order)
                setTrackingNumber(data.order.trackingNumber || '')
            }
        } catch (error) {
            console.error('Failed to fetch order:', error)
        }
        setLoading(false)
    }, [orderId])

    useEffect(() => {
        fetchOrder()
    }, [fetchOrder])

    const updateOrder = async (updates: { status?: string; trackingNumber?: string }) => {
        setSaving(true)
        try {
            const res = await fetch(`/api/admin/mobile-app/orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            })
            if (res.ok) {
                fetchOrder()
            }
        } catch (error) {
            console.error('Failed to update order:', error)
        }
        setSaving(false)
    }

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-'
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

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
            </div>
        )
    }

    if (!order) {
        return (
            <div className="text-center py-20">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">الطلب غير موجود</p>
                <Link href="/dashboard/mobile-app/orders">
                    <Button className="mt-4">العودة للقائمة</Button>
                </Link>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/dashboard/mobile-app/orders">
                    <Button variant="ghost" size="sm" className="p-2">
                        <ArrowRight className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold font-mono">{order.orderNumber}</h1>
                    <p className="text-muted-foreground">{formatDate(order.createdAt)}</p>
                </div>
                <div className="mr-auto">
                    <select
                        value={order.status}
                        onChange={(e) => updateOrder({ status: e.target.value })}
                        className="px-3 py-2 rounded-md border text-sm font-medium"
                    >
                        {ORDER_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Order Items */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Package className="h-5 w-5" />
                                المنتجات ({order.items.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {order.items.map((item) => (
                                    <div key={item.id} className="flex items-center gap-4 p-3 rounded-lg border">
                                        {item.image ? (
                                            <img
                                                src={item.image}
                                                alt={item.nameAr}
                                                className="w-16 h-16 object-cover rounded"
                                            />
                                        ) : (
                                            <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                                                <Package className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <p className="font-medium">{item.nameAr}</p>
                                            <p className="text-sm text-muted-foreground">{item.name}</p>
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold">{formatCurrency(item.price, order.currency)}</p>
                                            <p className="text-sm text-muted-foreground">الكمية: {item.quantity}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Order Timeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5" />
                                جدول الطلب
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span>تاريخ الإنشاء</span>
                                    <span className="font-medium">{formatDate(order.createdAt)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span>تاريخ الدفع</span>
                                    <span className="font-medium">{formatDate(order.paidAt)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span>تاريخ المعالجة</span>
                                    <span className="font-medium">{formatDate(order.processedAt)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span>تاريخ الشحن</span>
                                    <span className="font-medium">{formatDate(order.shippedAt)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span>تاريخ التوصيل</span>
                                    <span className="font-medium">{formatDate(order.deliveredAt)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Order Summary */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5" />
                                ملخص الطلب
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between">
                                <span>المجموع الفرعي</span>
                                <span>{formatCurrency(order.subtotal, order.currency)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>الشحن</span>
                                <span>{formatCurrency(order.shippingCost, order.currency)}</span>
                            </div>
                            {order.discount > 0 && (
                                <div className="flex justify-between text-green-600">
                                    <span>الخصم</span>
                                    <span>-{formatCurrency(order.discount, order.currency)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-lg pt-3 border-t">
                                <span>الإجمالي</span>
                                <span>{formatCurrency(order.total, order.currency)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Customer Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                العميل
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="font-medium">{order.customer.name}</p>
                            <p className="text-sm text-muted-foreground">{order.customer.email}</p>
                            <Link href={`/dashboard/mobile-app/customers/${order.customer.id}`}>
                                <Button variant="ghost" className="p-0 h-auto mt-2">
                                    عرض الملف الشخصي
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                    {/* Shipping Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5" />
                                عنوان الشحن
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <p className="font-medium">{order.shipping.name}</p>
                            <p className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                {order.shipping.phone}
                            </p>
                            <p>{order.shipping.address}</p>
                            <p>{order.shipping.city}, {order.shipping.country}</p>
                            {order.shipping.notes && (
                                <p className="text-muted-foreground italic">ملاحظات: {order.shipping.notes}</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Tracking Number */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Truck className="h-5 w-5" />
                                رقم التتبع
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Input
                                placeholder="أدخل رقم التتبع"
                                value={trackingNumber}
                                onChange={(e) => setTrackingNumber(e.target.value)}
                            />
                            <Button
                                className="w-full"
                                disabled={saving || trackingNumber === order.trackingNumber}
                                onClick={() => updateOrder({ trackingNumber })}
                            >
                                <Save className="h-4 w-4 ml-2" />
                                {saving ? 'جاري الحفظ...' : 'حفظ'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
