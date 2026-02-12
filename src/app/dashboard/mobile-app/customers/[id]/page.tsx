'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    ArrowRight,
    User,
    Mail,
    Phone,

    Wallet,
    Calendar,
    History,
    ShoppingCart,
    CreditCard,
    Plus,
    Minus,
    AlertCircle
} from 'lucide-react'
import Link from 'next/link'

interface Customer {
    id: string
    email: string
    name: string
    nameAr: string | null
    phone: string | null
    country: string
    preferredLang: string
    isVerified: boolean
    isActive: boolean
    walletBalance: number
    storeCredit: number
    loginCount: number
    createdAt: string
    lastLoginAt: string | null
}

interface WalletTransaction {
    id: string
    type: 'CREDIT' | 'DEBIT' | 'REFUND'
    amount: number
    balanceBefore: number
    balanceAfter: number
    description: string
    createdAt: string
}

interface Operation {
    id: string
    type: string
    cardNumber: string
    status: string
    amount: number
    createdAt: string
}

interface Order {
    id: string
    orderNumber: string
    status: string
    total: number
    currency: string
    createdAt: string
}

export default function CustomerDetailPage() {
    const params = useParams()
    const customerId = params.id as string

    const [customer, setCustomer] = useState<Customer | null>(null)
    const [transactions, setTransactions] = useState<WalletTransaction[]>([])
    const [operations, setOperations] = useState<Operation[]>([])
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'wallet' | 'operations' | 'orders'>('wallet')

    // Balance adjustment
    const [adjustmentAmount, setAdjustmentAmount] = useState('')
    const [adjustmentType, setAdjustmentType] = useState<'credit' | 'debit'>('credit')
    const [adjustmentDescription, setAdjustmentDescription] = useState('')
    const [adjusting, setAdjusting] = useState(false)

    const [refetchKey, setRefetchKey] = useState(0)

    useEffect(() => {
        let cancelled = false
            ; (async () => {
                try {
                    const res = await fetch(`/api/admin/mobile-app/customers/${customerId}`)
                    const data = await res.json()
                    if (!cancelled && data.success) {
                        setCustomer(data.customer)
                        setTransactions(data.transactions || [])
                        setOperations(data.operations || [])
                        setOrders(data.orders || [])
                    }
                } catch (error) {
                    console.error('Failed to fetch customer:', error)
                }
                if (!cancelled) setLoading(false)
            })()
        return () => { cancelled = true }
    }, [customerId, refetchKey])

    const handleBalanceAdjustment = async () => {
        const amount = parseFloat(adjustmentAmount)
        if (isNaN(amount) || amount <= 0) return

        setAdjusting(true)
        try {
            const res = await fetch(`/api/admin/mobile-app/customers/${customerId}/balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: adjustmentType,
                    amount,
                    description: adjustmentDescription || `Manual adjustment - ${adjustmentType === 'credit' ? 'credit' : 'debit'}`
                })
            })
            const data = await res.json()
            if (data.success) {
                setAdjustmentAmount('')
                setAdjustmentDescription('')
                setRefetchKey(k => k + 1)
            }
        } catch (error) {
            console.error('Failed to adjust balance:', error)
        }
        setAdjusting(false)
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

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
            </div>
        )
    }

    if (!customer) {
        return (
            <div className="text-center py-20">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Customer not found</p>
                <Link href="/dashboard/mobile-app/customers">
                    <Button className="mt-4">Back to list</Button>
                </Link>
            </div>
        )
    }

    const currency = customer.country === 'EG' ? 'EGP' : 'SAR'

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/dashboard/mobile-app/customers">
                    <Button variant="ghost" size="sm" className="p-2">
                        <ArrowRight className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">{customer.name}</h1>
                    <p className="text-muted-foreground">{customer.email}</p>
                </div>
                <div className="mr-auto flex gap-2">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${customer.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                        {customer.isActive ? 'Active' : 'Disabled'}
                    </span>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-muted">
                        {customer.country === 'SA' ? '🇸🇦 Saudi Arabia' : '🇪🇬 Egypt'}
                    </span>
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Customer Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Customer Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{customer.email}</span>
                        </div>
                        {customer.phone && (
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <span>{customer.phone}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>Registered: {formatDate(customer.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <History className="h-4 w-4 text-muted-foreground" />
                            <span>Login count: {customer.loginCount}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Wallet */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Wallet className="h-5 w-5" />
                            Wallet
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Balance</span>
                                <span className="text-xl font-bold text-green-600">
                                    {formatCurrency(customer.walletBalance, currency)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Store Balance</span>
                                <span className="font-medium">
                                    {formatCurrency(customer.storeCredit, currency)}
                                </span>
                            </div>
                            <div className="border-t pt-3">
                                <div className="flex justify-between items-center">
                                    <span className="font-medium">Total</span>
                                    <span className="text-2xl font-bold">
                                        {formatCurrency(customer.walletBalance + customer.storeCredit, currency)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Balance Adjustment */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            Adjust Balance
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex gap-2">
                            <Button
                                variant={adjustmentType === 'credit' ? 'primary' : 'outline'}
                                size="sm"
                                className="flex-1"
                                onClick={() => setAdjustmentType('credit')}
                            >
                                <Plus className="h-4 w-4 ml-1" />
                                Credit
                            </Button>
                            <Button
                                variant={adjustmentType === 'debit' ? 'danger' : 'outline'}
                                size="sm"
                                className="flex-1"
                                onClick={() => setAdjustmentType('debit')}
                            >
                                <Minus className="h-4 w-4 ml-1" />
                                Debit
                            </Button>
                        </div>
                        <Input
                            type="number"
                            placeholder="Amount"
                            value={adjustmentAmount}
                            onChange={(e) => setAdjustmentAmount(e.target.value)}
                        />
                        <Input
                            placeholder="Reason (optional)"
                            value={adjustmentDescription}
                            onChange={(e) => setAdjustmentDescription(e.target.value)}
                        />
                        <Button
                            className="w-full"
                            disabled={!adjustmentAmount || adjusting}
                            onClick={handleBalanceAdjustment}
                        >
                            {adjusting ? 'Modifying...' : 'Confirm'}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b">
                <Button
                    variant={activeTab === 'wallet' ? 'primary' : 'ghost'}
                    onClick={() => setActiveTab('wallet')}
                >
                    <Wallet className="h-4 w-4 ml-2" />
                    Wallet ({transactions.length})
                </Button>
                <Button
                    variant={activeTab === 'operations' ? 'primary' : 'ghost'}
                    onClick={() => setActiveTab('operations')}
                >
                    <History className="h-4 w-4 ml-2" />
                    Operations ({operations.length})
                </Button>
                <Button
                    variant={activeTab === 'orders' ? 'primary' : 'ghost'}
                    onClick={() => setActiveTab('orders')}
                >
                    <ShoppingCart className="h-4 w-4 ml-2" />
                    Orders ({orders.length})
                </Button>
            </div>

            {/* Tab Content */}
            <Card>
                <CardContent className="pt-6">
                    {activeTab === 'wallet' && (
                        <div className="space-y-2">
                            {transactions.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">No transactions</p>
                            ) : (
                                transactions.map((tx) => (
                                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${tx.type === 'CREDIT' ? 'bg-green-100 text-green-600' :
                                                tx.type === 'REFUND' ? 'bg-blue-100 text-blue-600' :
                                                    'bg-red-100 text-red-600'
                                                }`}>
                                                {tx.type === 'CREDIT' ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <p className="font-medium">{tx.description}</p>
                                                <p className="text-sm text-muted-foreground">{formatDate(tx.createdAt)}</p>
                                            </div>
                                        </div>
                                        <span className={`font-bold ${tx.type === 'CREDIT' || tx.type === 'REFUND' ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                            {tx.type === 'CREDIT' || tx.type === 'REFUND' ? '+' : '-'}
                                            {formatCurrency(tx.amount, currency)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'operations' && (
                        <div className="space-y-2">
                            {operations.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">No operations</p>
                            ) : (
                                operations.map((op) => (
                                    <div key={op.id} className="flex items-center justify-between p-3 rounded-lg border">
                                        <div>
                                            <p className="font-medium">
                                                {op.type === 'RENEW' ? 'Renewal' : op.type === 'SIGNAL_REFRESH' ? 'Signal Refresh' : op.type}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {op.cardNumber} • {formatDate(op.createdAt)}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${op.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                            op.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                                'bg-yellow-100 text-yellow-800'
                                            }`}>
                                            {op.status}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'orders' && (
                        <div className="space-y-2">
                            {orders.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">No orders</p>
                            ) : (
                                orders.map((order) => (
                                    <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border">
                                        <div>
                                            <p className="font-medium">{order.orderNumber}</p>
                                            <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold">{formatCurrency(order.total, order.currency)}</p>
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${order.status === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                                                order.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                                                    'bg-blue-100 text-blue-800'
                                                }`}>
                                                {order.status}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
