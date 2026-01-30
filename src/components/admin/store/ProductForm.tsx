'use client'

/**
 * Product Form Component
 * 
 * Create and edit products
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Category {
    id: string
    name: string
    nameAr: string
}

interface Product {
    id: string
    name: string
    nameAr: string
    description?: string | null
    descriptionAr?: string | null
    sku: string | null
    categoryId?: string
    priceSAR: number
    priceEGP: number
    comparePriceSAR?: number | null
    comparePriceEGP?: number | null
    stock: number
    isActive: boolean
    isFeatured: boolean
    images: string[]
    category: {
        id: string
        name: string
        nameAr: string
    }
}

interface ProductFormProps {
    product?: Product
    categories: Category[]
    onSuccess: () => void
    onCancel: () => void
}

export function ProductForm({ product, categories, onSuccess, onCancel }: ProductFormProps) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        name: product?.name || '',
        nameAr: product?.nameAr || '',
        description: product?.description || '',
        descriptionAr: product?.descriptionAr || '',
        sku: product?.sku || '',
        categoryId: product?.category?.id || categories[0]?.id || '',
        priceSAR: product?.priceSAR?.toString() || '',
        priceEGP: product?.priceEGP?.toString() || '',
        comparePriceSAR: product?.comparePriceSAR?.toString() || '',
        comparePriceEGP: product?.comparePriceEGP?.toString() || '',
        stock: product?.stock?.toString() || '0',
        isActive: product?.isActive ?? true,
        isFeatured: product?.isFeatured ?? false,
        images: product?.images?.join('\n') || '',
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const payload = {
                name: formData.name,
                nameAr: formData.nameAr,
                description: formData.description || null,
                descriptionAr: formData.descriptionAr || null,
                sku: formData.sku || null,
                categoryId: formData.categoryId,
                priceSAR: parseFloat(formData.priceSAR),
                priceEGP: parseFloat(formData.priceEGP),
                comparePriceSAR: formData.comparePriceSAR ? parseFloat(formData.comparePriceSAR) : null,
                comparePriceEGP: formData.comparePriceEGP ? parseFloat(formData.comparePriceEGP) : null,
                stock: parseInt(formData.stock),
                isActive: formData.isActive,
                isFeatured: formData.isFeatured,
                images: formData.images.split('\n').map(s => s.trim()).filter(Boolean),
            }

            const url = product 
                ? `/api/admin/store/products/${product.id}`
                : '/api/admin/store/products'
            
            const res = await fetch(url, {
                method: product ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.message || 'Failed to save product')
            }

            toast.success(product ? 'Product updated' : 'Product created')
            onSuccess()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save product')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Name (English) *</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="nameAr">Name (Arabic) *</Label>
                    <Input
                        id="nameAr"
                        value={formData.nameAr}
                        onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                        dir="rtl"
                        required
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="description">Description (English)</Label>
                    <textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md min-h-[80px] bg-background"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="descriptionAr">Description (Arabic)</Label>
                    <textarea
                        id="descriptionAr"
                        value={formData.descriptionAr}
                        onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                        dir="rtl"
                        className="w-full px-3 py-2 border rounded-md min-h-[80px] bg-background"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                        id="sku"
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        placeholder="e.g., DISH-001"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <select
                        id="category"
                        value={formData.categoryId}
                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md bg-background"
                        required
                    >
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="priceSAR">Price (SAR) *</Label>
                    <Input
                        id="priceSAR"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.priceSAR}
                        onChange={(e) => setFormData({ ...formData, priceSAR: e.target.value })}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="priceEGP">Price (EGP) *</Label>
                    <Input
                        id="priceEGP"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.priceEGP}
                        onChange={(e) => setFormData({ ...formData, priceEGP: e.target.value })}
                        required
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="comparePriceSAR">Compare Price (SAR)</Label>
                    <Input
                        id="comparePriceSAR"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.comparePriceSAR}
                        onChange={(e) => setFormData({ ...formData, comparePriceSAR: e.target.value })}
                        placeholder="Original price for discounts"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="comparePriceEGP">Compare Price (EGP)</Label>
                    <Input
                        id="comparePriceEGP"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.comparePriceEGP}
                        onChange={(e) => setFormData({ ...formData, comparePriceEGP: e.target.value })}
                        placeholder="Original price for discounts"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="stock">Stock *</Label>
                <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    required
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="images">Image URLs (one per line)</Label>
                <textarea
                    id="images"
                    value={formData.images}
                    onChange={(e) => setFormData({ ...formData, images: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md min-h-[80px] bg-background font-mono text-sm"
                    placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
                />
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <Switch
                        id="isActive"
                        checked={formData.isActive}
                        onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    />
                    <Label htmlFor="isActive">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                    <Switch
                        id="isFeatured"
                        checked={formData.isFeatured}
                        onCheckedChange={(checked) => setFormData({ ...formData, isFeatured: checked })}
                    />
                    <Label htmlFor="isFeatured">Featured</Label>
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {product ? 'Update Product' : 'Create Product'}
                </Button>
            </div>
        </form>
    )
}
