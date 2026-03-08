/**
 * Migration script: Encrypt existing beIN account passwords
 * 
 * USAGE:
 *   1. Set BEIN_ENCRYPTION_KEY in .env (64 hex chars = 32 bytes)
 *      Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   2. Run: npx tsx scripts/encrypt-bein-passwords.ts
 * 
 * SAFETY:
 *   - Backward-compatible: already-encrypted passwords (format iv:tag:ciphertext) are skipped
 *   - Dry run first: pass --dry-run flag to preview without changes
 *   - Creates a log of all changes
 */

import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const ENCODING = 'hex' as const

const isDryRun = process.argv.includes('--dry-run')

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

function isAlreadyEncrypted(value: string): boolean {
    // Encrypted format: iv:tag:ciphertext (3 hex segments)
    const parts = value.split(':')
    if (parts.length !== 3) return false
    return parts.every(p => /^[0-9a-f]+$/i.test(p))
}

function encryptSecret(plaintext: string): string {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    let encrypted = cipher.update(plaintext, 'utf8', ENCODING)
    encrypted += cipher.final(ENCODING)
    const tag = cipher.getAuthTag()
    return `${iv.toString(ENCODING)}:${tag.toString(ENCODING)}:${encrypted}`
}

async function main() {
    console.log(`\n🔐 beIN Password Encryption Migration`)
    console.log(`   Mode: ${isDryRun ? '🟡 DRY RUN (no changes)' : '🔴 LIVE'}`)
    console.log('')

    // Verify key is set
    getEncryptionKey()
    console.log('✅ BEIN_ENCRYPTION_KEY is valid\n')

    const prisma = new PrismaClient()

    try {
        const accounts = await prisma.beinAccount.findMany({
            select: { id: true, username: true, password: true }
        })

        console.log(`Found ${accounts.length} beIN accounts\n`)

        let encrypted = 0
        let skipped = 0

        for (const account of accounts) {
            if (isAlreadyEncrypted(account.password)) {
                console.log(`  ⏭️  ${account.username}: Already encrypted, skipping`)
                skipped++
                continue
            }

            const encryptedPassword = encryptSecret(account.password)

            if (!isDryRun) {
                await prisma.beinAccount.update({
                    where: { id: account.id },
                    data: { password: encryptedPassword }
                })
            }

            console.log(`  ✅ ${account.username}: ${isDryRun ? 'Would encrypt' : 'Encrypted'} (${account.password.length} → ${encryptedPassword.length} chars)`)
            encrypted++
        }

        console.log(`\n📊 Results:`)
        console.log(`   Encrypted: ${encrypted}`)
        console.log(`   Skipped:   ${skipped}`)
        console.log(`   Total:     ${accounts.length}`)

        if (isDryRun && encrypted > 0) {
            console.log(`\n⚠️  Run without --dry-run to apply changes`)
        }

    } finally {
        await prisma.$disconnect()
    }
}

main().catch(err => {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
})
