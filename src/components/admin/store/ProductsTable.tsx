'use client'

/**
 * Products Table Component
 * 
 * Displays products with filtering, search, and actions
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { 
    Plus, 
    Search, 
    Edit, 
    Trash2, 
    Eye, 
    EyeOff,
    Package,
    Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { ProductForm } from './ProductForm'

interface Product {
    id: string
    name: string
    nameAr: string
    sku: string | null
    priceSAR: number
    priceEGP: number
    stock: number
    isActive: boolean
    isFeatured: boolean
    images: string[]
    category: {
        id: string
        name: string
        nameAr: string
    }
    _count: {
        orderItems: number
    }
}

interface Category {
    id: string
    name: string
    nameAr: string
}

interface ProductsTableProps {
    products: Product[]
    categories: Category[]
}

export function ProductsTable({ products: initialProducts, categories }: ProductsTableProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [products, setProducts] = useState(initialProducts)
    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)

    // Filter products
    const filteredProducts = products.filter(product => {
        const matchesSearch = 
            product.name.toLowerCase().includes(search.toLowerCase()) ||
            product.nameAr.includes(search) ||
            product.sku?.toLowerCase().includes(search.toLowerCase())
        
        const matchesCategory = !categoryFilter || product.category.id === categoryFilter

        return matchesSearch && matchesCategory
    })

    const handleToggleActive = async (product: Product) => {
        try {
            const res = await fetch(`/api/admin/store/products/${product.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !product.isActive })
            })

            if (!res.ok) throw new Error('Failed to update product')

            setProducts(prev => prev.map(p => 
                p.id === product.id ? { ...p, isActive: !p.isActive } : p
            ))
            toast.success(product.isActive ? 'Product deactivated' : 'Product activated')
        } catch (error) {
            toast.error('Failed to update product')
        }
    }

    const handleDelete = async () => {
        if (!deletingProduct) return

        try {
            const res = await fetch(`/api/admin/store/products/${deletingProduct.id}`, {
                method: 'DELETE'
            })

            if (!res.ok) throw new Error('Failed to delete product')

            setProducts(prev => prev.filter(p => p.id !== deletingProduct.id))
            toast.success('Product deleted')
            setDeletingProduct(null)
        } catch (error) {
            toast.error('Failed to delete product')
        }
    }

    const handleCreateSuccess = () => {
        setShowCreateDialog(false)
        startTransition(() => {
            router.refresh()
        })
    }

    const handleEditSuccess = () => {
        setEditingProduct(null)
        startTransition(() => {
            router.refresh()
        })
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Products ({filteredProducts.length})
                    </CardTitle>
                    <Button onClick={() => setShowCreateDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Product
                    </Button>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="flex gap-4 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search products..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="px-3 py-2 border rounded-md bg-background"
                        >
                            <option value="">All Categories</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Table */}
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Price (SAR)</TableHead>
                                    <TableHead>Price (EGP)</TableHead>
                                    <TableHead>Stock</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Orders</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredProducts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            No products found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredProducts.map((product) => (
                                        <TableRow key={product.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    {product.images[0] ? (
                                                        <img 
                                                            src={product.images[0]} 
                                                            alt={product.name}
                                                            className="h-10 w-10 rounded object-cover"
                                                        />
                                                    ) : (
                                                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                                            <Package className="h-5 w-5 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="font-medium">{product.name}</p>
                                                        <p className="text-sm text-muted-foreground">{product.sku || 'No SKU'}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{product.category.name}</TableCell>
                                            <TableCell>{product.priceSAR.toFixed(2)}</TableCell>
                                            <TableCell>{product.priceEGP.toFixed(2)}</TableCell>
                                            <TableCell>
                                                <Badge variant={product.stock > 10 ? 'default' : product.stock > 0 ? 'warning' : 'destructive'}>
                                                    {product.stock}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Badge variant={product.isActive ? 'success' : 'secondary'}>
                                                        {product.isActive ? 'Active' : 'Inactive'}
                                                    </Badge>
                                                    {product.isFeatured && (
                                                        <Badge variant="outline">Featured</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{product._count.orderItems}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleToggleActive(product)}
                                                        title={product.isActive ? 'Deactivate' : 'Activate'}
                                                    >
                                                        {product.isActive ? (
                                                            <EyeOff className="h-4 w-4" />
                                                        ) : (
                                                            <Eye className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setEditingProduct(product)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setDeletingProduct(product)}
                                                        className="text-destructive hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Create Product Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Create Product</DialogTitle>
                    </DialogHeader>
                    <ProductForm 
                        categories={categories} 
                        onSuccess={handleCreateSuccess}
                        onCancel={() => setShowCreateDialog(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Edit Product Dialog */}
            <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Product</DialogTitle>
                    </DialogHeader>
                    {editingProduct && (
                        <ProductForm 
                            product={editingProduct}
                            categories={categories} 
                            onSuccess={handleEditSuccess}
                            onCancel={() => setEditingProduct(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingProduct} onOpenChange={() => setDeletingProduct(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Product</DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground">
                        Are you sure you want to delete <strong>{deletingProduct?.name}</strong>? 
                        This action cannot be undone.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingProduct(null)}>
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={handleDelete}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
