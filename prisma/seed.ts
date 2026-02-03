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

    // 2. Create Test User
    const userPassword = await bcrypt.hash('test123', 10)
    const testUser = await prisma.user.upsert({
        where: { username: 'user1' },
        update: {},
        create: {
            username: 'user1',
            email: 'user1@bein-panel.com',
            passwordHash: userPassword,
            role: 'USER',
            balance: 500,
            isActive: true,
            lowBalanceAlert: 50,
        },
    })
    console.log('✅ تم إنشاء User:', testUser.username)

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
        
        // Dealer Balance Alert (for beIN accounts)
        { key: 'min_dealer_balance_alert', value: '300' }, // USD threshold for low balance alerts
    ]

    for (const setting of defaultSettings) {
        await prisma.setting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: setting,
        })
    }
    console.log('✅ تم إنشاء', defaultSettings.length, 'إعداد')

    // 4. Create initial transaction for test user
    await prisma.transaction.upsert({
        where: { id: 'initial-deposit-user1' },
        update: {},
        create: {
            id: 'initial-deposit-user1',
            userId: testUser.id,
            adminId: admin.id,
            amount: 500,
            balanceAfter: 500,
            type: 'DEPOSIT',
            notes: 'رصيد افتتاحي للاختبار',
        },
    })
    console.log('✅ تم إنشاء معاملة الرصيد الافتتاحي')

    // =====================================================
    // ===== DESH STORE - Seed Data =====
    // =====================================================

    // 5. Create Product Categories
    const categories = [
        {
            id: 'cat-dishes',
            name: 'Dishes',
            nameAr: 'الصحون',
            description: 'Satellite dishes and accessories',
            descriptionAr: 'صحون الأقمار الصناعية وملحقاتها',
            sortOrder: 1,
        },
        {
            id: 'cat-receivers',
            name: 'Receivers',
            nameAr: 'الرسيفرات',
            description: 'beIN receivers and decoders',
            descriptionAr: 'رسيفرات وأجهزة فك التشفير',
            sortOrder: 2,
        },
        {
            id: 'cat-accessories',
            name: 'Accessories',
            nameAr: 'الإكسسوارات',
            description: 'Cables, LNBs, and other accessories',
            descriptionAr: 'الكابلات ووحدات LNB وملحقات أخرى',
            sortOrder: 3,
        },
    ]

    for (const cat of categories) {
        await prisma.productCategory.upsert({
            where: { id: cat.id },
            update: cat,
            create: cat,
        })
    }
    console.log('✅ تم إنشاء', categories.length, 'فئة منتجات')

    // 6. Create Subscription Packages
    const packages = [
        {
            id: 'pkg-1-month',
            name: '1 Month',
            nameAr: 'شهر واحد',
            description: 'beIN Sports subscription for 1 month',
            descriptionAr: 'اشتراك بي إن سبورتس لمدة شهر واحد',
            duration: 1,
            priceSAR: 150,
            priceEGP: 1200,
            features: ['All beIN Sports channels', 'HD Quality', 'Arabic commentary'],
            featuresAr: ['جميع قنوات بي إن سبورتس', 'جودة عالية HD', 'تعليق عربي'],
            sortOrder: 1,
        },
        {
            id: 'pkg-3-months',
            name: '3 Months',
            nameAr: '3 أشهر',
            description: 'beIN Sports subscription for 3 months',
            descriptionAr: 'اشتراك بي إن سبورتس لمدة 3 أشهر',
            duration: 3,
            priceSAR: 400,
            priceEGP: 3200,
            features: ['All beIN Sports channels', 'HD Quality', 'Arabic commentary', '10% savings'],
            featuresAr: ['جميع قنوات بي إن سبورتس', 'جودة عالية HD', 'تعليق عربي', 'توفير 10%'],
            sortOrder: 2,
        },
        {
            id: 'pkg-6-months',
            name: '6 Months',
            nameAr: '6 أشهر',
            description: 'beIN Sports subscription for 6 months',
            descriptionAr: 'اشتراك بي إن سبورتس لمدة 6 أشهر',
            duration: 6,
            priceSAR: 750,
            priceEGP: 6000,
            features: ['All beIN Sports channels', 'HD Quality', 'Arabic commentary', '15% savings'],
            featuresAr: ['جميع قنوات بي إن سبورتس', 'جودة عالية HD', 'تعليق عربي', 'توفير 15%'],
            sortOrder: 3,
            isPopular: true,
        },
        {
            id: 'pkg-12-months',
            name: '12 Months',
            nameAr: 'سنة كاملة',
            description: 'beIN Sports subscription for 1 year',
            descriptionAr: 'اشتراك بي إن سبورتس لمدة سنة كاملة',
            duration: 12,
            priceSAR: 1400,
            priceEGP: 11000,
            features: ['All beIN Sports channels', 'HD Quality', 'Arabic commentary', '20% savings', 'Best value'],
            featuresAr: ['جميع قنوات بي إن سبورتس', 'جودة عالية HD', 'تعليق عربي', 'توفير 20%', 'أفضل قيمة'],
            sortOrder: 4,
        },
    ]

    for (const pkg of packages) {
        await prisma.subscriptionPackage.upsert({
            where: { id: pkg.id },
            update: pkg,
            create: pkg,
        })
    }
    console.log('✅ تم إنشاء', packages.length, 'باقة اشتراك')

    // 7. Create Shipping Regions - Saudi Arabia
    const saudiCities = [
        { city: 'Riyadh', cityAr: 'الرياض', shippingCostSAR: 25, shippingCostEGP: 200, estimatedDays: 2 },
        { city: 'Jeddah', cityAr: 'جدة', shippingCostSAR: 30, shippingCostEGP: 240, estimatedDays: 3 },
        { city: 'Mecca', cityAr: 'مكة المكرمة', shippingCostSAR: 30, shippingCostEGP: 240, estimatedDays: 3 },
        { city: 'Medina', cityAr: 'المدينة المنورة', shippingCostSAR: 35, shippingCostEGP: 280, estimatedDays: 3 },
        { city: 'Dammam', cityAr: 'الدمام', shippingCostSAR: 30, shippingCostEGP: 240, estimatedDays: 3 },
        { city: 'Khobar', cityAr: 'الخبر', shippingCostSAR: 30, shippingCostEGP: 240, estimatedDays: 3 },
        { city: 'Dhahran', cityAr: 'الظهران', shippingCostSAR: 30, shippingCostEGP: 240, estimatedDays: 3 },
        { city: 'Tabuk', cityAr: 'تبوك', shippingCostSAR: 40, shippingCostEGP: 320, estimatedDays: 4 },
        { city: 'Abha', cityAr: 'أبها', shippingCostSAR: 40, shippingCostEGP: 320, estimatedDays: 4 },
        { city: 'Other SA Cities', cityAr: 'مدن سعودية أخرى', shippingCostSAR: 45, shippingCostEGP: 360, estimatedDays: 5 },
    ]

    for (const region of saudiCities) {
        await prisma.shippingRegion.upsert({
            where: { country_city: { country: 'SA', city: region.city } },
            update: region,
            create: {
                country: 'SA',
                countryName: 'Saudi Arabia',
                countryNameAr: 'المملكة العربية السعودية',
                ...region,
            },
        })
    }
    console.log('✅ تم إنشاء', saudiCities.length, 'منطقة شحن سعودية')

    // 8. Create Shipping Regions - Egypt
    const egyptCities = [
        { city: 'Cairo', cityAr: 'القاهرة', shippingCostSAR: 15, shippingCostEGP: 50, estimatedDays: 2 },
        { city: 'Giza', cityAr: 'الجيزة', shippingCostSAR: 15, shippingCostEGP: 50, estimatedDays: 2 },
        { city: 'Alexandria', cityAr: 'الإسكندرية', shippingCostSAR: 20, shippingCostEGP: 75, estimatedDays: 3 },
        { city: 'Sharm El Sheikh', cityAr: 'شرم الشيخ', shippingCostSAR: 25, shippingCostEGP: 100, estimatedDays: 4 },
        { city: 'Hurghada', cityAr: 'الغردقة', shippingCostSAR: 25, shippingCostEGP: 100, estimatedDays: 4 },
        { city: 'Luxor', cityAr: 'الأقصر', shippingCostSAR: 25, shippingCostEGP: 100, estimatedDays: 4 },
        { city: 'Aswan', cityAr: 'أسوان', shippingCostSAR: 30, shippingCostEGP: 120, estimatedDays: 5 },
        { city: 'Other EG Cities', cityAr: 'مدن مصرية أخرى', shippingCostSAR: 30, shippingCostEGP: 100, estimatedDays: 5 },
    ]

    for (const region of egyptCities) {
        await prisma.shippingRegion.upsert({
            where: { country_city: { country: 'EG', city: region.city } },
            update: region,
            create: {
                country: 'EG',
                countryName: 'Egypt',
                countryNameAr: 'مصر',
                ...region,
            },
        })
    }
    console.log('✅ تم إنشاء', egyptCities.length, 'منطقة شحن مصرية')

    // 9. Create Store Settings
    const storeSettings = [
        { key: 'store_enabled', value: 'true' },
        { key: 'store_name', value: 'Desh Store' },
        { key: 'store_name_ar', value: 'متجر دش' },
        { key: 'store_currency_sar_enabled', value: 'true' },
        { key: 'store_currency_egp_enabled', value: 'true' },
        { key: 'store_min_order_sar', value: '0' },
        { key: 'store_min_order_egp', value: '0' },
        { key: 'store_free_shipping_sar', value: '500' },
        { key: 'store_free_shipping_egp', value: '4000' },
        // Subscription Markup (percentage added to beIN prices)
        { key: 'store_markup_percentage', value: '20' },  // 20% markup
        // Stripe Keys (to be filled by admin)
        { key: 'stripe_public_key', value: '' },
        { key: 'stripe_secret_key', value: '' },
        { key: 'stripe_webhook_secret', value: '' },
        // Contact Info
        { key: 'store_contact_email', value: 'support@deshstore.com' },
        { key: 'store_contact_phone_sa', value: '+966500000000' },
        { key: 'store_contact_phone_eg', value: '+201000000000' },
    ]

    for (const setting of storeSettings) {
        await prisma.storeSetting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: setting,
        })
    }
    console.log('✅ تم إنشاء', storeSettings.length, 'إعداد للمتجر')

    // 10. Create Sample Products
    const sampleProducts = [
        {
            id: 'prod-dish-60cm',
            categoryId: 'cat-dishes',
            sku: 'DISH-60CM',
            name: 'Satellite Dish 60cm',
            nameAr: 'صحن قمر صناعي 60 سم',
            description: 'High quality 60cm satellite dish for beIN reception',
            descriptionAr: 'صحن قمر صناعي عالي الجودة 60 سم لاستقبال بي إن',
            priceSAR: 120,
            priceEGP: 950,
            stock: 50,
            images: [],
            isFeatured: true,
            sortOrder: 1,
        },
        {
            id: 'prod-dish-90cm',
            categoryId: 'cat-dishes',
            sku: 'DISH-90CM',
            name: 'Satellite Dish 90cm',
            nameAr: 'صحن قمر صناعي 90 سم',
            description: 'High quality 90cm satellite dish for beIN reception',
            descriptionAr: 'صحن قمر صناعي عالي الجودة 90 سم لاستقبال بي إن',
            priceSAR: 180,
            priceEGP: 1400,
            stock: 30,
            images: [],
            sortOrder: 2,
        },
        {
            id: 'prod-receiver-hd',
            categoryId: 'cat-receivers',
            sku: 'RECV-HD',
            name: 'beIN HD Receiver',
            nameAr: 'رسيفر بي إن HD',
            description: 'Official beIN Sports HD receiver',
            descriptionAr: 'رسيفر بي إن سبورتس الرسمي بجودة HD',
            priceSAR: 350,
            priceEGP: 2800,
            stock: 25,
            images: [],
            isFeatured: true,
            sortOrder: 1,
        },
        {
            id: 'prod-receiver-4k',
            categoryId: 'cat-receivers',
            sku: 'RECV-4K',
            name: 'beIN 4K Receiver',
            nameAr: 'رسيفر بي إن 4K',
            description: 'Official beIN Sports 4K Ultra HD receiver',
            descriptionAr: 'رسيفر بي إن سبورتس الرسمي بجودة 4K الفائقة',
            priceSAR: 550,
            priceEGP: 4400,
            stock: 15,
            images: [],
            isFeatured: true,
            sortOrder: 2,
        },
        {
            id: 'prod-lnb',
            categoryId: 'cat-accessories',
            sku: 'LNB-SINGLE',
            name: 'Single LNB',
            nameAr: 'وحدة LNB مفردة',
            description: 'High quality single LNB for satellite reception',
            descriptionAr: 'وحدة LNB عالية الجودة لاستقبال القمر الصناعي',
            priceSAR: 45,
            priceEGP: 350,
            stock: 100,
            images: [],
            sortOrder: 1,
        },
        {
            id: 'prod-cable-10m',
            categoryId: 'cat-accessories',
            sku: 'CABLE-10M',
            name: 'Coaxial Cable 10m',
            nameAr: 'كابل محوري 10 متر',
            description: 'High quality coaxial cable 10 meters',
            descriptionAr: 'كابل محوري عالي الجودة 10 أمتار',
            priceSAR: 35,
            priceEGP: 280,
            stock: 200,
            images: [],
            sortOrder: 2,
        },
    ]

    for (const product of sampleProducts) {
        await prisma.product.upsert({
            where: { id: product.id },
            update: product,
            create: product,
        })
    }
    console.log('✅ تم إنشاء', sampleProducts.length, 'منتج نموذجي')

    console.log('\n🎉 اكتملت عملية Seeding بنجاح!')
    console.log('\n📋 بيانات الدخول:')
    console.log('   Admin: admin / admin123')
    console.log('   User: user1 / test123 (balance: 500 USD)')
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
