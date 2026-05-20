'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, ImagePlus, Loader2, Megaphone, Power, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ImageUpload } from '@/components/ui/ImageUpload'
import AnnouncementBannerView from '@/components/announcements/AnnouncementBannerView'
import { cn } from '@/lib/utils'
import { resolveUploadedImageSrc } from '@/lib/announcement/helpers'
import {
    MAX_ANNOUNCEMENT_SLIDES,
    MESSAGE_MAX_LENGTH,
    TICKER_TEXT_MAX_LENGTH,
} from '@/lib/announcement/constants'

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
}

const defaultColors = ['#a3ff12', '#7c3aed', '#22d3ee']

function normalizeSlide(slide: Partial<AnnouncementSlideForm>, sortOrder: number): AnnouncementSlideForm {
    return {
        id: slide.id,
        imageUrl: slide.imageUrl || '',
        imageAlt: slide.imageAlt || '',
        title: slide.title || '',
        description: slide.description || '',
        linkLabel: slide.linkLabel || '',
        linkUrl: slide.linkUrl || '',
        sortOrder,
        isActive: slide.isActive !== false,
        imageFit: slide.imageFit || 'cover',
    }
}

export default function SimpleAnnouncementSettings() {
    const [banners, setBanners] = useState<Banner[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    const [message, setMessage] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [slides, setSlides] = useState<AnnouncementSlideForm[]>([])
    const [tickerEnabled, setTickerEnabled] = useState(false)
    const [tickerText, setTickerText] = useState('')
    const [tickerSpeed, setTickerSpeed] = useState('normal')
    const [tickerDirection, setTickerDirection] = useState('auto')
    const [tickerPosition, setTickerPosition] = useState('below')
    const [sliderAutoplay, setSliderAutoplay] = useState(true)
    const [sliderIntervalMs, setSliderIntervalMs] = useState(4800)
    const [isActive, setIsActive] = useState(true)
    const [isDismissable, setIsDismissable] = useState(true)
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    const slideUrls = useMemo(() => slides.map((slide) => slide.imageUrl).filter(Boolean), [slides])
    const activeSlides = useMemo(
        () => slides.filter((slide) => slide.isActive && slide.imageUrl),
        [slides]
    )

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
            console.error('Failed to fetch announcements:', error)
            toast.error('Failed to load announcements')
        } finally {
            setLoading(false)
        }
    }

    const resetForm = () => {
        setEditingId(null)
        setMessage('')
        setImageUrl('')
        setSlides([])
        setTickerEnabled(false)
        setTickerText('')
        setTickerSpeed('normal')
        setTickerDirection('auto')
        setTickerPosition('below')
        setSliderAutoplay(true)
        setSliderIntervalMs(4800)
        setIsActive(true)
        setIsDismissable(true)
        setStartDate('')
        setEndDate('')
    }

    const handleEdit = (banner: Banner) => {
        setEditingId(banner.id)
        setMessage(banner.message || '')
        setImageUrl(banner.imageUrl || '')
        setSlides((banner.slides || []).map((slide, index) => normalizeSlide(slide, index)))
        setTickerEnabled(Boolean(banner.tickerEnabled))
        setTickerText(banner.tickerText || '')
        setTickerSpeed(banner.tickerSpeed || 'normal')
        setTickerDirection(banner.tickerDirection || 'auto')
        setTickerPosition(banner.tickerPosition || 'below')
        setSliderAutoplay(banner.sliderAutoplay !== false)
        setSliderIntervalMs(banner.sliderIntervalMs || 4800)
        setIsActive(banner.isActive)
        setIsDismissable(banner.isDismissable ?? true)
        setStartDate(banner.startDate ? banner.startDate.split('T')[0] : '')
        setEndDate(banner.endDate ? banner.endDate.split('T')[0] : '')
    }

    const replaceSlidesFromUrls = (urls: string[]) => {
        const uniqueUrls = Array.from(new Set(urls)).slice(0, MAX_ANNOUNCEMENT_SLIDES)
        setSlides(uniqueUrls.map((url, index) => {
            const existing = slides.find((slide) => slide.imageUrl === url)
            return normalizeSlide(existing || { imageUrl: url }, index)
        }))
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

    const removeSlide = (index: number) => {
        setSlides(slides
            .filter((_, slideIndex) => slideIndex !== index)
            .map((slide, sortOrder) => ({ ...slide, sortOrder })))
    }

    const handleToggle = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/announcement/${id}`, { method: 'PATCH' })
            const data = await res.json()
            if (data.success) {
                toast.success('Announcement status updated')
                fetchBanners()
            } else {
                toast.error(data.error || 'Failed to update announcement')
            }
        } catch (error) {
            console.error('Failed to toggle announcement:', error)
            toast.error('Failed to update announcement')
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this announcement?')) return

        try {
            const res = await fetch(`/api/admin/announcement/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) {
                toast.success('Announcement deleted')
                if (editingId === id) resetForm()
                fetchBanners()
            } else {
                toast.error(data.error || 'Failed to delete announcement')
            }
        } catch (error) {
            console.error('Failed to delete announcement:', error)
            toast.error('Failed to delete announcement')
        }
    }

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
            toast.error('Add at least one image or ticker text')
            return
        }

        if (tickerEnabled && !tickerText.trim()) {
            toast.error('Ticker text is required')
            return
        }

        setSaving(true)
        try {
            const payload = {
                message,
                animationType: 'none',
                colors: defaultColors,
                textSize: 'medium',
                position: 'top',
                isActive,
                isDismissable,
                displayMode: activeSlides.length > 0 && imageUrl ? 'mixed' : activeSlides.length > 0 ? 'slider' : 'banner',
                imageFit: 'cover',
                sliderEnabled: activeSlides.length > 0,
                sliderAutoplay,
                sliderIntervalMs,
                sliderCardsDesktop: 3,
                sliderCardsTablet: 2,
                sliderCardsMobile: 1,
                tickerEnabled,
                tickerText: tickerText.trim() || null,
                tickerSpeed,
                tickerDirection,
                tickerPosition,
                tickerBackgroundColor: '#090d12',
                tickerTextColor: '#d8ff72',
                dismissalVersion: 1,
                startDate: startDate || null,
                endDate: endDate || null,
                imageUrl: imageUrl || null,
                imageAlt: null,
                slides: normalizedSlides,
            }

            const url = editingId ? `/api/admin/announcement/${editingId}` : '/api/admin/announcement'
            const res = await fetch(url, {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json()

            if (data.success) {
                toast.success(editingId ? 'Announcement updated' : 'Announcement created')
                resetForm()
                fetchBanners()
            } else {
                toast.error(data.error || 'Failed to save announcement')
            }
        } catch (error) {
            console.error('Failed to save announcement:', error)
            toast.error('Failed to save announcement')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex min-h-[320px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#a3ff12]" />
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <section className="stitch-glass overflow-hidden rounded-[28px] border border-white/10 bg-[#070b11]/90 p-5 shadow-2xl lg:p-6">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="stitch-label text-[#a3ff12]">MEDIA ANNOUNCEMENTS</p>
                        <h2 className="mt-2 text-2xl font-black text-white">Simple announcement control</h2>
                        <p className="mt-1 max-w-2xl text-sm text-white/55">
                            Upload images, order the cards, set the moving ticker, then preview the same main-page display.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/75">
                            <Switch checked={isActive} onCheckedChange={setIsActive} />
                            Active
                        </label>
                        <Button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || (!message.trim() && !imageUrl && activeSlides.length === 0 && !(tickerEnabled && tickerText.trim()))}
                            className="gap-2 rounded-full bg-[#a3ff12] px-5 font-black text-black hover:bg-[#c8ff55]"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save display
                        </Button>
                    </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
                    <div className="space-y-5">
                        <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <p className="stitch-label text-[#d0bcff]">IMAGE STACK</p>
                                    <h3 className="mt-1 text-lg font-black text-white">Upload and order images</h3>
                                </div>
                                <span className="rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 py-1 text-xs font-black text-[#a3ff12]">
                                    {slides.length}/{MAX_ANNOUNCEMENT_SLIDES}
                                </span>
                            </div>

                            <ImageUpload
                                value={slideUrls}
                                onChange={(urls) => replaceSlidesFromUrls(Array.isArray(urls) ? urls : [urls])}
                                type="announcement"
                                purpose="slide"
                                multiple
                                maxFiles={MAX_ANNOUNCEMENT_SLIDES}
                                className="stitch-upload-zone"
                            />

                            {slides.length === 0 ? (
                                <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/20 p-8 text-center">
                                    <ImagePlus className="mx-auto h-8 w-8 text-white/35" />
                                    <p className="mt-3 text-sm font-bold text-white/70">No image cards yet</p>
                                    <p className="mt-1 text-xs text-white/45">Upload one image or many images together.</p>
                                </div>
                            ) : (
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    {slides.map((slide, index) => (
                                        <div
                                            key={`${slide.imageUrl}-${index}`}
                                            className={cn(
                                                'group overflow-hidden rounded-[22px] border bg-[#0b111a] shadow-xl transition',
                                                slide.isActive ? 'border-[#a3ff12]/40' : 'border-white/10 opacity-60'
                                            )}
                                        >
                                            <div className="relative aspect-[16/9] overflow-hidden bg-black">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={resolveUploadedImageSrc(slide.imageUrl)}
                                                    alt={slide.imageAlt || `Announcement ${index + 1}`}
                                                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                                />
                                                <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-3">
                                                    <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-black text-white">
                                                        Card {index + 1}
                                                    </span>
                                                    <Switch
                                                        checked={slide.isActive}
                                                        onCheckedChange={(checked) => {
                                                            setSlides(slides.map((item, slideIndex) => (
                                                                slideIndex === index ? { ...item, isActive: checked } : item
                                                            )))
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 p-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-black text-white">
                                                        {slide.title || `Image ${index + 1}`}
                                                    </p>
                                                    <p className="text-xs text-white/45">
                                                        {slide.isActive ? 'Visible on main display' : 'Hidden'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => moveSlide(index, -1)} disabled={index === 0} className="h-9 w-9 p-0">
                                                        <ArrowUp className="h-4 w-4" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => moveSlide(index, 1)} disabled={index === slides.length - 1} className="h-9 w-9 p-0">
                                                        <ArrowDown className="h-4 w-4" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => removeSlide(index)} className="h-9 w-9 p-0 text-red-400 hover:text-red-300">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="stitch-label text-[#d0bcff]">MOVING TICKER</p>
                                    <h3 className="mt-1 text-lg font-black text-white">News-style text strip</h3>
                                </div>
                                <label className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/70">
                                    <Switch checked={tickerEnabled} onCheckedChange={setTickerEnabled} />
                                    Show
                                </label>
                            </div>
                            <textarea
                                value={tickerText}
                                onChange={(event) => setTickerText(event.target.value)}
                                rows={3}
                                maxLength={TICKER_TEXT_MAX_LENGTH}
                                className="w-full resize-none rounded-[18px] border border-white/10 bg-[#0b1420] p-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#a3ff12]/50"
                                placeholder="Write the moving announcement text here..."
                                dir="auto"
                            />
                            <div className="mt-3 grid gap-3 md:grid-cols-4">
                                <select value={tickerSpeed} onChange={(event) => setTickerSpeed(event.target.value)} className="rounded-[16px] border border-white/10 bg-[#0b1420] p-3 text-sm text-white">
                                    <option value="slow">Slow</option>
                                    <option value="normal">Normal</option>
                                    <option value="fast">Fast</option>
                                </select>
                                <select value={tickerDirection} onChange={(event) => setTickerDirection(event.target.value)} className="rounded-[16px] border border-white/10 bg-[#0b1420] p-3 text-sm text-white">
                                    <option value="auto">Auto</option>
                                    <option value="rtl">Right to left</option>
                                    <option value="ltr">Left to right</option>
                                </select>
                                <select value={tickerPosition} onChange={(event) => setTickerPosition(event.target.value)} className="rounded-[16px] border border-white/10 bg-[#0b1420] p-3 text-sm text-white">
                                    <option value="below">Below cards</option>
                                    <option value="above">Above cards</option>
                                </select>
                                <input
                                    type="number"
                                    min={3000}
                                    max={15000}
                                    step={500}
                                    value={sliderIntervalMs}
                                    onChange={(event) => setSliderIntervalMs(Number(event.target.value))}
                                    className="rounded-[16px] border border-white/10 bg-[#0b1420] p-3 text-sm text-white"
                                    aria-label="Slider interval"
                                />
                            </div>
                            <p className="mt-2 text-xs text-white/40">{tickerText.length}/{TICKER_TEXT_MAX_LENGTH} chars</p>
                        </div>

                        <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <p className="stitch-label text-[#d0bcff]">OPTIONAL</p>
                                    <h3 className="mt-1 text-lg font-black text-white">Single banner and schedule</h3>
                                </div>
                                <label className="flex items-center gap-2 text-sm text-white/65">
                                    <Switch checked={isDismissable} onCheckedChange={setIsDismissable} />
                                    Dismissable
                                </label>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <input
                                    value={message}
                                    onChange={(event) => setMessage(event.target.value)}
                                    maxLength={MESSAGE_MAX_LENGTH}
                                    className="rounded-[16px] border border-white/10 bg-[#0b1420] p-3 text-sm text-white placeholder:text-white/30"
                                    placeholder="Optional text"
                                    dir="auto"
                                />
                                <ImageUpload
                                    value={imageUrl}
                                    onChange={(url) => setImageUrl(url as string)}
                                    type="announcement"
                                    purpose="main"
                                    multiple={false}
                                />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(event) => setStartDate(event.target.value)}
                                    className="rounded-[16px] border border-white/10 bg-[#0b1420] p-3 text-sm text-white"
                                />
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(event) => setEndDate(event.target.value)}
                                    className="rounded-[16px] border border-white/10 bg-[#0b1420] p-3 text-sm text-white"
                                />
                            </div>
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <div className="sticky top-6 rounded-[28px] border border-[#a3ff12]/20 bg-[#04070c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <p className="stitch-label text-[#a3ff12]">LIVE PREVIEW</p>
                                    <h3 className="mt-1 text-lg font-black text-white">Main page widget</h3>
                                </div>
                                <Eye className="h-5 w-5 text-[#a3ff12]" />
                            </div>
                            <div className="rounded-[24px] border border-white/10 bg-black/40 p-3">
                                <AnnouncementBannerView
                                    banner={{
                                        message,
                                        imageUrl: imageUrl || null,
                                        imageAlt: null,
                                        animationType: 'none',
                                        colors: defaultColors,
                                        textSize: 'medium',
                                        position: 'top',
                                        displayMode: activeSlides.length > 0 && imageUrl ? 'mixed' : activeSlides.length > 0 ? 'slider' : 'banner',
                                        imageFit: 'cover',
                                        sliderEnabled: activeSlides.length > 0,
                                        sliderAutoplay,
                                        sliderIntervalMs,
                                        ticker: tickerEnabled && tickerText.trim()
                                            ? {
                                                enabled: true,
                                                text: tickerText,
                                                speed: tickerSpeed,
                                                direction: tickerDirection,
                                                position: tickerPosition,
                                                backgroundColor: '#090d12',
                                                textColor: '#d8ff72',
                                            }
                                            : null,
                                        slides: activeSlides.map((slide, index) => ({
                                            ...slide,
                                            id: slide.id || `preview-${index}`,
                                        })),
                                    }}
                                    previewMode
                                />
                            </div>
                            <div className="mt-4 flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white/60">
                                <span>{activeSlides.length || (imageUrl ? 1 : 0)} visible image cards</span>
                                <span>{sliderAutoplay ? 'Autoplay on' : 'Manual display'}</span>
                            </div>
                        </div>
                    </aside>
                </div>
            </section>

            <section className="stitch-glass rounded-[28px] border border-white/10 bg-[#070b11]/90 p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <p className="stitch-label text-[#d0bcff]">SAVED</p>
                        <h2 className="mt-1 text-xl font-black text-white">Current announcements</h2>
                    </div>
                    <Button type="button" variant="outline" onClick={resetForm} className="gap-2 rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/10">
                        <X className="h-4 w-4" />
                        New clean form
                    </Button>
                </div>

                {banners.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-white/10 p-10 text-center text-white/50">
                        No announcements yet
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {banners.map((banner) => {
                            const previewImage = banner.imageUrl || banner.slides?.[0]?.imageUrl
                            return (
                                <div
                                    key={banner.id}
                                    className={cn(
                                        'flex flex-wrap items-center justify-between gap-4 rounded-[22px] border p-3 transition',
                                        banner.isActive ? 'border-[#a3ff12]/35 bg-[#a3ff12]/[0.055]' : 'border-white/10 bg-white/[0.025]'
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="h-16 w-24 overflow-hidden rounded-[16px] border border-white/10 bg-black/40">
                                            {previewImage ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={resolveUploadedImageSrc(previewImage)}
                                                    alt={banner.imageAlt || 'Announcement image'}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <Megaphone className="m-auto mt-5 h-6 w-6 text-white/30" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-white" dir="auto">
                                                {banner.message || banner.tickerText || 'Image announcement'}
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/60">
                                                    {(banner.slides?.length || 0) + (banner.imageUrl ? 1 : 0)} images
                                                </span>
                                                {banner.tickerEnabled && (
                                                    <span className="rounded-full bg-[#d0bcff]/15 px-2.5 py-1 text-[11px] font-bold text-[#d0bcff]">
                                                        ticker
                                                    </span>
                                                )}
                                                {banner.isActive && (
                                                    <span className="rounded-full bg-[#a3ff12]/15 px-2.5 py-1 text-[11px] font-bold text-[#a3ff12]">
                                                        active
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button type="button" variant="ghost" size="sm" onClick={() => handleToggle(banner.id)} title={banner.isActive ? 'Disable' : 'Enable'} className="h-9 w-9 p-0">
                                            <Power className={cn('h-4 w-4', banner.isActive ? 'text-[#a3ff12]' : 'text-white/35')} />
                                        </Button>
                                        <Button type="button" variant="outline" onClick={() => handleEdit(banner)} className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/10">
                                            Edit
                                        </Button>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(banner.id)} className="h-9 w-9 p-0 text-red-400 hover:text-red-300">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>
        </div>
    )
}
