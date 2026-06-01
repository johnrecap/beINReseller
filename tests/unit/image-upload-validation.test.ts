import test from 'node:test'
import assert from 'node:assert/strict'
import {
    detectSafeImage,
    extensionForDetectedImage,
    isAllowedUploadExtension,
    isSupportedUploadMime,
} from '@/lib/uploads/image-validation'

function pngBytes(width = 10, height = 11) {
    const buffer = Buffer.alloc(24)
    Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer, 0)
    buffer.writeUInt32BE(width, 16)
    buffer.writeUInt32BE(height, 20)
    return buffer
}

function gifBytes(width = 12, height = 13) {
    const buffer = Buffer.alloc(10)
    buffer.write('GIF89a', 0, 'ascii')
    buffer.writeUInt16LE(width, 6)
    buffer.writeUInt16LE(height, 8)
    return buffer
}

function jpegBytes(width = 14, height = 15) {
    return Buffer.from([
        0xff, 0xd8,
        0xff, 0xc0,
        0x00, 0x11,
        0x08,
        (height >> 8) & 0xff, height & 0xff,
        (width >> 8) & 0xff, width & 0xff,
        0x03, 0x01, 0x11, 0x00,
    ])
}

function webpBytes(width = 16, height = 17) {
    const buffer = Buffer.alloc(30)
    buffer.write('RIFF', 0, 'ascii')
    buffer.write('WEBP', 8, 'ascii')
    buffer.write('VP8X', 12, 'ascii')
    const storedWidth = width - 1
    const storedHeight = height - 1
    buffer[24] = storedWidth & 0xff
    buffer[25] = (storedWidth >> 8) & 0xff
    buffer[26] = (storedWidth >> 16) & 0xff
    buffer[27] = storedHeight & 0xff
    buffer[28] = (storedHeight >> 8) & 0xff
    buffer[29] = (storedHeight >> 16) & 0xff
    return buffer
}

test('detects supported image bytes and derives safe extensions', () => {
    const cases = [
        { buffer: pngBytes(), type: 'png', mime: 'image/png', ext: '.png' },
        { buffer: gifBytes(), type: 'gif', mime: 'image/gif', ext: '.gif' },
        { buffer: jpegBytes(), type: 'jpeg', mime: 'image/jpeg', ext: '.jpg' },
        { buffer: webpBytes(), type: 'webp', mime: 'image/webp', ext: '.webp' },
    ] as const

    for (const item of cases) {
        const detected = detectSafeImage(item.buffer)
        assert.equal(detected?.type, item.type)
        assert.equal(detected?.mimeType, item.mime)
        assert.equal(extensionForDetectedImage(detected), item.ext)
        assert.equal(detected?.width > 0, true)
        assert.equal(detected?.height > 0, true)
    }
})

test('rejects svg and unknown image bytes', () => {
    assert.equal(detectSafeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null)
    assert.equal(detectSafeImage(Buffer.from('<html>not an image</html>')), null)
    assert.equal(detectSafeImage(Buffer.from([0x00, 0x01, 0x02, 0x03])), null)
})

test('rejects mismatched claimed mime type and unsupported extensions', () => {
    assert.equal(isSupportedUploadMime('image/png', detectSafeImage(pngBytes())), true)
    assert.equal(isSupportedUploadMime('image/jpeg', detectSafeImage(pngBytes())), false)
    assert.equal(isSupportedUploadMime('image/svg+xml', null), false)

    assert.equal(isAllowedUploadExtension('photo.png'), true)
    assert.equal(isAllowedUploadExtension('photo.jpeg'), true)
    assert.equal(isAllowedUploadExtension('photo.webp'), true)
    assert.equal(isAllowedUploadExtension('photo.gif'), true)
    assert.equal(isAllowedUploadExtension('photo.svg'), false)
    assert.equal(isAllowedUploadExtension('photo.txt'), false)
})
