'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Loader2, Monitor, Plus, Save, Smartphone, Tablet, Trash2, Eye, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'
import { ImageUpload } from '@/components/ui/ImageUpload'
import {
    ANIMATION_TYPE_OPTIONS,
    TEXT_SIZE_OPTIONS,
    POSITION_OPTIONS,
    DISPLAY_MODE_OPTIONS,
    IMAGE_FIT_OPTIONS,
    TICKER_SPEED_OPTIONS,
    TICKER_DIRECTION_OPTIONS,
    TICKER_POSITION_OPTIONS,
    PRESET_GRADIENTS,
    MESSAGE_MAX_LENGTH,
    IMAGE_ALT_MAX_LENGTH,
    MAX_ANNOUNCEMENT_SLIDES,
    SLIDE_TITLE_MAX_LENGTH,
    SLIDE_DESCRIPTION_MAX_LENGTH,
    SLIDE_LINK_LABEL_MAX_LENGTH,
    TICKER_TEXT_MAX_LENGTH,
} from '@/lib/announcement/constants'
import { resolveUploadedImageSrc } from '@/lib/announcement/helpers'
import AnnouncementBannerView from '@/components/announcements/AnnouncementBannerView'

interface AnnouncementSlideForm {
    id?: string
    imageUrl: string
    imageAlt?: string | null
    title?: string | null
    description?: string | null
    linkLabel?: string | null
    linkUrl?: string | null
    sortOrder: number
    isActive: boolean
    imageFit: string
}

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
    displayMode?: string
    imageFit?: string
    sliderEnabled?: boolean
    sliderAutoplay?: boolean
    sliderIntervalMs?: number
    sliderCardsDesktop?: number
    sliderCardsTablet?: number
    sliderCardsMobile?: number
    tickerEnabled?: boolean
    tickerText?: string | null
    tickerSpeed?: string
    tickerDirection?: string
    tickerPosition?: string
    tickerBackgroundColor?: string
    tickerTextColor?: string
    dismissalVersion?: number
    slides?: AnnouncementSlideForm[]
    startDate: string | null
    endDate: string | null
    createdAt: string
}

type PreviewDevice = 'desktop' | 'tablet' | 'mobile'

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
    const [isActive, setIsActive] = useState(true)
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [imageAlt, setImageAlt] = useState('')
    const [isDismissable, setIsDismissable] = useState(true)
    const [displayMode, setDisplayMode] = useState('banner')
    const [imageFit, setImageFit] = useState('cover')
    const [sliderEnabled, setSliderEnabled] = useState(false)
    const [sliderAutoplay, setSliderAutoplay] = useState(false)
    const [sliderIntervalMs, setSliderIntervalMs] = useState(5000)
    const [sliderCardsDesktop, setSliderCardsDesktop] = useState(3)
    const [sliderCardsTablet, setSliderCardsTablet] = useState(2)
    const [sliderCardsMobile, setSliderCardsMobile] = useState(1)
    const [tickerEnabled, setTickerEnabled] = useState(false)
    const [tickerText, setTickerText] = useState('')
    const [tickerSpeed, setTickerSpeed] = useState('normal')
    const [tickerDirection, setTickerDirection] = useState('auto')
    const [tickerPosition, setTickerPosition] = useState('below')
    const [tickerBackgroundColor, setTickerBackgroundColor] = useState('#111827')
    const [tickerTextColor, setTickerTextColor] = useState('#ffffff')
    const [dismissalVersion, setDismissalVersion] = useState(1)
    const [slides, setSlides] = useState<AnnouncementSlideForm[]>([])
    const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')

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
        setIsActive(true)
        setStartDate('')
        setEndDate('')
        setImageUrl('')
        setImageAlt('')
        setIsDismissable(true)
        setDisplayMode('banner')
        setImageFit('cover')
        setSliderEnabled(false)
        setSliderAutoplay(false)
        setSliderIntervalMs(5000)
        setSliderCardsDesktop(3)
        setSliderCardsTablet(2)
        setSliderCardsMobile(1)
        setTickerEnabled(false)
        setTickerText('')
        setTickerSpeed('normal')
        setTickerDirection('auto')
        setTickerPosition('below')
        setTickerBackgroundColor('#111827')
        setTickerTextColor('#ffffff')
        setDismissalVersion(1)
        setSlides([])
        setPreviewDevice('desktop')
        setEditingId(null)
    }

    // Edit banner
    const handleEdit = (banner: Banner) => {
        setMessage(banner.message)
        setAnimationType(banner.animationType)
        setColors(banner.colors || ['#00ff00'])
        setTextSize(banner.textSize)
        setPosition(banner.position)
        setIsActive(banner.isActive)
        setStartDate(banner.startDate ? banner.startDate.split('T')[0] : '')
        setEndDate(banner.endDate ? banner.endDate.split('T')[0] : '')
        setImageUrl(banner.imageUrl || '')
        setImageAlt(banner.imageAlt || '')
        setIsDismissable(banner.isDismissable ?? true)
        setDisplayMode(banner.displayMode || 'banner')
        setImageFit(banner.imageFit || 'cover')
        setSliderEnabled(Boolean(banner.sliderEnabled))
        setSliderAutoplay(Boolean(banner.sliderAutoplay))
        setSliderIntervalMs(banner.sliderIntervalMs || 5000)
        setSliderCardsDesktop(banner.sliderCardsDesktop || 3)
        setSliderCardsTablet(banner.sliderCardsTablet || 2)
        setSliderCardsMobile(banner.sliderCardsMobile || 1)
        setTickerEnabled(Boolean(banner.tickerEnabled))
        setTickerText(banner.tickerText || '')
        setTickerSpeed(banner.tickerSpeed || 'normal')
        setTickerDirection(banner.tickerDirection || 'auto')
        setTickerPosition(banner.tickerPosition || 'below')
        setTickerBackgroundColor(banner.tickerBackgroundColor || '#111827')
        setTickerTextColor(banner.tickerTextColor || '#ffffff')
        setDismissalVersion(banner.dismissalVersion || 1)
        setSlides((banner.slides || []).map((slide, index) => ({
            ...slide,
            imageUrl: slide.imageUrl || '',
            imageAlt: slide.imageAlt || '',
            title: slide.title || '',
            description: slide.description || '',
            linkLabel: slide.linkLabel || '',
            linkUrl: slide.linkUrl || '',
            sortOrder: slide.sortOrder ?? index,
            isActive: slide.isActive !== false,
            imageFit: slide.imageFit || 'cover',
        })))
        setEditingId(banner.id)
        setShowForm(true)
    }

    const addSlide = () => {
        if (slides.length >= MAX_ANNOUNCEMENT_SLIDES) {
            toast.error(`Maximum ${MAX_ANNOUNCEMENT_SLIDES} slides allowed`)
            return
        }

        setSliderEnabled(true)
        setDisplayMode(displayMode === 'banner' ? 'mixed' : displayMode)
        setSlides([
            ...slides,
            {
                imageUrl: '',
                imageAlt: '',
                title: '',
                description: '',
                linkLabel: '',
                linkUrl: '',
                sortOrder: slides.length,
                isActive: true,
                imageFit: 'cover',
            },
        ])
    }

    const updateSlide = (index: number, patch: Partial<AnnouncementSlideForm>) => {
        setSlides(slides.map((slide, slideIndex) => (
            slideIndex === index ? { ...slide, ...patch } : slide
        )))
    }

    const removeSlide = (index: number) => {
        setSlides(slides
            .filter((_, slideIndex) => slideIndex !== index)
            .map((slide, sortOrder) => ({ ...slide, sortOrder })))
    }

    const moveSlide = (index: number, direction: -1 | 1) => {
        const nextIndex = index + direction
        if (nextIndex < 0 || nextIndex >= slides.length) return

        const nextSlides = [...slides]
        const current = nextSlides[index]
        nextSlides[index] = nextSlides[nextIndex]
        nextSlides[nextIndex] = current
        setSlides(nextSlides.map((slide, sortOrder) => ({ ...slide, sortOrder })))
    }

    // Save banner
    const handleSave = async () => {
        const normalizedSlides = slides.map((slide, sortOrder) => ({
            id: slide.id,
            imageUrl: slide.imageUrl,
            imageAlt: slide.imageAlt?.trim() || null,
            title: slide.title?.trim() || null,
            description: slide.description?.trim() || null,
            linkLabel: slide.linkLabel?.trim() || null,
            linkUrl: slide.linkUrl?.trim() || null,
            sortOrder,
            isActive: slide.isActive,
            imageFit: slide.imageFit || 'cover',
        }))
        const hasActiveSlide = normalizedSlides.some((slide) => slide.isActive && slide.imageUrl)

        if (!message.trim() && !imageUrl && !hasActiveSlide && !(tickerEnabled && tickerText.trim())) {
            toast.error('Please add text, an image, a slide, or ticker text')
            return
        }

        if (tickerEnabled && !tickerText.trim()) {
            toast.error('Ticker text is required when ticker is enabled')
            return
        }

        if (normalizedSlides.some((slide) => slide.imageUrl.length === 0)) {
            toast.error('Each slide must include an image or be removed')
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
                isActive,
                isDismissable,
                displayMode,
                imageFit,
                sliderEnabled,
                sliderAutoplay,
                sliderIntervalMs,
                sliderCardsDesktop,
                sliderCardsTablet,
                sliderCardsMobile,
                tickerEnabled,
                tickerText: tickerText.trim() || null,
                tickerSpeed,
                tickerDirection,
                tickerPosition,
                tickerBackgroundColor,
                tickerTextColor,
                dismissalVersion,
                startDate: startDate || null,
                endDate: endDate || null,
                imageUrl: imageUrl || null,
                imageAlt: imageAlt.trim() || null,
                slides: normalizedSlides,
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
                                purpose="main"
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

                        {/* Display Mode */}
                        <div className="rounded-lg border border-border p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Display Mode</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {DISPLAY_MODE_OPTIONS.map((mode) => (
                                        <button
                                            key={mode.value}
                                            type="button"
                                            onClick={() => setDisplayMode(mode.value)}
                                            className={cn(
                                                "p-3 rounded-lg border text-sm transition-all",
                                                displayMode === mode.value
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border hover:border-primary/50"
                                            )}
                                        >
                                            {mode.labelEn}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Image Fit</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {IMAGE_FIT_OPTIONS.map((fit) => (
                                        <button
                                            key={fit.value}
                                            type="button"
                                            onClick={() => setImageFit(fit.value)}
                                            className={cn(
                                                "p-3 rounded-lg border text-sm transition-all",
                                                imageFit === fit.value
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border hover:border-primary/50"
                                            )}
                                        >
                                            {fit.labelEn}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Slider Images */}
                        <div className="rounded-lg border border-border p-4 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <label className="block text-sm font-medium">Slider Images</label>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {slides.length}/{MAX_ANNOUNCEMENT_SLIDES} slides
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Switch
                                        checked={sliderEnabled}
                                        onCheckedChange={setSliderEnabled}
                                    />
                                    <span className="text-sm">Enabled</span>
                                    <Button type="button" variant="outline" size="sm" onClick={addSlide}>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Slide
                                    </Button>
                                </div>
                            </div>

                            {slides.length > 0 && (
                                <div className="space-y-4">
                                    {slides.map((slide, index) => (
                                        <div key={`${slide.id || 'new'}-${index}`} className="rounded-lg border border-border p-3 space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium">Slide {index + 1}</span>
                                                    <Switch
                                                        checked={slide.isActive}
                                                        onCheckedChange={(checked) => updateSlide(index, { isActive: checked })}
                                                    />
                                                    <span className="text-xs text-muted-foreground">
                                                        {slide.isActive ? 'Active' : 'Hidden'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => moveSlide(index, -1)} disabled={index === 0}>
                                                        <ArrowUp className="w-4 h-4" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => moveSlide(index, 1)} disabled={index === slides.length - 1}>
                                                        <ArrowDown className="w-4 h-4" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => removeSlide(index)} className="text-destructive hover:text-destructive">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            <ImageUpload
                                                value={slide.imageUrl}
                                                onChange={(url) => updateSlide(index, { imageUrl: url as string })}
                                                type="announcement"
                                                purpose="slide"
                                                multiple={false}
                                            />

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <input
                                                    type="text"
                                                    value={slide.title || ''}
                                                    onChange={(e) => updateSlide(index, { title: e.target.value })}
                                                    className="w-full p-3 bg-secondary border border-border rounded-lg"
                                                    maxLength={SLIDE_TITLE_MAX_LENGTH}
                                                    placeholder="Slide title"
                                                />
                                                <input
                                                    type="text"
                                                    value={slide.imageAlt || ''}
                                                    onChange={(e) => updateSlide(index, { imageAlt: e.target.value })}
                                                    className="w-full p-3 bg-secondary border border-border rounded-lg"
                                                    maxLength={IMAGE_ALT_MAX_LENGTH}
                                                    placeholder="Image alt text"
                                                />
                                                <input
                                                    type="text"
                                                    value={slide.linkLabel || ''}
                                                    onChange={(e) => updateSlide(index, { linkLabel: e.target.value })}
                                                    className="w-full p-3 bg-secondary border border-border rounded-lg"
                                                    maxLength={SLIDE_LINK_LABEL_MAX_LENGTH}
                                                    placeholder="Link label"
                                                />
                                                <input
                                                    type="text"
                                                    value={slide.linkUrl || ''}
                                                    onChange={(e) => updateSlide(index, { linkUrl: e.target.value })}
                                                    className="w-full p-3 bg-secondary border border-border rounded-lg"
                                                    placeholder="Internal path or HTTPS link"
                                                />
                                            </div>

                                            <textarea
                                                value={slide.description || ''}
                                                onChange={(e) => updateSlide(index, { description: e.target.value })}
                                                className="w-full p-3 bg-secondary border border-border rounded-lg resize-none"
                                                rows={2}
                                                maxLength={SLIDE_DESCRIPTION_MAX_LENGTH}
                                                placeholder="Slide description"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex items-center gap-3">
                                    <Switch
                                        checked={sliderAutoplay}
                                        onCheckedChange={setSliderAutoplay}
                                    />
                                    <label className="text-sm">Autoplay</label>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Interval ms</label>
                                    <input
                                        type="number"
                                        min={3000}
                                        max={15000}
                                        step={500}
                                        value={sliderIntervalMs}
                                        onChange={(e) => setSliderIntervalMs(Number(e.target.value))}
                                        className="w-full p-3 bg-secondary border border-border rounded-lg"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <label className="text-sm">
                                    Desktop cards
                                    <input
                                        type="number"
                                        min={1}
                                        max={6}
                                        value={sliderCardsDesktop}
                                        onChange={(e) => setSliderCardsDesktop(Number(e.target.value))}
                                        className="w-full mt-2 p-3 bg-secondary border border-border rounded-lg"
                                    />
                                </label>
                                <label className="text-sm">
                                    Tablet cards
                                    <input
                                        type="number"
                                        min={1}
                                        max={4}
                                        value={sliderCardsTablet}
                                        onChange={(e) => setSliderCardsTablet(Number(e.target.value))}
                                        className="w-full mt-2 p-3 bg-secondary border border-border rounded-lg"
                                    />
                                </label>
                                <label className="text-sm">
                                    Mobile cards
                                    <input
                                        type="number"
                                        min={1}
                                        max={2}
                                        value={sliderCardsMobile}
                                        onChange={(e) => setSliderCardsMobile(Number(e.target.value))}
                                        className="w-full mt-2 p-3 bg-secondary border border-border rounded-lg"
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Ticker Strip */}
                        <div className="rounded-lg border border-border p-4 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <label className="block text-sm font-medium">News Ticker</label>
                                    <p className="text-xs text-muted-foreground mt-1">Separate moving strip for short announcements.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Switch
                                        checked={tickerEnabled}
                                        onCheckedChange={setTickerEnabled}
                                    />
                                    <span className="text-sm">Enabled</span>
                                </div>
                            </div>

                            <textarea
                                value={tickerText}
                                onChange={(e) => setTickerText(e.target.value)}
                                className="w-full p-3 bg-secondary border border-border rounded-lg resize-none"
                                rows={2}
                                maxLength={TICKER_TEXT_MAX_LENGTH}
                                placeholder="Ticker text"
                                dir="auto"
                            />
                            <p className="text-xs text-muted-foreground">
                                {tickerText.length}/{TICKER_TEXT_MAX_LENGTH} chars
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <select value={tickerSpeed} onChange={(e) => setTickerSpeed(e.target.value)} className="w-full p-3 bg-secondary border border-border rounded-lg">
                                    {TICKER_SPEED_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.labelEn}</option>
                                    ))}
                                </select>
                                <select value={tickerDirection} onChange={(e) => setTickerDirection(e.target.value)} className="w-full p-3 bg-secondary border border-border rounded-lg">
                                    {TICKER_DIRECTION_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.labelEn}</option>
                                    ))}
                                </select>
                                <select value={tickerPosition} onChange={(e) => setTickerPosition(e.target.value)} className="w-full p-3 bg-secondary border border-border rounded-lg">
                                    {TICKER_POSITION_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.labelEn}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="text-sm">
                                    Background
                                    <input
                                        type="color"
                                        value={tickerBackgroundColor}
                                        onChange={(e) => setTickerBackgroundColor(e.target.value)}
                                        className="w-full h-11 mt-2 bg-secondary border border-border rounded-lg"
                                    />
                                </label>
                                <label className="text-sm">
                                    Text Color
                                    <input
                                        type="color"
                                        value={tickerTextColor}
                                        onChange={(e) => setTickerTextColor(e.target.value)}
                                        className="w-full h-11 mt-2 bg-secondary border border-border rounded-lg"
                                    />
                                </label>
                            </div>
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
                                <label className="text-sm">Dismissable</label>
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
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Eye className="w-4 h-4" />
                                    Preview
                                </label>
                                <div className="flex rounded-lg border border-border overflow-hidden">
                                    {[
                                        { value: 'desktop' as const, icon: Monitor },
                                        { value: 'tablet' as const, icon: Tablet },
                                        { value: 'mobile' as const, icon: Smartphone },
                                    ].map((device) => {
                                        const Icon = device.icon
                                        return (
                                            <button
                                                key={device.value}
                                                type="button"
                                                onClick={() => setPreviewDevice(device.value)}
                                                className={cn(
                                                    "px-3 py-2 text-sm transition-colors",
                                                    previewDevice === device.value
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-secondary hover:bg-secondary/80"
                                                )}
                                            >
                                                <Icon className="w-4 h-4" />
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            <div className={cn(
                                "mx-auto rounded-lg border border-border bg-background p-3 transition-all",
                                previewDevice === 'desktop' && "max-w-full",
                                previewDevice === 'tablet' && "max-w-[760px]",
                                previewDevice === 'mobile' && "max-w-[390px]"
                            )}>
                                <AnnouncementBannerView
                                    banner={{
                                        message,
                                        imageUrl: imageUrl || null,
                                        imageAlt: imageAlt || null,
                                        animationType,
                                        colors,
                                        textSize,
                                        position,
                                    }}
                                    previewMode
                                />
                                {sliderEnabled && slides.filter((slide) => slide.isActive && slide.imageUrl).length > 0 && (
                                    <div className={cn(
                                        "mt-3 grid gap-3",
                                        previewDevice === 'desktop' && "grid-cols-3",
                                        previewDevice === 'tablet' && "grid-cols-2",
                                        previewDevice === 'mobile' && "grid-cols-1"
                                    )}>
                                        {slides.filter((slide) => slide.isActive && slide.imageUrl).slice(0, previewDevice === 'mobile' ? 1 : 3).map((slide, index) => (
                                            <div key={`${slide.imageUrl}-${index}`} className="rounded-lg border border-border overflow-hidden bg-secondary">
                                                <div className="aspect-video bg-black">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={resolveUploadedImageSrc(slide.imageUrl)}
                                                        alt={slide.imageAlt || 'Announcement slide'}
                                                        className={cn(
                                                            "w-full h-full",
                                                            slide.imageFit === 'contain' ? "object-contain" : "object-cover"
                                                        )}
                                                    />
                                                </div>
                                                {(slide.title || slide.description) && (
                                                    <div className="p-3">
                                                        {slide.title && <p className="text-sm font-medium">{slide.title}</p>}
                                                        {slide.description && <p className="text-xs text-muted-foreground mt-1">{slide.description}</p>}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {tickerEnabled && tickerText.trim() && (
                                    <div
                                        className="mt-3 overflow-hidden rounded-md px-3 py-2 text-sm font-medium"
                                        style={{ backgroundColor: tickerBackgroundColor, color: tickerTextColor }}
                                        dir={tickerDirection === 'auto' ? 'auto' : tickerDirection}
                                    >
                                        <div className="whitespace-nowrap truncate">
                                            {tickerText}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                            <Button
                                onClick={handleSave}
                                disabled={saving || (!message.trim() && !imageUrl && !slides.some((slide) => slide.isActive && slide.imageUrl) && !(tickerEnabled && tickerText.trim()))}
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
                                            {(banner.imageUrl || banner.slides?.[0]?.imageUrl) && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={resolveUploadedImageSrc(banner.imageUrl || banner.slides?.[0]?.imageUrl)}
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
                                                    {banner.slides && banner.slides.length > 0 && (
                                                        <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400">
                                                            {banner.slides.length} slides
                                                        </span>
                                                    )}
                                                    {banner.tickerEnabled && (
                                                        <span className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-400">
                                                            Ticker
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
