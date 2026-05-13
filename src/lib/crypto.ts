import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const ENCODING = 'hex' as const
const ENCRYPTED_PREFIX = 'enc:v1:'

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

    return `${ENCRYPTED_PREFIX}${iv.toString(ENCODING)}:${tag.toString(ENCODING)}:${encrypted}`
}

/**
 * Decrypt a secret string encrypted with encryptSecret()
 * Legacy iv:tag:ciphertext values are still supported for existing passwords.
 * Plaintext fallback is a bounded transition path for pre-backfill data only.
 */
export function decryptSecret(encrypted: string): string {
    if (encrypted.startsWith(ENCRYPTED_PREFIX)) {
        return decryptPayload(encrypted.slice(ENCRYPTED_PREFIX.length))
    }

    if (isLegacyEncryptedSecret(encrypted)) {
        return decryptPayload(encrypted)
    }

    if (process.env.BEIN_ALLOW_PLAINTEXT_CREDENTIALS === 'true') {
        return encrypted
    }

    throw new Error(
        'Plaintext beIN credential found. Run scripts/backfill-credential-encryption.ts, '
        + 'then keep BEIN_ALLOW_PLAINTEXT_CREDENTIALS unset.'
    )
}

export function isEncryptedSecret(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX) || isLegacyEncryptedSecret(value)
}

function isLegacyEncryptedSecret(value: string): boolean {
    const parts = value.split(':')
    if (parts.length !== 3) return false
    const [ivHex, tagHex, ciphertext] = parts
    return ivHex.length === 32 &&
        tagHex.length === 32 &&
        ciphertext.length > 0 &&
        parts.every(part => /^[0-9a-f]+$/i.test(part))
}

function decryptPayload(payload: string): string {
    const key = getEncryptionKey()
    const [ivHex, tagHex, ciphertext] = payload.split(':')

    const iv = Buffer.from(ivHex, ENCODING)
    const tag = Buffer.from(tagHex, ENCODING)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    let decrypted = decipher.update(ciphertext, ENCODING, 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
}
