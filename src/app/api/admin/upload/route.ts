/**
 * Image Upload API
 * POST /api/admin/upload
 * 
 * Handles image uploads for products and categories
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

// Allowed file types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

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
        const type = formData.get('type') as string | null // 'product' or 'category'

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

        // Determine upload folder
        const folder = type === 'category' ? 'categories' : 'products'
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', folder)

        // Create directory if it doesn't exist
        if (!existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true })
        }

        // Generate unique filename
        const filename = generateFilename(file.name)
        const filePath = path.join(uploadDir, filename)

        // Convert file to buffer and save
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        await writeFile(filePath, buffer)

        // Generate public URL
        const url = `/uploads/${folder}/${filename}`

        return NextResponse.json({
            success: true,
            url,
            filename,
            size: file.size,
            type: file.type
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

        const filePath = path.join(process.cwd(), 'public', url)
        
        // Use dynamic import for unlink
        const { unlink } = await import('fs/promises')
        await unlink(filePath)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Delete error:', error)
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
}
