'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Eye, Save, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'

interface Banner {
    id: string
    message: string
    isActive: boolean
    animationType: string
    colors: string[]
    textSize: string
    position: string
    isDismissable: boolean
    startDate: string | null
    endDate: string | null
    createdAt: string
}

const animationTypes = [
    { value: 'gradient', label: 'Gradient', labelEn: 'Gradient' },
    { value: 'typing', label: 'Typing', labelEn: 'Typing' },
    { value: 'glow', label: 'Glow', labelEn: 'Glow' },
    { value: 'slide', label: 'Slide', labelEn: 'Slide' },
    { value: 'marquee', label: 'Marquee', labelEn: 'Marquee' },
    { value: 'none', label: 'None', labelEn: 'None' }
]

const textSizes = [
    { value: 'small', label: 'Small', labelEn: 'Small' },
    { value: 'medium', label: 'Medium', labelEn: 'Medium' },
    { value: 'large', label: 'Large', labelEn: 'Large' }
]

const positions = [
    { value: 'top', label: 'Top', labelEn: 'Top' },
    { value: 'bottom', label: 'Bottom', labelEn: 'Bottom' },
    { value: 'floating', label: 'Floating', labelEn: 'Floating' }
]

const presetGradients = [
    { name: 'Matrix', colors: ['#00ff00', '#00cc00', '#00ff00'] },
    { name: 'Fire', colors: ['#ff0080', '#ff8c00', '#ffff00'] },
    { name: 'Ocean', colors: ['#00d2ff', '#3a7bd5', '#00d2ff'] },
    { name: 'Neon', colors: ['#00ff87', '#60efff', '#00ff87'] },
    { name: 'Rainbow', colors: ['#ff0080', '#ff8c00', '#40e0d0', '#8e2de2', '#ff0080'] }
]

export default function AnnouncementSettings() {
    const { t, language } = useTranslation()
    const [banners, setBanners] = useState<Banner[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    // Form state
    const [message, setMessage] = useState('')
    const [animationType, setAnimationType] = useState('gradient')
    const [colors, setColors] = useState<string[]>(['#00ff00', '#00cc00', '#00ff00'])
    const [textSize, setTextSize] = useState('medium')
    const [position, setPosition] = useState('top')
    const [isDismissable, setIsDismissable] = useState(true)
    const [isActive, setIsActive] = useState(true)
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    // Fetch banners
    useEffect(() => {
        fetchBanners()
    }, [])

    const fetchBanners = async () => {
        try {
            const res = await fetch('/api/admin/announcement')
            const data = await res.json()
            if (data.success) {
                setBanners(data.banners)
            }
        } catch (error) {
            console.error('Failed to fetch banners:', error)
            toast.error('Failed to load announcements')
        } finally {
            setLoading(false)
        }
    }

    // Reset form
    const resetForm = () => {
        setMessage('')
        setAnimationType('gradient')
        setColors(['#00ff00', '#00cc00', '#00ff00'])
        setTextSize('medium')
        setPosition('top')
        setIsDismissable(true)
        setIsActive(true)
        setStartDate('')
        setEndDate('')
        setEditingId(null)
    }

    // Edit banner
    const handleEdit = (banner: Banner) => {
        setMessage(banner.message)
        setAnimationType(banner.animationType)
        setColors(banner.colors || ['#00ff00'])
        setTextSize(banner.textSize)
        setPosition(banner.position)
        setIsDismissable(banner.isDismissable)
        setIsActive(banner.isActive)
        setStartDate(banner.startDate ? banner.startDate.split('T')[0] : '')
        setEndDate(banner.endDate ? banner.endDate.split('T')[0] : '')
        setEditingId(banner.id)
        setShowForm(true)
    }

    // Save banner
    const handleSave = async () => {
        if (!message.trim()) {
            toast.error('Please enter announcement text')
            return
        }

        setSaving(true)
        try {
            const payload = {
                message,
                animationType,
                colors,
                textSize,
                position,
                isDismissable,
                isActive,
                startDate: startDate || null,
                endDate: endDate || null
            }

            const url = editingId
                ? `/api/admin/announcement/${editingId}`
                : '/api/admin/announcement'

            const res = await fetch(url, {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const data = await res.json()

            if (data.success) {
                toast.success(editingId ? 'Announcement updated' : 'Announcement created')
                fetchBanners()
                setShowForm(false)
                resetForm()
            } else {
                toast.error(data.error || 'Failed to save announcement')
            }
        } catch (error) {
            console.error('Failed to save banner:', error)
            toast.error('Failed to save announcement')
        } finally {
            setSaving(false)
        }
    }

    // Toggle active state
    const handleToggle = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/announcement/${id}`, {
                method: 'PATCH'
            })
            const data = await res.json()
            if (data.success) {
                toast.success('Announcement status updated')
                fetchBanners()
            }
        } catch (error) {
            console.error('Failed to toggle banner:', error)
            toast.error('Failed to update status')
        }
    }

    // Delete banner
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this announcement?')) return

        try {
            const res = await fetch(`/api/admin/announcement/${id}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            if (data.success) {
                toast.success('Announcement deleted')
                fetchBanners()
            }
        } catch (error) {
            console.error('Failed to delete banner:', error)
            toast.error('Failed to delete announcement')
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Action Button */}
            <div className="flex justify-end">
                <Button
                    onClick={() => {
                        resetForm()
                        setShowForm(!showForm)
                    }}
                    className="gap-2"
                >
                    <Plus className="w-4 h-4" />
                    New Announcement
                </Button>
            </div>

            {/* Form Card */}
            {showForm && (
                <Card className="border-primary/20">
                    <CardHeader>
                        <CardTitle className="text-lg">
                            {editingId ? 'Edit Announcement' : 'Create New Announcement'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Message */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Announcement Text</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full p-3 bg-secondary border border-border rounded-lg resize-none"
                                rows={3}
                                maxLength={500}
                                placeholder="Enter announcement text here..."
                                dir="auto"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {message.length}/500 chars
                            </p>
                        </div>

                        {/* Animation Type */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Animation Type</label>
                            <div className="grid grid-cols-3 gap-2">
                                {animationTypes.map((type) => (
                                    <button
                                        key={type.value}
                                        onClick={() => setAnimationType(type.value)}
                                        className={cn(
                                            "p-3 rounded-lg border text-sm transition-all",
                                            animationType === type.value
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border hover:border-primary/50"
                                        )}
                                    >
                                        {language === 'ar' ? type.label : type.labelEn}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Preset Gradients */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Gradient Colors</label>
                            <div className="flex gap-2 flex-wrap">
                                {presetGradients.map((preset) => (
                                    <button
                                        key={preset.name}
                                        onClick={() => setColors(preset.colors)}
                                        className={cn(
                                            "px-3 py-2 rounded-lg border text-sm transition-all",
                                            JSON.stringify(colors) === JSON.stringify(preset.colors)
                                                ? "border-primary ring-2 ring-primary/30"
                                                : "border-border hover:border-primary/50"
                                        )}
                                        style={{
                                            background: `linear-gradient(90deg, ${preset.colors.join(', ')})`
                                        }}
                                    >
                                        <span className="text-white font-medium drop-shadow-md">
                                            {preset.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Text Size */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Text Size</label>
                            <div className="flex gap-2">
                                {textSizes.map((size) => (
                                    <button
                                        key={size.value}
                                        onClick={() => setTextSize(size.value)}
                                        className={cn(
                                            "flex-1 p-3 rounded-lg border text-sm transition-all",
                                            textSize === size.value
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border hover:border-primary/50"
                                        )}
                                    >
                                        {language === 'ar' ? size.label : size.labelEn}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Position */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Position</label>
                            <div className="flex gap-2">
                                {positions.map((pos) => (
                                    <button
                                        key={pos.value}
                                        onClick={() => setPosition(pos.value)}
                                        className={cn(
                                            "flex-1 p-3 rounded-lg border text-sm transition-all",
                                            position === pos.value
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border hover:border-primary/50"
                                        )}
                                    >
                                        {language === 'ar' ? pos.label : pos.labelEn}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Toggles */}
                        <div className="flex flex-wrap gap-6">
                            <div className="flex items-center gap-3">
                                <Switch
                                    checked={isActive}
                                    onCheckedChange={setIsActive}
                                />
                                <label className="text-sm">Active</label>
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch
                                    checked={isDismissable}
                                    onCheckedChange={setIsDismissable}
                                />
                                <label className="text-sm">Dismissible</label>
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Start Date (optional)</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full p-3 bg-secondary border border-border rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">End Date (optional)</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full p-3 bg-secondary border border-border rounded-lg"
                                />
                            </div>
                        </div>

                        {/* Preview */}
                        <div>
                            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                Preview
                            </label>
                            <div className="p-4 bg-black/60 rounded-lg border border-border">
                                <p
                                    className={cn(
                                        "text-center font-semibold",
                                        textSize === 'small' && 'text-sm',
                                        textSize === 'medium' && 'text-base',
                                        textSize === 'large' && 'text-lg'
                                    )}
                                    style={{
                                        background: animationType === 'gradient'
                                            ? `linear-gradient(90deg, ${colors.join(', ')})`
                                            : 'none',
                                        backgroundSize: '300% 100%',
                                        WebkitBackgroundClip: animationType === 'gradient' ? 'text' : 'unset',
                                        backgroundClip: animationType === 'gradient' ? 'text' : 'unset',
                                        WebkitTextFillColor: animationType === 'gradient' ? 'transparent' : 'unset',
                                        color: animationType !== 'gradient' ? colors[0] : 'unset',
                                        animation: animationType === 'gradient' ? 'gradient-flow 4s ease infinite' : 'none',
                                        textShadow: animationType === 'glow' ? `0 0 20px ${colors[0]}` : 'none'
                                    }}
                                >
                                    {message || 'Announcement text will appear here...'}
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                            <Button
                                onClick={handleSave}
                                disabled={saving || !message.trim()}
                                className="gap-2"
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Save
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowForm(false)
                                    resetForm()
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Banners List */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Current Announcements</CardTitle>
                </CardHeader>
                <CardContent>
                    {banners.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No announcements yet
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {banners.map((banner) => (
                                <div
                                    key={banner.id}
                                    className={cn(
                                        "p-4 rounded-lg border transition-all",
                                        banner.isActive
                                            ? "border-green-500/50 bg-green-500/5"
                                            : "border-border"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate" dir="auto">
                                                {banner.message}
                                            </p>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <span className="text-xs px-2 py-1 rounded bg-secondary">
                                                    {animationTypes.find(a => a.value === banner.animationType)?.label}
                                                </span>
                                                <span className="text-xs px-2 py-1 rounded bg-secondary">
                                                    {textSizes.find(s => s.value === banner.textSize)?.label}
                                                </span>
                                                <span className="text-xs px-2 py-1 rounded bg-secondary">
                                                    {positions.find(p => p.value === banner.position)?.label}
                                                </span>
                                                {banner.isActive && (
                                                    <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-500">
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleToggle(banner.id)}
                                                title={banner.isActive ? 'Disable' : 'Enable'}
                                            >
                                                <Power className={cn(
                                                    "w-4 h-4",
                                                    banner.isActive ? "text-green-500" : "text-muted-foreground"
                                                )} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEdit(banner)}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(banner.id)}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
