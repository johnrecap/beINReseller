'use client'

/**
 * Shipping Table Component
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Edit, Trash2, Truck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ShippingRegion {
    id: string
    country: string
    countryName: string
    countryNameAr: string
    city: string
    cityAr: string
    shippingCostSAR: number
    shippingCostEGP: number
    estimatedDays: number
    isActive: boolean
}

interface ShippingTableProps {
    regions: ShippingRegion[]
}

export function ShippingTable({ regions: initialRegions }: ShippingTableProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [regions, setRegions] = useState(initialRegions)
    const [showDialog, setShowDialog] = useState(false)
    const [editingRegion, setEditingRegion] = useState<ShippingRegion | null>(null)
    const [deletingRegion, setDeletingRegion] = useState<ShippingRegion | null>(null)
    const [loading, setLoading] = useState(false)
    const [countryFilter, setCountryFilter] = useState('')

    const [formData, setFormData] = useState({
        country: 'SA',
        countryName: 'Saudi Arabia',
        countryNameAr: 'المملكة العربية السعودية',
        city: '',
        cityAr: '',
        shippingCostSAR: '',
        shippingCostEGP: '',
        estimatedDays: '3',
        isActive: true,
    })

    const resetForm = () => {
        setFormData({
            country: 'SA',
            countryName: 'Saudi Arabia',
            countryNameAr: 'المملكة العربية السعودية',
            city: '',
            cityAr: '',
            shippingCostSAR: '',
            shippingCostEGP: '',
            estimatedDays: '3',
            isActive: true,
        })
    }

    const openCreate = () => {
        resetForm()
        setEditingRegion(null)
        setShowDialog(true)
    }

    const openEdit = (region: ShippingRegion) => {
        setFormData({
            country: region.country,
            countryName: region.countryName,
            countryNameAr: region.countryNameAr,
            city: region.city,
            cityAr: region.cityAr,
            shippingCostSAR: region.shippingCostSAR.toString(),
            shippingCostEGP: region.shippingCostEGP.toString(),
            estimatedDays: region.estimatedDays.toString(),
            isActive: region.isActive,
        })
        setEditingRegion(region)
        setShowDialog(true)
    }

    const handleCountryChange = (country: string) => {
        const countryData = country === 'SA' 
            ? { countryName: 'Saudi Arabia', countryNameAr: 'المملكة العربية السعودية' }
            : { countryName: 'Egypt', countryNameAr: 'مصر' }
        
        setFormData({ ...formData, country, ...countryData })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const payload = {
                ...formData,
                shippingCostSAR: parseFloat(formData.shippingCostSAR),
                shippingCostEGP: parseFloat(formData.shippingCostEGP),
                estimatedDays: parseInt(formData.estimatedDays),
            }

            const url = editingRegion 
                ? `/api/admin/store/shipping/${editingRegion.id}`
                : '/api/admin/store/shipping'
            
            const res = await fetch(url, {
                method: editingRegion ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) throw new Error('Failed to save shipping region')

            toast.success(editingRegion ? 'Region updated' : 'Region created')
            setShowDialog(false)
            startTransition(() => router.refresh())
        } catch (error) {
            toast.error('Failed to save shipping region')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!deletingRegion) return

        try {
            const res = await fetch(`/api/admin/store/shipping/${deletingRegion.id}`, {
                method: 'DELETE'
            })

            if (!res.ok) throw new Error('Failed to delete region')

            toast.success('Region deleted')
            setDeletingRegion(null)
            startTransition(() => router.refresh())
        } catch (error) {
            toast.error('Failed to delete region')
        }
    }

    const filteredRegions = regions.filter(r => !countryFilter || r.country === countryFilter)

    // Group by country
    const saRegions = filteredRegions.filter(r => r.country === 'SA')
    const egRegions = filteredRegions.filter(r => r.country === 'EG')

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        Shipping Regions ({regions.length})
                    </CardTitle>
                    <div className="flex gap-2">
                        <select
                            value={countryFilter}
                            onChange={(e) => setCountryFilter(e.target.value)}
                            className="px-3 py-2 border rounded-md bg-background text-sm"
                        >
                            <option value="">All Countries</option>
                            <option value="SA">Saudi Arabia</option>
                            <option value="EG">Egypt</option>
                        </select>
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Region
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Country</TableHead>
                                    <TableHead>City</TableHead>
                                    <TableHead>Cost (SAR)</TableHead>
                                    <TableHead>Cost (EGP)</TableHead>
                                    <TableHead>Est. Days</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRegions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            No shipping regions configured
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredRegions.map((region) => (
                                        <TableRow key={region.id}>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {region.country === 'SA' ? '🇸🇦' : '🇪🇬'} {region.countryName}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <p>{region.city}</p>
                                                    <p className="text-sm text-muted-foreground" dir="rtl">{region.cityAr}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>{region.shippingCostSAR.toFixed(2)}</TableCell>
                                            <TableCell>{region.shippingCostEGP.toFixed(2)}</TableCell>
                                            <TableCell>{region.estimatedDays} days</TableCell>
                                            <TableCell>
                                                <Badge variant={region.isActive ? 'success' : 'secondary'}>
                                                    {region.isActive ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openEdit(region)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setDeletingRegion(region)}
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

            {/* Create/Edit Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingRegion ? 'Edit Shipping Region' : 'Add Shipping Region'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Country</Label>
                            <select
                                value={formData.country}
                                onChange={(e) => handleCountryChange(e.target.value)}
                                className="w-full px-3 py-2 border rounded-md bg-background"
                                disabled={!!editingRegion}
                            >
                                <option value="SA">🇸🇦 Saudi Arabia</option>
                                <option value="EG">🇪🇬 Egypt</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="city">City (English) *</Label>
                                <Input
                                    id="city"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cityAr">City (Arabic) *</Label>
                                <Input
                                    id="cityAr"
                                    value={formData.cityAr}
                                    onChange={(e) => setFormData({ ...formData, cityAr: e.target.value })}
                                    dir="rtl"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="shippingCostSAR">Cost (SAR) *</Label>
                                <Input
                                    id="shippingCostSAR"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={formData.shippingCostSAR}
                                    onChange={(e) => setFormData({ ...formData, shippingCostSAR: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="shippingCostEGP">Cost (EGP) *</Label>
                                <Input
                                    id="shippingCostEGP"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={formData.shippingCostEGP}
                                    onChange={(e) => setFormData({ ...formData, shippingCostEGP: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="estimatedDays">Estimated Days</Label>
                            <Input
                                id="estimatedDays"
                                type="number"
                                min="1"
                                value={formData.estimatedDays}
                                onChange={(e) => setFormData({ ...formData, estimatedDays: e.target.value })}
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
                                {editingRegion ? 'Update' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={!!deletingRegion} onOpenChange={() => setDeletingRegion(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Shipping Region</DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground">
                        Are you sure you want to delete <strong>{deletingRegion?.city}</strong>?
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingRegion(null)}>
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
