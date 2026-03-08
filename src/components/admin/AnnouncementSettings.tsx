'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Eye, Save, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'
import { ImageUpload } from '@/components/ui/ImageUpload'
import {
    ANIMATION_TYPE_OPTIONS,
    TEXT_SIZE_OPTIONS,
    POSITION_OPTIONS,
    PRESET_GRADIENTS,
    MESSAGE_MAX_LENGTH,
    IMAGE_ALT_MAX_LENGTH,
} from '@/lib/announcement/constants'
import { resolveUploadedImageSrc } from '@/lib/announcement/helpers'

interface Banner {
    id: string
    message: string
    imageUrl?: string | null
    imageAlt?: string | null
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

export default function AnnouncementSettings() {
    const { language } = useTranslation()
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
    const [imageUrl, setImageUrl] = useState('')
    const [imageAlt, setImageAlt] = useState('')

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
        setImageUrl('')
        setImageAlt('')
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
        setImageUrl(banner.imageUrl || '')
        setImageAlt(banner.imageAlt || '')
        setEditingId(banner.id)
        setShowForm(true)
    }

    // Save banner
    const handleSave = async () => {
        if (!message.trim() && !imageUrl) {
            toast.error('Please enter announcement text or upload an image')
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
                endDate: endDate || null,
                imageUrl: imageUrl || null,
                imageAlt: imageAlt.trim() || null
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

    const previewImageSrc = resolveUploadedImageSrc(imageUrl)

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
                                maxLength={MESSAGE_MAX_LENGTH}
                                placeholder="Enter announcement text here..."
                                dir="auto"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {message.length}/{MESSAGE_MAX_LENGTH} chars
                            </p>
                        </div>

                        {/* Announcement Image */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Announcement Image (optional)</label>
                            <ImageUpload
                                value={imageUrl}
                                onChange={(url) => setImageUrl(url as string)}
                                type="announcement"
                                multiple={false}
                            />
                            <input
                                type="text"
                                value={imageAlt}
                                onChange={(e) => setImageAlt(e.target.value)}
                                className="w-full mt-3 p-3 bg-secondary border border-border rounded-lg"
                                maxLength={IMAGE_ALT_MAX_LENGTH}
                                placeholder="Image alt text (optional)"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {imageAlt.length}/{IMAGE_ALT_MAX_LENGTH} chars
                            </p>
                        </div>

                        {/* Animation Type */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Animation Type</label>
                            <div className="grid grid-cols-3 gap-2">
                                {ANIMATION_TYPE_OPTIONS.map((type) => (
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
                                        {language === 'ar' ? type.labelAr : type.labelEn}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Preset Gradients */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Gradient Colors</label>
                            <div className="flex gap-2 flex-wrap">
                                {PRESET_GRADIENTS.map((preset) => (
                                    <button
                                        key={preset.name}
                                        onClick={() => setColors([...preset.colors])}
                                        className={cn(
                                            "px-3 py-2 rounded-lg border text-sm transition-all",
                                            JSON.stringify(colors) === JSON.stringify([...preset.colors])
                                                ? "border-primary ring-2 ring-primary/30"
                                                : "border-border hover:border-primary/50"
                                        )}
                                        style={{
                                            background: `linear-gradient(90deg, ${preset.colors.join(', ')})`
                                        }}
                                    >
                                        <span className="text-white font-medium drop-shadow-md">
                                            {language === 'ar' ? preset.nameAr : preset.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Text Size */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Text Size</label>
                            <div className="flex gap-2">
                                {TEXT_SIZE_OPTIONS.map((size) => (
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
                                        {language === 'ar' ? size.labelAr : size.labelEn}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Position */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Position</label>
                            <div className="flex gap-2">
                                {POSITION_OPTIONS.map((pos) => (
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
                                        {language === 'ar' ? pos.labelAr : pos.labelEn}
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
                                {previewImageSrc && (
                                    <div className="mb-3 flex justify-center">
                                        <img
                                            src={previewImageSrc}
                                            alt={imageAlt || 'Announcement image preview'}
                                            className="h-20 w-auto rounded-md border border-border object-cover"
                                        />
                                    </div>
                                )}
                                <p
                                    className={cn(
                                        "text-center font-semibold whitespace-pre-line break-words leading-relaxed",
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
                                disabled={saving || (!message.trim() && !imageUrl)}
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
                                        <div className="flex-1 min-w-0 flex items-start gap-3">
                                            {banner.imageUrl && (
                                                <img
                                                    src={resolveUploadedImageSrc(banner.imageUrl)}
                                                    alt={banner.imageAlt || 'Announcement image'}
                                                    className="w-14 h-14 rounded-md border border-border object-cover shrink-0"
                                                />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium whitespace-pre-line break-words" dir="auto">
                                                    {banner.message || '(Image announcement)'}
                                                </p>
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    <span className="text-xs px-2 py-1 rounded bg-secondary">
                                                        {ANIMATION_TYPE_OPTIONS.find(a => a.value === banner.animationType)?.labelEn}
                                                    </span>
                                                    <span className="text-xs px-2 py-1 rounded bg-secondary">
                                                        {TEXT_SIZE_OPTIONS.find(s => s.value === banner.textSize)?.labelEn}
                                                    </span>
                                                    <span className="text-xs px-2 py-1 rounded bg-secondary">
                                                        {POSITION_OPTIONS.find(p => p.value === banner.position)?.labelEn}
                                                    </span>
                                                    {banner.imageUrl && (
                                                        <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400">
                                                            Photo
                                                        </span>
                                                    )}
                                                    {banner.isActive && (
                                                        <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-500">
                                                            Active
                                                        </span>
                                                    )}
                                                </div>
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
