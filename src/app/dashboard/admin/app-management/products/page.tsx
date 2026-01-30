/**
 * Products Management Page
 * 
 * List, create, edit, and delete products for the Desh Store
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import PageHeader from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Package, Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { ProductsTable } from '@/components/admin/store/ProductsTable'

async function getProducts() {
    const products = await prisma.product.findMany({
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    nameAr: true,
                }
            },
            _count: {
                select: {
                    orderItems: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    const categories = await prisma.productCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' }
    })

    return { products, categories }
}

async function ProductsContent() {
    const { products, categories } = await getProducts()

    return (
        <ProductsTable products={products} categories={categories} />
    )
}

export default async function ProductsPage() {
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<Package className="w-6 h-6 text-white" />}
                title="Products"
                subtitle="Manage physical products for the Desh Store app"
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
                <ProductsContent />
            </Suspense>
        </div>
    )
}
