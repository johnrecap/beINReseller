export type DetectedImageType = 'jpeg' | 'png' | 'webp' | 'gif'

export interface DetectedImage {
    type: DetectedImageType
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
    width: number
    height: number
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

function readUInt24LE(buffer: Buffer, offset: number): number {
    return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}

function hasSvgSignature(buffer: Buffer): boolean {
    const prefix = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart().toLowerCase()
    return prefix.startsWith('<svg') || prefix.includes('<svg ')
}

function validDimensions(width: number, height: number): boolean {
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
}

function detectPng(buffer: Buffer): DetectedImage | null {
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
        return null
    }

    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    return validDimensions(width, height)
        ? { type: 'png', mimeType: 'image/png', width, height }
        : null
}

function detectGif(buffer: Buffer): DetectedImage | null {
    if (buffer.length < 10) return null

    const signature = buffer.toString('ascii', 0, 6)
    if (signature !== 'GIF87a' && signature !== 'GIF89a') {
        return null
    }

    const width = buffer.readUInt16LE(6)
    const height = buffer.readUInt16LE(8)
    return validDimensions(width, height)
        ? { type: 'gif', mimeType: 'image/gif', width, height }
        : null
}

function detectJpeg(buffer: Buffer): DetectedImage | null {
    if (buffer.length <= 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        return null
    }

    let offset = 2
    while (offset + 8 < buffer.length) {
        if (buffer[offset] !== 0xff) return null

        const marker = buffer[offset + 1]
        const length = buffer.readUInt16BE(offset + 2)
        if (length < 2) {
            return null
        }

        if (marker >= 0xc0 && marker <= 0xc3) {
            if (offset + 9 > buffer.length) {
                return null
            }

            const height = buffer.readUInt16BE(offset + 5)
            const width = buffer.readUInt16BE(offset + 7)
            return validDimensions(width, height)
                ? { type: 'jpeg', mimeType: 'image/jpeg', width, height }
                : null
        }

        if (offset + 2 + length > buffer.length + 2) {
            return null
        }

        offset += 2 + length
    }

    return null
}

function detectWebp(buffer: Buffer): DetectedImage | null {
    if (
        buffer.length < 30 ||
        buffer.toString('ascii', 0, 4) !== 'RIFF' ||
        buffer.toString('ascii', 8, 12) !== 'WEBP'
    ) {
        return null
    }

    const format = buffer.toString('ascii', 12, 16)
    if (format === 'VP8X') {
        const width = readUInt24LE(buffer, 24) + 1
        const height = readUInt24LE(buffer, 27) + 1
        return validDimensions(width, height)
            ? { type: 'webp', mimeType: 'image/webp', width, height }
            : null
    }

    if (format === 'VP8 ' && buffer.length >= 30) {
        const width = buffer.readUInt16LE(26) & 0x3fff
        const height = buffer.readUInt16LE(28) & 0x3fff
        return validDimensions(width, height)
            ? { type: 'webp', mimeType: 'image/webp', width, height }
            : null
    }

    if (format === 'VP8L' && buffer.length >= 25) {
        const bits = buffer.readUInt32LE(21)
        const width = (bits & 0x3fff) + 1
        const height = ((bits >> 14) & 0x3fff) + 1
        return validDimensions(width, height)
            ? { type: 'webp', mimeType: 'image/webp', width, height }
            : null
    }

    return null
}

export function detectSafeImage(buffer: Buffer): DetectedImage | null {
    if (hasSvgSignature(buffer)) {
        return null
    }

    return detectPng(buffer)
        || detectGif(buffer)
        || detectJpeg(buffer)
        || detectWebp(buffer)
}

export function extensionForDetectedImage(detected: DetectedImage | null): string {
    if (!detected) return ''
    if (detected.type === 'jpeg') return '.jpg'
    return `.${detected.type}`
}

export function isSupportedUploadMime(claimedMime: string, detected: DetectedImage | null): boolean {
    if (!detected) return false
    if (claimedMime === 'image/jpg' && detected.mimeType === 'image/jpeg') return true
    return claimedMime === detected.mimeType
}

export function isAllowedUploadExtension(filename: string): boolean {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    return ALLOWED_EXTENSIONS.has(ext)
}

export function contentTypeForUploadPath(filename: string): string | null {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
    if (ext === '.png') return 'image/png'
    if (ext === '.webp') return 'image/webp'
    if (ext === '.gif') return 'image/gif'
    return null
}
