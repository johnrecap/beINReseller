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
import {
    detectSafeImage,
    extensionForDetectedImage,
    isSupportedUploadMime,
} from '@/lib/uploads/image-validation'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function parseAnnouncementPurpose(value: FormDataEntryValue | null): AnnouncementImagePurpose | null {
    if (typeof value !== 'string') return null
    return ANNOUNCEMENT_IMAGE_PURPOSES.includes(value as AnnouncementImagePurpose)
        ? value as AnnouncementImagePurpose
        : null
}

// Generate unique filename
function generateFilename(extension: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `${timestamp}-${random}${extension}`
}

async function writeUniqueUploadFile(uploadDir: string, buffer: Buffer, extension: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
        const filename = generateFilename(extension)
        const filePath = path.join(uploadDir, filename)

        try {
            await writeFile(filePath, buffer, { flag: 'wx' })
            return filename
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
                continue
            }

            throw error
        }
    }

    throw new Error('Could not allocate upload filename')
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

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({
                error: 'File too large. Maximum size: 5MB'
            }, { status: 400 })
        }

        // Convert file to buffer once so validation and save use the same bytes
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const detectedImage = detectSafeImage(buffer)
        if (!isSupportedUploadMime(file.type, detectedImage)) {
            return NextResponse.json({
                error: 'Invalid file type. Allowed: JPG, PNG, WebP, GIF'
            }, { status: 400 })
        }

        const dimensionResult =
            type === 'announcement' && purpose && detectedImage
                ? validateAnnouncementImageDimensions(purpose, detectedImage.width, detectedImage.height)
                : null

        if (dimensionResult?.status === 'rejected') {
            return NextResponse.json({
                error: dimensionResult.reason,
                width: detectedImage?.width,
                height: detectedImage?.height,
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

        const filename = await writeUniqueUploadFile(
            uploadDir,
            buffer,
            extensionForDetectedImage(detectedImage)
        )

        // Generate public URL
        const url = `/uploads/${folder}/${filename}`

        return NextResponse.json({
            success: true,
            url,
            filename,
            size: file.size,
            type: detectedImage?.mimeType ?? file.type,
            width: detectedImage?.width ?? null,
            height: detectedImage?.height ?? null,
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
