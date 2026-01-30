'use client'

/**
 * Categories Table Component
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { Plus, Edit, Trash2, Tags, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ImageUpload } from '@/components/ui/ImageUpload'

interface Category {
    id: string
    name: string
    nameAr: string
    description: string | null
    descriptionAr: string | null
    image: string | null
    isActive: boolean
    sortOrder: number
    _count: {
        products: number
    }
}

interface CategoriesTableProps {
    categories: Category[]
}

export function CategoriesTable({ categories: initialCategories }: CategoriesTableProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [categories, setCategories] = useState(initialCategories)
    const [showDialog, setShowDialog] = useState(false)
    const [editingCategory, setEditingCategory] = useState<Category | null>(null)
    const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        nameAr: '',
        description: '',
        descriptionAr: '',
        image: '',
        isActive: true,
        sortOrder: '0',
    })

    const resetForm = () => {
        setFormData({
            name: '',
            nameAr: '',
            description: '',
            descriptionAr: '',
            image: '',
            isActive: true,
            sortOrder: '0',
        })
    }

    const openCreate = () => {
        resetForm()
        setEditingCategory(null)
        setShowDialog(true)
    }

    const openEdit = (category: Category) => {
        setFormData({
            name: category.name,
            nameAr: category.nameAr,
            description: category.description || '',
            descriptionAr: category.descriptionAr || '',
            image: category.image || '',
            isActive: category.isActive,
            sortOrder: category.sortOrder.toString(),
        })
        setEditingCategory(category)
        setShowDialog(true)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const payload = {
                ...formData,
                sortOrder: parseInt(formData.sortOrder),
            }

            const url = editingCategory 
                ? `/api/admin/store/categories/${editingCategory.id}`
                : '/api/admin/store/categories'
            
            const res = await fetch(url, {
                method: editingCategory ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) throw new Error('Failed to save category')

            toast.success(editingCategory ? 'Category updated' : 'Category created')
            setShowDialog(false)
            startTransition(() => router.refresh())
        } catch (error) {
            toast.error('Failed to save category')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!deletingCategory) return

        try {
            const res = await fetch(`/api/admin/store/categories/${deletingCategory.id}`, {
                method: 'DELETE'
            })

            if (!res.ok) throw new Error('Failed to delete category')

            toast.success('Category deleted')
            setDeletingCategory(null)
            startTransition(() => router.refresh())
        } catch (error) {
            toast.error('Failed to delete category')
        }
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Tags className="h-5 w-5" />
                        Categories ({categories.length})
                    </CardTitle>
                    <Button onClick={openCreate}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Category
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Name (Arabic)</TableHead>
                                    <TableHead>Products</TableHead>
                                    <TableHead>Sort Order</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {categories.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No categories yet
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    categories.map((category) => (
                                        <TableRow key={category.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    {category.image ? (
                                                        <img 
                                                            src={category.image} 
                                                            alt={category.name}
                                                            className="h-10 w-10 rounded object-cover"
                                                        />
                                                    ) : (
                                                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                                            <Tags className="h-5 w-5 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                    <span className="font-medium">{category.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell dir="rtl">{category.nameAr}</TableCell>
                                            <TableCell>{category._count.products}</TableCell>
                                            <TableCell>{category.sortOrder}</TableCell>
                                            <TableCell>
                                                <Badge variant={category.isActive ? 'success' : 'secondary'}>
                                                    {category.isActive ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openEdit(category)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setDeletingCategory(category)}
                                                        className="text-destructive hover:text-destructive"
                                                        disabled={category._count.products > 0}
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

            {/* Create/Edit Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingCategory ? 'Edit Category' : 'Create Category'}
                        </DialogTitle>
                    </DialogHeader>
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

                        <div className="space-y-2">
                            <Label>Category Image</Label>
                            <ImageUpload
                                value={formData.image}
                                onChange={(url) => setFormData({ ...formData, image: url as string })}
                                type="category"
                                multiple={false}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="sortOrder">Sort Order</Label>
                            <Input
                                id="sortOrder"
                                type="number"
                                value={formData.sortOrder}
                                onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <Switch
                                id="isActive"
                                checked={formData.isActive}
                                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                            />
                            <Label htmlFor="isActive">Active</Label>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {editingCategory ? 'Update' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={!!deletingCategory} onOpenChange={() => setDeletingCategory(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Category</DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground">
                        Are you sure you want to delete <strong>{deletingCategory?.name}</strong>?
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingCategory(null)}>
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
