/**
 * Subscriptions Management Page
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import PageHeader from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { CreditCard } from 'lucide-react'
import { SubscriptionsTable } from '@/components/admin/store/SubscriptionsTable'

async function getSubscriptions() {
    return prisma.storeSubscription.findMany({
        include: {
            customer: {
                select: { id: true, name: true, email: true, phone: true }
            },
            operation: {
                select: { id: true, status: true }
            },
            payment: {
                select: { id: true, status: true, amount: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })
}

async function SubscriptionsContent() {
    const subscriptions = await getSubscriptions()
    return <SubscriptionsTable subscriptions={subscriptions} />
}

export default async function SubscriptionsPage() {
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<CreditCard className="w-6 h-6 text-white" />}
                title="Subscriptions"
                subtitle="Manage beIN subscription renewals from the Desh Store app"
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
                <SubscriptionsContent />
            </Suspense>
        </div>
    )
}
