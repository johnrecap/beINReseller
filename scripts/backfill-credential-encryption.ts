/**
 * Backfill encrypted beIN credentials.
 *
 * Usage:
 *   npx tsx scripts/backfill-credential-encryption.ts --dry-run
 *   npx tsx scripts/backfill-credential-encryption.ts
 *
 * Requires:
 *   BEIN_ENCRYPTION_KEY: 64 hex chars.
 *
 * After a successful live run, keep BEIN_ALLOW_PLAINTEXT_CREDENTIALS unset
 * so plaintext credentials fail closed.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import 'dotenv/config'
import { encryptSecret, isEncryptedSecret } from '../src/lib/crypto'

const isDryRun = process.argv.includes('--dry-run')

function shouldEncrypt(value: string | null): value is string {
    return !!value && !isEncryptedSecret(value)
}

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    let accountTotpEncrypted = 0
    let proxyPasswordsEncrypted = 0
    let skippedAccounts = 0
    let skippedProxies = 0

    try {
        const accounts = await prisma.beinAccount.findMany({
            select: { id: true, username: true, totpSecret: true }
        })

        for (const account of accounts) {
            if (!shouldEncrypt(account.totpSecret)) {
                skippedAccounts++
                continue
            }

            if (!isDryRun) {
                await prisma.beinAccount.update({
                    where: { id: account.id },
                    data: { totpSecret: encryptSecret(account.totpSecret) }
                })
            }

            accountTotpEncrypted++
            console.log(`${account.username}: ${isDryRun ? 'would encrypt' : 'encrypted'} TOTP secret`)
        }

        const proxies = await prisma.proxy.findMany({
            select: { id: true, label: true, password: true }
        })

        for (const proxy of proxies) {
            if (!shouldEncrypt(proxy.password)) {
                skippedProxies++
                continue
            }

            if (!isDryRun) {
                await prisma.proxy.update({
                    where: { id: proxy.id },
                    data: { password: encryptSecret(proxy.password) }
                })
            }

            proxyPasswordsEncrypted++
            console.log(`${proxy.label}: ${isDryRun ? 'would encrypt' : 'encrypted'} proxy password`)
        }

        console.log('')
        console.log(`Mode: ${isDryRun ? 'dry-run' : 'live'}`)
        console.log(`beIN TOTP secrets encrypted: ${accountTotpEncrypted}`)
        console.log(`Proxy passwords encrypted: ${proxyPasswordsEncrypted}`)
        console.log(`beIN accounts skipped: ${skippedAccounts}`)
        console.log(`Proxies skipped: ${skippedProxies}`)
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main().catch(error => {
    console.error('Credential encryption backfill failed:', error)
    process.exit(1)
})
