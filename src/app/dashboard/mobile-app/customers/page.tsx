'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Search,
    Users,
    Eye,
    Wallet,
    ChevronLeft,
    ChevronRight
} from 'lucide-react'
import Link from 'next/link'

interface Customer {
    id: string
    email: string
    name: string
    phone: string | null
    country: string
    isVerified: boolean
    isActive: boolean
    walletBalance: number
    storeCredit: number
    loginCount: number
    createdAt: string
    lastLoginAt: string | null
    _count: {
        orders: number
        operations: number
        addresses: number
    }
}

interface Pagination {
    page: number
    limit: number
    total: number
    totalPages: number
}

export default function MobileAppCustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [country, setCountry] = useState<'all' | 'SA' | 'EG'>('all')
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    })

    useEffect(() => {
        let cancelled = false
        const fetchCustomers = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams()
                params.append('page', pagination.page.toString())
                params.append('limit', pagination.limit.toString())
                if (search) params.append('search', search)
                if (country !== 'all') params.append('country', country)

                const res = await fetch(`/api/admin/mobile-app/customers?${params}`)
                const data = await res.json()

                if (!cancelled && data.success) {
                    setCustomers(data.customers)
                    setPagination(prev => ({ ...prev, ...data.pagination }))
                }
            } catch (error) {
                console.error('Failed to fetch customers:', error)
            }
            if (!cancelled) setLoading(false)
        }
        fetchCustomers()
        return () => { cancelled = true }
    }, [pagination.page, pagination.limit, search, country])

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-'
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">App Customers</h1>
                        <p className="text-muted-foreground">Manage mobile app customers</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-4">
                        <div className="relative flex-1 min-w-[250px]">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pr-10"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant={country === 'all' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setCountry('all')}
                            >
                                All
                            </Button>
                            <Button
                                variant={country === 'SA' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setCountry('SA')}
                            >
                                🇸🇦 Saudi Arabia
                            </Button>
                            <Button
                                variant={country === 'EG' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setCountry('EG')}
                            >
                                🇪🇬 Egypt
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <Users className="h-8 w-8 text-blue-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">Total customers</p>
                                <p className="text-2xl font-bold">{pagination.total}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Customers Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Customer List</CardTitle>
                    <CardDescription>
                        Showing {customers.length} of {pagination.total} customers
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                    ) : customers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No customers
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-right py-3 px-4">Customer</th>
                                        <th className="text-right py-3 px-4">Country</th>
                                        <th className="text-right py-3 px-4">Balance</th>
                                        <th className="text-right py-3 px-4">Orders</th>
                                        <th className="text-right py-3 px-4">Operations</th>
                                        <th className="text-right py-3 px-4">Registered</th>
                                        <th className="text-right py-3 px-4">Status</th>
                                        <th className="text-center py-3 px-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customers.map((customer) => (
                                        <tr key={customer.id} className="border-b hover:bg-muted/50">
                                            <td className="py-3 px-4">
                                                <div>
                                                    <p className="font-medium">{customer.name}</p>
                                                    <p className="text-sm text-muted-foreground">{customer.email}</p>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="inline-flex items-center gap-1">
                                                    {customer.country === 'SA' ? '🇸🇦' : '🇪🇬'}
                                                    {customer.country}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <Wallet className="h-4 w-4 text-green-500" />
                                                    <span className="font-medium">
                                                        {formatCurrency(
                                                            customer.walletBalance + customer.storeCredit,
                                                            customer.country === 'EG' ? 'EGP' : 'SAR'
                                                        )}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                {customer._count.orders}
                                            </td>
                                            <td className="py-3 px-4">
                                                {customer._count.operations}
                                            </td>
                                            <td className="py-3 px-4 text-sm">
                                                {formatDate(customer.createdAt)}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${customer.isActive
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                    }`}>
                                                    {customer.isActive ? 'Active' : 'Disabled'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <Link href={`/dashboard/mobile-app/customers/${customer.id}`}>
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
