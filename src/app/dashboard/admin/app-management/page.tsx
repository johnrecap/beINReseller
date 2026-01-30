/**
 * App Management Dashboard
 * 
 * Overview of the Desh Store mobile app metrics and quick actions
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import PageHeader from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
    Package, 
    ShoppingCart, 
    Users, 
    CreditCard, 
    TrendingUp,
    DollarSign,
    Clock,
    CheckCircle
} from 'lucide-react'
import Link from 'next/link'

async function getStoreStats() {
    const [
        productsCount,
        categoriesCount,
        ordersCount,
        pendingOrdersCount,
        customersCount,
        subscriptionsCount,
        pendingSubscriptionsCount,
        recentOrders,
        recentSubscriptions,
    ] = await Promise.all([
        prisma.product.count({ where: { isActive: true } }),
        prisma.productCategory.count({ where: { isActive: true } }),
        prisma.order.count(),
        prisma.order.count({ where: { status: 'PENDING' } }),
        prisma.customer.count({ where: { isActive: true } }),
        prisma.storeSubscription.count(),
        prisma.storeSubscription.count({ where: { status: { in: ['PENDING', 'AWAITING_PACKAGE', 'AWAITING_PAYMENT', 'AWAITING_CAPTCHA'] } } }),
        prisma.order.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                total: true,
                currency: true,
                createdAt: true,
                customer: {
                    select: { name: true, email: true }
                }
            }
        }),
        prisma.storeSubscription.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                cardNumber: true,
                status: true,
                price: true,
                currency: true,
                createdAt: true,
                customer: {
                    select: { name: true, email: true }
                }
            }
        }),
    ])

    // Calculate revenue (simplified - sum of completed orders)
    const orderRevenue = await prisma.order.aggregate({
        where: { status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } },
        _sum: { total: true }
    })

    const subscriptionRevenue = await prisma.storeSubscription.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { price: true }
    })

    return {
        productsCount,
        categoriesCount,
        ordersCount,
        pendingOrdersCount,
        customersCount,
        subscriptionsCount,
        pendingSubscriptionsCount,
        totalRevenue: (orderRevenue._sum.total || 0) + (subscriptionRevenue._sum.price || 0),
        recentOrders,
        recentSubscriptions,
    }
}

function StatCard({ 
    title, 
    value, 
    icon: Icon, 
    description, 
    href 
}: { 
    title: string
    value: string | number
    icon: React.ElementType
    description?: string
    href?: string 
}) {
    const content = (
        <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {description && (
                    <p className="text-xs text-muted-foreground mt-1">{description}</p>
                )}
            </CardContent>
        </Card>
    )

    if (href) {
        return <Link href={href}>{content}</Link>
    }
    return content
}

function OrderStatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-800',
        PAID: 'bg-blue-100 text-blue-800',
        PROCESSING: 'bg-purple-100 text-purple-800',
        SHIPPED: 'bg-indigo-100 text-indigo-800',
        DELIVERED: 'bg-green-100 text-green-800',
        CANCELLED: 'bg-red-100 text-red-800',
        REFUNDED: 'bg-gray-100 text-gray-800',
    }
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
            {status}
        </span>
    )
}

function SubscriptionStatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-800',
        AWAITING_PACKAGE: 'bg-blue-100 text-blue-800',
        AWAITING_PAYMENT: 'bg-orange-100 text-orange-800',
        PAID: 'bg-indigo-100 text-indigo-800',
        PROCESSING: 'bg-purple-100 text-purple-800',
        AWAITING_CAPTCHA: 'bg-pink-100 text-pink-800',
        COMPLETING: 'bg-cyan-100 text-cyan-800',
        COMPLETED: 'bg-green-100 text-green-800',
        FAILED: 'bg-red-100 text-red-800',
        REFUNDED: 'bg-gray-100 text-gray-800',
        CANCELLED: 'bg-gray-100 text-gray-800',
    }
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
            {status.replace(/_/g, ' ')}
        </span>
    )
}

async function DashboardContent() {
    const stats = await getStoreStats()

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Revenue"
                    value={`$${stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    icon={DollarSign}
                    description="From orders & subscriptions"
                />
                <StatCard
                    title="Total Customers"
                    value={stats.customersCount}
                    icon={Users}
                    description="Active customers"
                    href="/dashboard/admin/app-management/customers"
                />
                <StatCard
                    title="Orders"
                    value={stats.ordersCount}
                    icon={ShoppingCart}
                    description={`${stats.pendingOrdersCount} pending`}
                    href="/dashboard/admin/app-management/orders"
                />
                <StatCard
                    title="Subscriptions"
                    value={stats.subscriptionsCount}
                    icon={CreditCard}
                    description={`${stats.pendingSubscriptionsCount} in progress`}
                    href="/dashboard/admin/app-management/subscriptions"
                />
            </div>

            {/* Secondary Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    title="Products"
                    value={stats.productsCount}
                    icon={Package}
                    description="Active products"
                    href="/dashboard/admin/app-management/products"
                />
                <StatCard
                    title="Categories"
                    value={stats.categoriesCount}
                    icon={TrendingUp}
                    description="Product categories"
                    href="/dashboard/admin/app-management/categories"
                />
                <StatCard
                    title="Pending Actions"
                    value={stats.pendingOrdersCount + stats.pendingSubscriptionsCount}
                    icon={Clock}
                    description="Orders + subscriptions needing attention"
                />
            </div>

            {/* Recent Activity */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Recent Orders */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Recent Orders</CardTitle>
                        <Link 
                            href="/dashboard/admin/app-management/orders" 
                            className="text-sm text-primary hover:underline"
                        >
                            View All
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {stats.recentOrders.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No orders yet</p>
                        ) : (
                            <div className="space-y-3">
                                {stats.recentOrders.map((order) => (
                                    <div key={order.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div>
                                            <p className="font-medium text-sm">{order.orderNumber}</p>
                                            <p className="text-xs text-muted-foreground">{order.customer.name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-sm">{order.currency} {order.total}</p>
                                            <OrderStatusBadge status={order.status} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Subscriptions */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Recent Subscriptions</CardTitle>
                        <Link 
                            href="/dashboard/admin/app-management/subscriptions" 
                            className="text-sm text-primary hover:underline"
                        >
                            View All
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {stats.recentSubscriptions.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No subscriptions yet</p>
                        ) : (
                            <div className="space-y-3">
                                {stats.recentSubscriptions.map((sub) => (
                                    <div key={sub.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div>
                                            <p className="font-medium text-sm font-mono">
                                                {sub.cardNumber.slice(0, 4)}****{sub.cardNumber.slice(-4)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{sub.customer.name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-sm">{sub.currency} {sub.price}</p>
                                            <SubscriptionStatusBadge status={sub.status} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default async function AppManagementPage() {
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<Package className="w-6 h-6 text-white" />}
                title="App Management"
                subtitle="Manage the Desh Store mobile app - products, orders, customers, and subscriptions"
            />
            
            <Suspense fallback={
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i} className="animate-pulse">
                            <CardHeader className="h-10 bg-muted/50 rounded" />
                            <CardContent className="h-16 bg-muted/30 rounded mt-2" />
                        </Card>
                    ))}
                </div>
            }>
                <DashboardContent />
            </Suspense>
        </div>
    )
}
