// Script to seed Pool settings for beIN Multi-Account System
// Run with: npx ts-node scripts/seed-pool-settings.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const poolSettings = [
    { key: 'pool_round_robin_enabled', value: 'true' },
    { key: 'pool_max_requests_per_account', value: '5' },
    { key: 'pool_rate_limit_window_seconds', value: '300' },
    { key: 'pool_cooldown_after_failures', value: '3' },
    { key: 'pool_cooldown_duration_seconds', value: '600' },
    { key: 'pool_min_delay_ms', value: '2000' },
    { key: 'pool_max_delay_ms', value: '5000' },
    { key: 'pool_random_delay_enabled', value: 'true' },
    { key: 'pool_max_consecutive_failures', value: '5' },
    { key: 'pool_auto_disable_on_error', value: 'true' },
]

async function seedPoolSettings() {
    console.log('🔧 Seeding Pool settings...')

    for (const setting of poolSettings) {
        await prisma.setting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: setting,
        })
        console.log(`  ✅ ${setting.key} = ${setting.value}`)
    }

    console.log('\n✅ Pool settings seeded successfully!')
}

async function migrateExistingAccount() {
    console.log('\n🔄 Checking for existing beIN account in settings...')

    const username = await prisma.setting.findUnique({ where: { key: 'bein_username' } })
    const password = await prisma.setting.findUnique({ where: { key: 'bein_password' } })
    const totpSecret = await prisma.setting.findUnique({ where: { key: 'bein_totp_secret' } })

    if (username?.value && password?.value) {
        // Check if already migrated
        const existing = await prisma.beinAccount.findUnique({
            where: { username: username.value }
        })

        if (existing) {
            console.log('  ⏭️ Account already exists in bein_accounts table')
            return
        }

        // Migrate existing account
        const account = await prisma.beinAccount.create({
            data: {
                username: username.value,
                password: password.value,
                totpSecret: totpSecret?.value || null,
                label: 'الحساب الأصلي',
                isActive: true,
                priority: 10, // High priority for original account
            }
        })

        console.log(`  ✅ Migrated existing account: ${account.username}`)
    } else {
        console.log('  ℹ️ No existing account found in settings')
    }
}

async function main() {
    try {
        await seedPoolSettings()
        await migrateExistingAccount()
    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

main()
