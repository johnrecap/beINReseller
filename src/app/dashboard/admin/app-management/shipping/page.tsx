/**
 * Shipping Management Page
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import PageHeader from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Truck } from 'lucide-react'
import { ShippingTable } from '@/components/admin/store/ShippingTable'

async function getShippingRegions() {
    return prisma.shippingRegion.findMany({
        orderBy: [
            { country: 'asc' },
            { city: 'asc' }
        ]
    })
}

async function ShippingContent() {
    const regions = await getShippingRegions()
    return <ShippingTable regions={regions} />
}

export default async function ShippingPage() {
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<Truck className="w-6 h-6 text-white" />}
                title="Shipping"
                subtitle="Manage shipping regions and costs"
            />
            
            <Suspense fallback={
                <Card>
                    <CardContent className="p-6">
                        <div className="animate-pulse space-y-4">
                            <div className="h-10 bg-muted rounded w-full" />
                            <div className="h-48 bg-muted/50 rounded w-full" />
                        </div>
                    </CardContent>
                </Card>
            }>
                <ShippingContent />
            </Suspense>
        </div>
    )
}
