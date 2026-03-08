import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const ENCODING = 'hex' as const

function getEncryptionKey(): Buffer {
    const key = process.env.BEIN_ENCRYPTION_KEY
    if (!key || key.length !== 64) {
        throw new Error(
            'BEIN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). '
            + "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        )
    }
    return Buffer.from(key, 'hex')
}

/**
 * Encrypt a secret string using AES-256-GCM
 * Output format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encryptSecret(plaintext: string): string {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(plaintext, 'utf8', ENCODING)
    encrypted += cipher.final(ENCODING)
    const tag = cipher.getAuthTag()

    return `${iv.toString(ENCODING)}:${tag.toString(ENCODING)}:${encrypted}`
}

/**
 * Decrypt a secret string encrypted with encryptSecret()
 * Backward-compatible: returns plain text as-is if not in encrypted format
 */
export function decryptSecret(encrypted: string): string {
    // Backward-compatible: if not in iv:tag:ciphertext format, return as-is
    if (!encrypted.includes(':') || encrypted.split(':').length !== 3) {
        return encrypted
    }

    const key = getEncryptionKey()
    const [ivHex, tagHex, ciphertext] = encrypted.split(':')

    const iv = Buffer.from(ivHex, ENCODING)
    const tag = Buffer.from(tagHex, ENCODING)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    let decrypted = decipher.update(ciphertext, ENCODING, 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
}
