/**
 * Image Upload API
 * POST /api/admin/upload
 * 
 * Handles image uploads for products, categories, and announcements
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'
import {
    ANNOUNCEMENT_IMAGE_PURPOSES,
    type AnnouncementImagePurpose,
} from '@/lib/announcement/constants'
import { validateAnnouncementImageDimensions } from '@/lib/announcement/helpers'

// Allowed file types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function readUInt24LE(buffer: Buffer, offset: number): number {
    return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}

function getImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
    if (mimeType === 'image/png' && buffer.length >= 24) {
        return {
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20),
        }
    }

    if (mimeType === 'image/gif' && buffer.length >= 10) {
        return {
            width: buffer.readUInt16LE(6),
            height: buffer.readUInt16LE(8),
        }
    }

    if ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && buffer.length > 4) {
        let offset = 2
        while (offset < buffer.length) {
            if (buffer[offset] !== 0xff) return null
            const marker = buffer[offset + 1]
            const length = buffer.readUInt16BE(offset + 2)

            if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < buffer.length) {
                return {
                    height: buffer.readUInt16BE(offset + 5),
                    width: buffer.readUInt16BE(offset + 7),
                }
            }

            offset += 2 + length
        }
    }

    if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
        const format = buffer.toString('ascii', 12, 16)
        if (format === 'VP8X' && buffer.length >= 30) {
            return {
                width: readUInt24LE(buffer, 24) + 1,
                height: readUInt24LE(buffer, 27) + 1,
            }
        }

        if (format === 'VP8 ' && buffer.length >= 30) {
            return {
                width: buffer.readUInt16LE(26) & 0x3fff,
                height: buffer.readUInt16LE(28) & 0x3fff,
            }
        }

        if (format === 'VP8L' && buffer.length >= 25) {
            const bits = buffer.readUInt32LE(21)
            return {
                width: (bits & 0x3fff) + 1,
                height: ((bits >> 14) & 0x3fff) + 1,
            }
        }
    }

    return null
}

function parseAnnouncementPurpose(value: FormDataEntryValue | null): AnnouncementImagePurpose | null {
    if (typeof value !== 'string') return null
    return ANNOUNCEMENT_IMAGE_PURPOSES.includes(value as AnnouncementImagePurpose)
        ? value as AnnouncementImagePurpose
        : null
}

// Generate unique filename
function generateFilename(originalName: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const ext = path.extname(originalName).toLowerCase() || '.jpg'
    return `${timestamp}-${random}${ext}`
}

export async function POST(request: NextRequest) {
    try {
        // Check authentication - must be admin
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        // Parse form data
        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const type = formData.get('type') as string | null // 'product' | 'category' | 'announcement'
        const purpose = parseAnnouncementPurpose(formData.get('purpose'))

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({
                error: 'Invalid file type. Allowed: JPG, PNG, WebP, GIF'
            }, { status: 400 })
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({
                error: 'File too large. Maximum size: 5MB'
            }, { status: 400 })
        }

        // Convert file to buffer once so validation and save use the same bytes
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const dimensions = getImageDimensions(buffer, file.type)
        const dimensionResult =
            type === 'announcement' && purpose && dimensions
                ? validateAnnouncementImageDimensions(purpose, dimensions.width, dimensions.height)
                : null

        if (dimensionResult?.status === 'rejected') {
            return NextResponse.json({
                error: dimensionResult.reason,
                width: dimensions?.width,
                height: dimensions?.height,
                dimensionStatus: dimensionResult.status,
            }, { status: 400 })
        }

        // Determine upload folder
        const folder =
            type === 'category'
                ? 'categories'
                : type === 'announcement'
                    ? 'announcements'
                    : 'products'
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', folder)

        // Create directory if it doesn't exist
        if (!existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true })
        }

        // Generate unique filename
        const filename = generateFilename(file.name)
        const filePath = path.join(uploadDir, filename)

        await writeFile(filePath, buffer)

        // Generate public URL
        const url = `/uploads/${folder}/${filename}`

        return NextResponse.json({
            success: true,
            url,
            filename,
            size: file.size,
            type: file.type,
            width: dimensions?.width ?? null,
            height: dimensions?.height ?? null,
            purpose,
            dimensionStatus: dimensionResult?.status ?? null,
            dimensionMessage: dimensionResult?.reason ?? null,
        })

    } catch (error) {
        console.error('Upload error:', error)
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }
}

// Optional: DELETE endpoint to remove uploaded images
export async function DELETE(request: NextRequest) {
    try {
        const authResult = await requireRoleAPIWithMobile(request, 'ADMIN')
        if ('error' in authResult) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const { searchParams } = new URL(request.url)
        const url = searchParams.get('url')

        if (!url || !url.startsWith('/uploads/')) {
            return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
        }

        // SECURITY: Resolve and verify path stays inside uploads root
        const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads')
        const resolvedPath = path.resolve(process.cwd(), 'public', url)

        if (!resolvedPath.startsWith(uploadsRoot + path.sep)) {
            return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
        }

        // Use dynamic import for unlink
        const { unlink } = await import('fs/promises')
        await unlink(resolvedPath)


        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Delete error:', error)
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
}
