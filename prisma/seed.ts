import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import bcrypt from 'bcryptjs'

// Prisma 7 requires adapter
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
    console.log('🌱 بدء عملية Seeding...')

    // 1. Create Admin User
    const adminPassword = await bcrypt.hash('admin123', 10)
    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            email: 'admin@bein-panel.com',
            passwordHash: adminPassword,
            role: 'ADMIN',
            balance: 0,
            isActive: true,
            lowBalanceAlert: 0,
        },
    })
    console.log('✅ تم إنشاء Admin:', admin.username)

    // 2. Create Test Reseller
    const resellerPassword = await bcrypt.hash('test123', 10)
    const reseller = await prisma.user.upsert({
        where: { username: 'reseller1' },
        update: {},
        create: {
            username: 'reseller1',
            email: 'reseller1@bein-panel.com',
            passwordHash: resellerPassword,
            role: 'RESELLER',
            balance: 500,
            isActive: true,
            lowBalanceAlert: 50,
        },
    })
    console.log('✅ تم إنشاء Reseller:', reseller.username)

    // 3. Create Default Settings
    const defaultSettings = [
        // System
        { key: 'maintenance_mode', value: 'false' },
        { key: 'maintenance_message', value: 'النظام تحت الصيانة، يرجى المحاولة لاحقاً' },
        { key: 'notification_message', value: '' },

        // Prices - Renew
        { key: 'renew_1_month_price', value: '100' },
        { key: 'renew_3_months_price', value: '280' },
        { key: 'renew_6_months_price', value: '520' },
        { key: 'renew_12_months_price', value: '1000' },

        // Prices - Services
        { key: 'check_balance_price', value: '5' },
        { key: 'signal_refresh_price', value: '10' },

        // Worker Config
        { key: 'max_retries', value: '3' },
        { key: 'low_balance_default', value: '50' },

        // beIN Login URLs
        { key: 'bein_login_url', value: 'https://manage.bein.com' },
        { key: 'bein_renew_url', value: '' },
        { key: 'bein_check_url', value: '' },
        { key: 'bein_signal_url', value: '' },

        // Selectors (can be updated by admin)
        { key: 'bein_selector_username', value: 'input[name="username"]' },
        { key: 'bein_selector_password', value: 'input[name="password"]' },
        { key: 'bein_selector_2fa', value: 'input[name="2fa"]' },
        { key: 'bein_selector_captcha_image', value: 'img.captcha' },
        { key: 'bein_selector_captcha_input', value: 'input[name="captcha"]' },
        { key: 'bein_selector_submit', value: 'button[type="submit"]' },

        // API Keys (to be filled by admin)
        { key: 'captcha_2captcha_key', value: '' },
        { key: 'bein_totp_secret', value: '' },

        // Captcha Configuration
        { key: 'captcha_mode', value: 'manual' }, // 'manual' or 'auto'
        { key: 'captcha_timeout', value: '120' }, // seconds
    ]

    for (const setting of defaultSettings) {
        await prisma.setting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: setting,
        })
    }
    console.log('✅ تم إنشاء', defaultSettings.length, 'إعداد')

    // 4. Create initial transaction for reseller
    await prisma.transaction.upsert({
        where: { id: 'initial-deposit-reseller1' },
        update: {},
        create: {
            id: 'initial-deposit-reseller1',
            userId: reseller.id,
            adminId: admin.id,
            amount: 500,
            balanceAfter: 500,
            type: 'DEPOSIT',
            notes: 'رصيد افتتاحي للاختبار',
        },
    })
    console.log('✅ تم إنشاء معاملة الرصيد الافتتاحي')

    console.log('\n🎉 اكتملت عملية Seeding بنجاح!')
    console.log('\n📋 بيانات الدخول:')
    console.log('   Admin: admin / admin123')
    console.log('   Reseller: reseller1 / test123 (رصيد: 500 ريال)')
}

main()
    .catch((e) => {
        console.error('❌ خطأ في Seeding:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
        await pool.end()
    })
