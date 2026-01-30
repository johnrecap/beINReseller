/**
 * Orders Management Page
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import PageHeader from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { ShoppingCart } from 'lucide-react'
import { OrdersTable } from '@/components/admin/store/OrdersTable'

async function getOrders() {
    return prisma.order.findMany({
        include: {
            customer: {
                select: { id: true, name: true, email: true, phone: true }
            },
            items: {
                select: { id: true, name: true, quantity: true, price: true }
            },
            payment: {
                select: { id: true, status: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })
}

async function OrdersContent() {
    const orders = await getOrders()
    return <OrdersTable orders={orders} />
}

export default async function OrdersPage() {
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<ShoppingCart className="w-6 h-6 text-white" />}
                title="Orders"
                subtitle="Manage customer orders from the Desh Store app"
            />
            
            <Suspense fallback={
                <Card>
                    <CardContent className="p-6">
                        <div className="animate-pulse space-y-4">
                            <div className="h-10 bg-muted rounded w-full" />
                            <div className="h-64 bg-muted/50 rounded w-full" />
                        </div>
                    </CardContent>
                </Card>
            }>
                <OrdersContent />
            </Suspense>
        </div>
    )
}
