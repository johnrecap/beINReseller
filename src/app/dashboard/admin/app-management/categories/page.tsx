/**
 * Categories Management Page
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import PageHeader from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Tags } from 'lucide-react'
import { CategoriesTable } from '@/components/admin/store/CategoriesTable'

async function getCategories() {
    return prisma.productCategory.findMany({
        include: {
            _count: {
                select: { products: true }
            }
        },
        orderBy: { sortOrder: 'asc' }
    })
}

async function CategoriesContent() {
    const categories = await getCategories()
    return <CategoriesTable categories={categories} />
}

export default async function CategoriesPage() {
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<Tags className="w-6 h-6 text-white" />}
                title="Categories"
                subtitle="Manage product categories for the Desh Store app"
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
                <CategoriesContent />
            </Suspense>
        </div>
    )
}
