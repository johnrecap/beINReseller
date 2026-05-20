'use client'

/**
 * Image Upload Component
 * 
 * Drag & drop or click to upload images
 * Supports single and multiple file uploads
 */

import { useState, useRef, useCallback, useMemo } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
    resolveUploadedImageSrc,
    validateAnnouncementImageDimensions,
} from '@/lib/announcement/helpers'
import {
    ANNOUNCEMENT_IMAGE_DIMENSION_RULES,
    type AnnouncementImagePurpose,
} from '@/lib/announcement/constants'

interface ImageUploadProps {
    value: string | string[]
    onChange: (value: string | string[]) => void
    type: 'product' | 'category' | 'announcement'
    purpose?: AnnouncementImagePurpose
    multiple?: boolean
    maxFiles?: number
    className?: string
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const image = new Image()

        image.onload = () => {
            URL.revokeObjectURL(url)
            resolve({ width: image.naturalWidth, height: image.naturalHeight })
        }
        image.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('Could not read image dimensions'))
        }
        image.src = url
    })
}

export function ImageUpload({
    value,
    onChange,
    type,
    purpose,
    multiple = false,
    maxFiles = 5,
    className
}: ImageUploadProps) {
    const [uploading, setUploading] = useState(false)
    const [dragActive, setDragActive] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Normalize value to array
    const images = useMemo(
        () => Array.isArray(value) ? value : (value ? [value] : []),
        [value]
    )

    const handleUpload = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return

        // Check max files
        const totalFiles = images.length + files.length
        if (multiple && totalFiles > maxFiles) {
            toast.error(`Maximum ${maxFiles} images allowed`)
            return
        }

        setUploading(true)

        try {
            const uploadedUrls: string[] = []

            for (const file of Array.from(files)) {
                // Validate file type
                if (!file.type.startsWith('image/')) {
                    toast.error(`${file.name} is not an image`)
                    continue
                }

                // Validate file size (5MB)
                if (file.size > 5 * 1024 * 1024) {
                    toast.error(`${file.name} is too large (max 5MB)`)
                    continue
                }

                if (type === 'announcement' && purpose) {
                    const dimensions = await getImageDimensions(file)
                    const dimensionResult = validateAnnouncementImageDimensions(
                        purpose,
                        dimensions.width,
                        dimensions.height
                    )

                    if (dimensionResult.status === 'rejected') {
                        toast.error(`${file.name}: ${dimensionResult.reason}`)
                        continue
                    }

                    if (dimensionResult.status === 'accepted_with_warning') {
                        toast.warning(`${file.name}: ${dimensionResult.reason}`)
                    }
                }

                // Upload file
                const formData = new FormData()
                formData.append('file', file)
                formData.append('type', type)
                if (purpose) {
                    formData.append('purpose', purpose)
                }

                const res = await fetch('/api/admin/upload', {
                    method: 'POST',
                    body: formData
                })

                if (!res.ok) {
                    const data = await res.json()
                    throw new Error(data.error || 'Upload failed')
                }

                const data = await res.json()
                if (data.dimensionStatus === 'accepted_with_warning' && data.dimensionMessage) {
                    toast.warning(data.dimensionMessage)
                }
                uploadedUrls.push(data.url)
            }

            if (uploadedUrls.length > 0) {
                if (multiple) {
                    onChange([...images, ...uploadedUrls])
                } else {
                    onChange(uploadedUrls[0])
                }
                toast.success(`${uploadedUrls.length} image(s) uploaded`)
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Upload failed')
        } finally {
            setUploading(false)
        }
    }, [images, multiple, maxFiles, purpose, type, onChange])

    const handleRemove = useCallback((urlToRemove: string) => {
        // Only update form state — actual file deletion is handled
        // by API routes after successful DB write (orphan-safe)
        if (multiple) {
            onChange(images.filter(url => url !== urlToRemove))
        } else {
            onChange('')
        }
    }, [images, multiple, onChange])

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true)
        } else if (e.type === 'dragleave') {
            setDragActive(false)
        }
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        handleUpload(e.dataTransfer.files)
    }, [handleUpload])

    const canAddMore = multiple ? images.length < maxFiles : images.length === 0
    const dimensionRule = type === 'announcement' && purpose
        ? ANNOUNCEMENT_IMAGE_DIMENSION_RULES[purpose]
        : null

    return (
        <div className={cn('space-y-3', className)}>
            {/* Image Preview Grid */}
            {images.length > 0 && (
                <div className={cn(
                    'grid gap-3',
                    multiple ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-1'
                )}>
                    {images.map((url, index) => (
                        <div
                            key={`${url}-${index}`}
                            className="relative group aspect-square rounded-lg overflow-hidden border bg-muted"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={resolveUploadedImageSrc(url)}
                                alt={`Uploaded image ${index + 1}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = '/images/placeholder.png'
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => handleRemove(url)}
                                className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload Zone */}
            {canAddMore && (
                <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    className={cn(
                        'relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer min-h-[120px]',
                        'border-border hover:border-primary/50 hover:bg-accent/50',
                        dragActive && 'border-primary bg-primary/10',
                        uploading && 'pointer-events-none opacity-50'
                    )}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                        multiple={multiple}
                        onChange={(e) => handleUpload(e.target.files)}
                        className="hidden"
                    />

                    <div className="flex flex-col items-center justify-center text-center">
                        {uploading ? (
                            <>
                                <Loader2 className="h-10 w-10 text-primary animate-spin mb-2" />
                                <p className="text-sm text-muted-foreground">Uploading...</p>
                            </>
                        ) : (
                            <>
                                <div className="p-3 rounded-full bg-primary/20 mb-3">
                                    <Upload className="h-6 w-6 text-primary" />
                                </div>
                                <p className="text-sm font-medium text-foreground">
                                    {dragActive ? 'Drop image here' : 'Click or drag image to upload'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {multiple
                                        ? `Up to ${maxFiles} images, max 5MB each`
                                        : 'JPG, PNG, WebP or GIF (max 5MB)'
                                    }
                                </p>
                                {dimensionRule && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Recommended {dimensionRule.recommendedWidth}x{dimensionRule.recommendedHeight}px,
                                        minimum {dimensionRule.minWidth}x{dimensionRule.minHeight}px
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Helper text */}
            {multiple && images.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    {images.length} of {maxFiles} images uploaded
                </p>
            )}
            {dimensionRule && images.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    Recommended size: {dimensionRule.recommendedWidth}x{dimensionRule.recommendedHeight}px.
                    Minimum accepted size: {dimensionRule.minWidth}x{dimensionRule.minHeight}px.
                </p>
            )}
        </div>
    )
}
