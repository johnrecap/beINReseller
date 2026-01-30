/**
 * Customers Management Page
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import PageHeader from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { UserCircle } from 'lucide-react'
import { CustomersTable } from '@/components/admin/store/CustomersTable'

async function getCustomers() {
    return prisma.customer.findMany({
        include: {
            _count: {
                select: { 
                    orders: true,
                    subscriptions: true 
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    })
}

async function CustomersContent() {
    const customers = await getCustomers()
    return <CustomersTable customers={customers} />
}

export default async function CustomersPage() {
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<UserCircle className="w-6 h-6 text-white" />}
                title="Customers"
                subtitle="Manage Desh Store app customers"
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
                <CustomersContent />
            </Suspense>
        </div>
    )
}
