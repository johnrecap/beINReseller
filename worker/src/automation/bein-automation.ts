/**
 * beIN Automation - Core Playwright-based automation class
 * 
 * Handles all interactions with the beIN management portal:
 * - Multi-account support with per-account sessions
 * - Login with 2FA (TOTP) and CAPTCHA solving
 * - Card renewal
 * - Balance checking
 * - Signal refresh
 * 
 * All settings are loaded from the database dynamically.
 */

import { Browser, Page, chromium, BrowserContext } from 'playwright'
import { prisma } from '../lib/prisma'
import { TOTPGenerator } from '../utils/totp-generator'
import { CaptchaSolver } from '../utils/captcha-solver'
import { SessionManager } from '../utils/session-manager'
import { BeinAccount } from '../pool/types'

interface BeINConfig {
    // Captcha
    captchaApiKey: string
    captchaEnabled: boolean

    // URLs
    loginUrl: string
    renewUrl: string
    checkUrl: string
    signalUrl: string

    // Selectors - Login
    selUsername: string
    selPassword: string
    sel2fa: string
    selCaptchaImg: string
    selCaptchaInput: string
    selSubmit: string

    // Selectors - Renew
    selCardInput: string
    selDuration: string
    selRenewSubmit: string
    selSuccessMsg: string
    selErrorMsg: string

    // Selectors - Check
    selCheckCard: string
    selCheckSubmit: string
    selBalanceResult: string

    // Advanced
    sessionTimeout: number
    maxRetries: number
    headless: boolean
}

interface AccountSession {
    context: BrowserContext
    page: Page
    lastLoginTime: Date | null
    stbNumber?: string  // STB number extracted from Check page
}

export class BeINAutomation {
    private browser: Browser | null = null
    private browserLaunching: Promise<Browser> | null = null
    private lastBrowserActivity: number = 0
    private idleTimeoutMs: number = 300000 // 5 min default

    private totp: TOTPGenerator
    private captcha!: CaptchaSolver
    private session: SessionManager
    private config!: BeINConfig

    // Multi-account session management
    private accountSessions: Map<string, AccountSession> = new Map()

    constructor() {
        this.totp = new TOTPGenerator()
        this.session = new SessionManager()
    }

    /**
     * Load configuration from database (URLs, selectors, etc.)
     */
    private async loadConfig(): Promise<void> {
        const settings = await prisma.setting.findMany({
            where: {
                key: { startsWith: 'bein_' }
            }
        })

        const captchaSettings = await prisma.setting.findMany({
            where: {
                key: { startsWith: 'captcha_' }
            }
        })

        const workerSettings = await prisma.setting.findMany({
            where: {
                key: { startsWith: 'worker_' }
            }
        })

        const all = [...settings, ...captchaSettings, ...workerSettings]
        const get = (key: string, fallback: string = ''): string => {
            const setting = all.find(s => s.key === key)
            return setting?.value || fallback
        }

        this.config = {
            captchaApiKey: get('captcha_2captcha_key'),
            captchaEnabled: get('captcha_enabled', 'true') === 'true',

            loginUrl: get('bein_login_url', 'https://sbs.beinsports.net/Dealers/NLogin.aspx'),
            renewUrl: get('bein_renew_url', '/Dealers/Pages/frmSellPackages.aspx'),
            checkUrl: get('bein_check_url', '/Dealers/Pages/frmCheck.aspx'),
            signalUrl: get('bein_signal_url', '/RefreshSignal'),

            selUsername: get('bein_sel_username', '#Login1_UserName'),
            selPassword: get('bein_sel_password', '#Login1_Password'),
            sel2fa: get('bein_sel_2fa', 'input[placeholder="Enter 2FA"]'),
            selCaptchaImg: get('bein_sel_captcha_img', 'img[src*="captcha"]'),
            selCaptchaInput: get('bein_sel_captcha_input', 'input[name="captcha"]'),
            selSubmit: get('bein_sel_submit', 'input[value="Sign In"]'),

            selCardInput: get('bein_sel_card_input', '#CardNumber'),
            selDuration: get('bein_sel_duration', '#Duration'),
            selRenewSubmit: get('bein_sel_renew_submit', '#btnRenew'),
            selSuccessMsg: get('bein_sel_success_msg', '.alert-success'),
            selErrorMsg: get('bein_sel_error_msg', '.alert-danger'),

            selCheckCard: get('bein_sel_check_card', '#CardNumber'),
            selCheckSubmit: get('bein_sel_check_submit', '#btnCheck'),
            selBalanceResult: get('bein_sel_balance_result', '.balance-info'),

            sessionTimeout: parseInt(get('worker_session_timeout', '25')),
            maxRetries: parseInt(get('worker_max_retries', '3')),
            headless: get('worker_headless', 'true') === 'true',
        }

        // Initialize captcha solver with API key
        this.captcha = new CaptchaSolver(this.config.captchaApiKey)

        console.log('📋 Configuration loaded from database')
        console.log('🔧 Login Selectors:', {
            username: this.config.selUsername,
            password: this.config.selPassword,
            submit: this.config.selSubmit,
            loginUrl: this.config.loginUrl
        })
    }

    async initialize(): Promise<void> {
        // Load config first
        await this.loadConfig()

        // Load idle timeout from config (sessionTimeout is in minutes)
        this.idleTimeoutMs = (this.config.sessionTimeout || 5) * 60 * 1000

        // Browser NOT launched here - lazy loaded on first use
        console.log('🌐 Automation ready (browser will launch on demand)')
    }

    /**
     * Lazily launch browser on first use
     */
    private async ensureBrowser(): Promise<Browser> {
        // Return existing browser if available
        if (this.browser) {
            this.lastBrowserActivity = Date.now()
            return this.browser
        }

        // Avoid multiple simultaneous launches
        if (this.browserLaunching) {
            return this.browserLaunching
        }

        console.log('🚀 Launching browser on demand...')
        this.browserLaunching = chromium.launch({
            headless: this.config.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ]
        })

        this.browser = await this.browserLaunching
        this.browserLaunching = null
        this.lastBrowserActivity = Date.now()

        console.log('🌐 Browser launched on demand')
        return this.browser
    }

    /**
     * Get or create a session for a specific account
     */
    private async getOrCreateAccountSession(account: BeinAccount): Promise<AccountSession> {
        // Check if we already have a session for this account
        const existing = this.accountSessions.get(account.id)
        if (existing && this.isSessionValidForAccount(account.id)) {
            this.lastBrowserActivity = Date.now()
            return existing
        }

        // Ensure browser is launched (lazy loading)
        const browser = await this.ensureBrowser()

        // Try to load saved session from database
        const savedSession = await this.session.loadSessionForAccount(account.id)

        let context: BrowserContext
        let lastLoginTime: Date | null = null

        if (savedSession) {
            context = await browser.newContext({
                storageState: savedSession.storageState
            })
            lastLoginTime = new Date(savedSession.createdAt)
            console.log(`📦 Restored session for account ${account.label || account.username}`)
        } else {
            context = await browser.newContext()
        }

        const page = await context.newPage()
        page.setDefaultTimeout(30000)
        page.setDefaultNavigationTimeout(60000)

        const session: AccountSession = { context, page, lastLoginTime }
        this.accountSessions.set(account.id, session)

        return session
    }

    /**
     * Ensure login for a specific account (Multi-Account)
     */
    async ensureLoginWithAccount(account: BeinAccount): Promise<{ requiresCaptcha?: boolean; captchaImage?: string }> {
        const session = await this.getOrCreateAccountSession(account)
        const { page, context } = session

        // Check if session is still valid
        if (this.isSessionValidForAccount(account.id)) {
            console.log(`✅ Session still valid for ${account.label || account.username}, skipping login`)
            return {}
        }

        console.log(`🔐 Starting login for account: ${account.label || account.username}`)

        try {
            // Navigate to login page with timeout
            await page.goto(this.config.loginUrl, { timeout: 30000 })
            await page.waitForLoadState('networkidle', { timeout: 30000 })
            // Wait for page to fully load (beIN pages need 5-10 seconds)
            await page.waitForTimeout(7000)
        } catch (navError: any) {
            console.error(`❌ Navigation to login page failed: ${navError.message}`)
            throw new Error('فشل الاتصال بموقع beIN - تحقق من الاتصال بالإنترنت')
        }

        try {
            // Fill credentials from account (not from settings)
            await page.fill(this.config.selUsername, account.username)
            await page.fill(this.config.selPassword, account.password)
        } catch (fillError: any) {
            console.error(`❌ Failed to fill credentials: ${fillError.message}`)
            throw new Error('فشل إدخال بيانات الحساب - تحقق من إعدادات beIN')
        }

        // Check for CAPTCHA FIRST - if found, we'll enter 2FA AFTER captcha solution
        // This prevents the 2FA code from expiring while waiting for CAPTCHA
        try {
            const captchaElement = await page.$(this.config.selCaptchaImg)
            if (captchaElement) {
                const captchaBuffer = await captchaElement.screenshot()
                const captchaBase64 = captchaBuffer.toString('base64')

                // DON'T enter 2FA now - will be entered fresh after CAPTCHA solution
                console.log('🧩 CAPTCHA found, skipping 2FA entry for now...')
                console.log('🧩 CAPTCHA will be solved manually, then 2FA will be generated fresh')
                return {
                    requiresCaptcha: true,
                    captchaImage: captchaBase64
                }
            }
        } catch (e) {
            console.log('ℹ️ No CAPTCHA found, continuing with 2FA...')
        }

        // Handle 2FA (TOTP) - only if NO CAPTCHA was found
        if (account.totpSecret) {
            try {
                const totpCode = this.totp.generate(account.totpSecret)
                console.log(`🔢 Generated 2FA code: ${totpCode} (from secret: ${account.totpSecret.substring(0, 6)}...)`)
                console.log(`🔢 Time remaining: ${this.totp.getTimeRemaining()}s`)

                // Try to find the 2FA field
                const faField = await page.$(this.config.sel2fa)
                if (faField) {
                    await page.fill(this.config.sel2fa, totpCode)
                    console.log(`🔢 2FA code entered in field: ${this.config.sel2fa}`)
                } else {
                    console.log(`⚠️ 2FA field not found with selector: ${this.config.sel2fa}`)
                    // Try alternative selectors
                    const altSelectors = ['#Login1_txt2FaCode', '#txt2FaCode', 'input[id*="2Fa"]', 'input[name*="2fa"]']
                    for (const sel of altSelectors) {
                        const altField = await page.$(sel)
                        if (altField) {
                            await page.fill(sel, totpCode)
                            console.log(`🔢 2FA code entered in alternative field: ${sel}`)
                            break
                        }
                    }
                }
            } catch (e: any) {
                console.log(`ℹ️ 2FA handling: ${e.message}`)
            }
        }

        // Submit form
        try {
            await page.click(this.config.selSubmit)
            // Wait 10 seconds after login button click for page to process
            await page.waitForTimeout(10000)
            await page.waitForLoadState('networkidle', { timeout: 30000 })
        } catch (submitError: any) {
            console.error(`❌ Form submission failed: ${submitError.message}`)
            throw new Error('فشل تسجيل الدخول - حاول مرة أخرى')
        }

        // Verify login success
        const currentUrl = page.url()
        const pageTitle = await page.title()
        console.log(`🔍 After login - URL: ${currentUrl}`)
        console.log(`🔍 After login - Title: ${pageTitle}`)

        // Check for login page indicators (means login failed)
        const loginIndicators = await page.$('#Login1_UserName, #Login1_LoginButton, input[id*="Login"]')
        if (loginIndicators) {
            console.log('❌ Login failed - still on login page!')
            throw new Error('فشل تسجيل الدخول - تحقق من بيانات الحساب')
        }

        if (currentUrl.toLowerCase().includes('login') || currentUrl.toLowerCase().includes('error')) {
            console.log('❌ Login failed - URL contains login/error')
            throw new Error('فشل تسجيل الدخول - تحقق من بيانات الحساب')
        }

        // Save session
        const storageState = await context.storageState()
        console.log(`💾 Saving session with ${storageState.cookies?.length || 0} cookies`)
        await this.session.saveSessionForAccount(account.id, storageState)

        // Update session last login time
        session.lastLoginTime = new Date()

        console.log(`✅ Login successful for ${account.label || account.username}`)
        return {}
    }

    /**
     * Complete CAPTCHA for a specific account
     * @param totpSecret - Optional TOTP secret to regenerate 2FA code (since original may have expired)
     */
    async completeCaptchaForAccount(accountId: string, solution: string, totpSecret?: string): Promise<void> {
        const session = this.accountSessions.get(accountId)
        if (!session) throw new Error(`No session found for account ${accountId}`)

        const { page, context } = session

        try {
            await page.fill(this.config.selCaptchaInput, solution)
            console.log('🧩 Manual CAPTCHA solution entered')

            // Generate fresh 2FA code and enter it
            // Since we didn't enter 2FA before CAPTCHA, this is the first and only time
            if (totpSecret) {
                // Wait a moment for the page to be ready
                await page.waitForTimeout(500)

                // Generate fresh 2FA code
                const freshTotpCode = this.totp.generate(totpSecret)
                const timeRemaining = this.totp.getTimeRemaining()
                console.log(`🔢 Generated 2FA code: ${freshTotpCode} (time remaining: ${timeRemaining}s)`)

                // Enter the 2FA code
                const faField = await page.$(this.config.sel2fa)
                if (faField) {
                    await page.fill(this.config.sel2fa, freshTotpCode)
                    console.log(`🔢 2FA code entered in field: ${this.config.sel2fa}`)
                } else {
                    // Try alternative selectors
                    const altSelectors = ['#Login1_txt2FaCode', '#txt2FaCode', 'input[id*="2Fa"]', 'input[name*="2fa"]']
                    for (const sel of altSelectors) {
                        const altField = await page.$(sel)
                        if (altField) {
                            await page.fill(sel, freshTotpCode)
                            console.log(`🔢 2FA code entered in alternative field: ${sel}`)
                            break
                        }
                    }
                }
            }

            // Submit form
            await page.click(this.config.selSubmit)

            // Wait for page to process - beIN can be slow
            console.log('⏳ Waiting for login to complete...')
            await page.waitForTimeout(10000)

            // Try to wait for page load, but don't fail if it times out
            try {
                await page.waitForLoadState('load', { timeout: 30000 })
                console.log('✅ Page loaded')
            } catch {
                console.log('⚠️ Page load timeout - continuing anyway')
            }

            // Wait for URL to change (if there's a redirect)
            try {
                await page.waitForURL(/^(?!.*NLogin).*$/i, { timeout: 15000 })
                console.log('✅ URL changed - login successful!')
            } catch {
                // URL didn't change, check if still on login page
                console.log('⚠️ URL did not change within timeout')
            }

            // === DEBUG: Check what happened after login ===
            const currentUrl = page.url()
            const pageTitle = await page.title()
            console.log(`🔍 After CAPTCHA login - URL: ${currentUrl}`)
            console.log(`🔍 After CAPTCHA login - Title: ${pageTitle}`)

            // Check for error messages on the page FIRST
            const errorMsg = await page.$('.error, .alert-danger, .validation-error, span[style*="color:Red"], span[style*="color: Red"]')
            if (errorMsg) {
                const errorText = await errorMsg.textContent()
                console.log(`❌ Error message on page: ${errorText}`)
            }

            // Check for login page indicators
            const loginIndicators = await page.$('#Login1_UserName, #Login1_LoginButton')
            if (loginIndicators) {
                console.log('❌ Still on login page after CAPTCHA!')

                // Try to get more info about why login failed
                const errorSpan = await page.$('span[id*="Error"], span[style*="Red"]')
                if (errorSpan) {
                    const spanText = await errorSpan.textContent()
                    console.log(`❌ Login error: ${spanText}`)
                    throw new Error(`Login failed: ${spanText}`)
                }

                throw new Error('CAPTCHA incorrect or login failed')
            }

            if (currentUrl.toLowerCase().includes('nlogin') || currentUrl.toLowerCase().includes('error')) {
                throw new Error('Login failed after CAPTCHA - check solution')
            }

            // Save session
            const storageState = await context.storageState()
            const cookieCount = storageState.cookies?.length || 0
            console.log(`💾 Saving session with ${cookieCount} cookies`)

            // Log cookies for debugging
            if (storageState.cookies && storageState.cookies.length > 0) {
                console.log(`🍪 Cookies: ${storageState.cookies.map(c => c.name).join(', ')}`)
            }

            await this.session.saveSessionForAccount(accountId, storageState)
            session.lastLoginTime = new Date()

            console.log('✅ Login successful after CAPTCHA')
        } catch (error: any) {
            throw new Error(`Failed to complete CAPTCHA login: ${error.message}`)
        }
    }

    /**
     * Renew card with a specific account
     */
    async renewCardWithAccount(accountId: string, cardNumber: string, duration: string): Promise<{ success: boolean; message: string }> {
        const session = this.accountSessions.get(accountId)
        if (!session) throw new Error(`No session found for account ${accountId}`)

        const { page } = session

        try {
            const renewUrl = this.config.renewUrl.startsWith('http')
                ? this.config.renewUrl
                : this.config.loginUrl.replace(/\/[^\/]*$/, '/') + this.config.renewUrl
            await page.goto(renewUrl, { timeout: 60000 })
            try {
                await page.waitForLoadState('load', { timeout: 30000 })
            } catch {
                console.log('⚠️ Page load timeout - continuing')
            }
            // Wait for beIN page to fully load
            await page.waitForTimeout(7000)

            await page.fill(this.config.selCardInput, cardNumber)
            await page.selectOption(this.config.selDuration, duration)
            await page.click(this.config.selRenewSubmit)

            try {
                await page.waitForLoadState('load', { timeout: 30000 })
            } catch {
                console.log('⚠️ Submit response timeout - continuing')
            }

            const successElement = await page.$(this.config.selSuccessMsg)
            if (successElement) {
                const message = await successElement.textContent()
                return { success: true, message: message || 'تم التجديد بنجاح' }
            }

            const errorElement = await page.$(this.config.selErrorMsg)
            if (errorElement) {
                const message = await errorElement.textContent()
                return { success: false, message: message || 'فشل التجديد' }
            }

            return { success: true, message: 'تم إرسال طلب التجديد' }

        } catch (error: any) {
            return { success: false, message: `خطأ في التجديد: ${error.message}` }
        }
    }

    /**
     * Check balance with a specific account
     */
    async checkBalanceWithAccount(accountId: string, cardNumber: string): Promise<{ success: boolean; message: string }> {
        const session = this.accountSessions.get(accountId)
        if (!session) throw new Error(`No session found for account ${accountId}`)

        const { page } = session

        try {
            const checkUrl = this.config.checkUrl.startsWith('http')
                ? this.config.checkUrl
                : this.config.loginUrl.replace(/\/[^\/]*$/, '/') + this.config.checkUrl
            await page.goto(checkUrl, { timeout: 60000 })
            try {
                await page.waitForLoadState('load', { timeout: 30000 })
            } catch {
                console.log('⚠️ Page load timeout - continuing')
            }
            // Wait for beIN page to fully load
            await page.waitForTimeout(7000)

            await page.fill(this.config.selCheckCard, cardNumber)
            await page.click(this.config.selCheckSubmit)

            try {
                await page.waitForLoadState('load', { timeout: 30000 })
            } catch {
                console.log('⚠️ Check submit timeout - continuing')
            }

            const balanceElement = await page.$(this.config.selBalanceResult)
            if (balanceElement) {
                const balance = await balanceElement.textContent()
                return { success: true, message: balance || 'تم الاستعلام' }
            }

            return { success: true, message: 'تم الاستعلام عن الرصيد' }

        } catch (error: any) {
            return { success: false, message: `خطأ في الاستعلام: ${error.message}` }
        }
    }

    /**
     * Refresh signal with a specific account
     */
    async refreshSignalWithAccount(accountId: string, cardNumber: string): Promise<{ success: boolean; message: string }> {
        const session = this.accountSessions.get(accountId)
        if (!session) throw new Error(`No session found for account ${accountId}`)

        const { page } = session

        try {
            const signalUrl = this.config.signalUrl.startsWith('http')
                ? this.config.signalUrl
                : this.config.loginUrl.replace(/\/[^\/]*$/, '/') + this.config.signalUrl
            await page.goto(signalUrl, { timeout: 60000 })
            try {
                await page.waitForLoadState('load', { timeout: 30000 })
            } catch {
                console.log('⚠️ Page load timeout - continuing')
            }

            await page.fill(this.config.selCardInput, cardNumber)
            await page.click(this.config.selSubmit)

            try {
                await page.waitForLoadState('load', { timeout: 30000 })
            } catch {
                console.log('⚠️ Submit response timeout - continuing')
            }

            return { success: true, message: 'تم تحديث الإشارة بنجاح' }

        } catch (error: any) {
            return { success: false, message: `خطأ في تحديث الإشارة: ${error.message}` }
        }
    }

    // ===== Wizard Flow Methods =====

    /**
     * Start renewal session and extract available packages
     * This navigates to the renewal page, enters card number, and scrapes all available packages
     */
    async startRenewalSession(accountId: string, cardNumber: string): Promise<Array<{ index: number; name: string; price: number; checkboxSelector: string }>> {
        const session = this.accountSessions.get(accountId)
        if (!session) throw new Error(`No session found for account ${accountId}`)

        const { page } = session
        const packages: Array<{ index: number; name: string; price: number; checkboxSelector: string }> = []

        try {
            // ===== STEP 1: Go to Check page first to validate card and get STB number =====
            const checkUrl = this.config.checkUrl.startsWith('http')
                ? this.config.checkUrl
                : this.config.loginUrl.replace(/\/[^\/]*$/, '/') + this.config.checkUrl
            console.log(`📍 Step 1: Navigating to check page: ${checkUrl}`)
            await page.goto(checkUrl, { timeout: 60000 })
            try {
                await page.waitForLoadState('load', { timeout: 30000 })
            } catch {
                console.log('⚠️ Check page load timeout - continuing anyway')
            }
            // Wait for beIN page to fully load
            await page.waitForTimeout(7000)

            // Session Check
            let currentUrl = page.url()
            if (currentUrl.includes('Login') || currentUrl.includes('login')) {
                console.log('⚠️ Session expired! Redirected to login page')
                throw new Error('انتهت جلسة الحساب - يرجى إعادة تسجيل الدخول')
            }

            // Enter card number on check page
            const checkCardInput = await page.$('#ContentPlaceHolder1_txtSerialNumber') ||
                await page.$('#ContentPlaceHolder1_txtCardNumber') ||
                await page.$('input[id*="Serial"]') ||
                await page.$('input[id*="Card"]')

            if (checkCardInput) {
                await checkCardInput.fill(cardNumber)
                console.log(`📝 Card number entered on check page`)
            } else {
                throw new Error('لم يتم العثور على حقل رقم الكارت في صفحة الفحص')
            }

            // Click check/search button
            const checkBtn = await page.$('#ContentPlaceHolder1_btnCheck') ||
                await page.$('#ContentPlaceHolder1_btnSearch') ||
                await page.$('input[value*="Check"]') ||
                await page.$('input[value*="Search"]') ||
                await page.$('input[type="submit"]')

            if (checkBtn) {
                await checkBtn.click()
                try {
                    await page.waitForLoadState('load', { timeout: 30000 })
                } catch {
                    console.log('⚠️ Check button response timeout - continuing')
                }
                await page.waitForTimeout(3000)
                console.log(`✅ Card checked successfully`)

                // Extract STB number from Check page results
                const stbElement = await page.$('#ContentPlaceHolder1_lblSTB') ||
                    await page.$('#ContentPlaceHolder1_lblSTBNumber') ||
                    await page.$('span[id*="STB"]') ||
                    await page.$('span[id*="stb"]') ||
                    await page.$('td:has-text("STB")') ||
                    await page.$('.stb-number')

                if (stbElement) {
                    const stbText = await stbElement.textContent()
                    if (stbText) {
                        // Extract numbers (STB is usually 10+ digits)
                        const stbMatch = stbText.match(/\d{10,}/)?.[0]
                        if (stbMatch) {
                            console.log(`📺 STB Number found: ${stbMatch}`)
                            // Store in session for later use
                            session.stbNumber = stbMatch
                        }
                    }
                }

                // Also try to extract from page content
                if (!session.stbNumber) {
                    const pageContent = await page.content()
                    const stbMatch = pageContent.match(/STB[:\s]*(\d{10,})/i)?.[1] ||
                        pageContent.match(/رقم الريسيفر[:\s]*(\d{10,})/)?.[1]
                    if (stbMatch) {
                        console.log(`📺 STB Number found in page: ${stbMatch}`)
                        session.stbNumber = stbMatch
                    }
                }
            }

            // ===== STEP 2: Now navigate to Sell Packages page =====
            const renewUrl = this.config.renewUrl.startsWith('http')
                ? this.config.renewUrl
                : this.config.loginUrl.replace(/\/[^\/]*$/, '/') + this.config.renewUrl
            console.log(`📍 Step 2: Navigating to renewal page: ${renewUrl}`)
            await page.goto(renewUrl, { timeout: 60000 })
            try {
                await page.waitForLoadState('load', { timeout: 30000 })
            } catch {
                console.log('⚠️ Renewal page load timeout - continuing anyway')
            }
            // Wait for beIN page to fully load
            await page.waitForTimeout(7000)

            // Session Check again
            currentUrl = page.url()
            if (currentUrl.includes('Login') || currentUrl.includes('login')) {
                console.log('⚠️ Session expired on renewal page!')
                throw new Error('انتهت جلسة الحساب - يرجى إعادة تسجيل الدخول')
            }

            // ===== STEP 2.1: Select Item Type = Smartcard: CISCO =====
            console.log('🔍 Step 2.1: Looking for Item Type dropdown...')

            // DEBUG: Log current page state
            const renewPageUrl = page.url()
            const renewPageTitle = await page.title()
            console.log(`🔍 DEBUG - Current URL: ${renewPageUrl}`)
            console.log(`🔍 DEBUG - Page Title: ${renewPageTitle}`)

            // DEBUG: Look for key elements on the page
            const allSelects = await page.$$('select')
            console.log(`🔍 DEBUG - Found ${allSelects.length} select elements on page`)
            for (let i = 0; i < allSelects.length; i++) {
                const id = await allSelects[i].getAttribute('id')
                const name = await allSelects[i].getAttribute('name')
                console.log(`   Select ${i}: id="${id}", name="${name}"`)
            }

            const allInputs = await page.$$('input[type="text"]')
            console.log(`🔍 DEBUG - Found ${allInputs.length} text input elements on page`)
            for (let i = 0; i < Math.min(allInputs.length, 5); i++) {
                const id = await allInputs[i].getAttribute('id')
                const name = await allInputs[i].getAttribute('name')
                console.log(`   Input ${i}: id="${id}", name="${name}"`)
            }

            // Try multiple selectors for the dropdown
            const dropdownSelectors = [
                '#ContentPlaceHolder1_ddlType',
                'select[id*="ddlType"]',
                '#ContentPlaceHolder1_ddlItemType',
                'select[id*="ItemType"]'
            ]

            let dropdownFound = false
            for (const selector of dropdownSelectors) {
                const dropdown = await page.$(selector)
                if (dropdown) {
                    console.log(`✅ Found dropdown with selector: ${selector}`)

                    // Log current options
                    const options = await page.$$eval(selector + ' option', opts =>
                        opts.map(o => ({ value: o.value, text: o.textContent }))
                    )
                    console.log(`📋 Dropdown options:`, JSON.stringify(options))

                    // Try to select Smartcard: CISCO
                    try {
                        // Method 1: Select by label (text content)
                        await page.selectOption(selector, { label: 'Smartcard: CISCO' })
                        console.log(`✅ Selected by label: Smartcard: CISCO`)
                        dropdownFound = true
                    } catch (e1) {
                        console.log(`⚠️ Select by label failed, trying by value...`)
                        try {
                            // Method 2: Select by value containing CISCO
                            const ciscoOption = options.find(o =>
                                o.text?.includes('CISCO') || o.value?.includes('CISCO')
                            )
                            if (ciscoOption?.value) {
                                await page.selectOption(selector, ciscoOption.value)
                                console.log(`✅ Selected by value: ${ciscoOption.value}`)
                                dropdownFound = true
                            }
                        } catch (e2) {
                            console.log(`⚠️ Select by value failed, trying by index...`)
                            try {
                                // Method 3: Select second option (index 1)
                                await page.selectOption(selector, { index: 1 })
                                console.log(`✅ Selected by index: 1`)
                                dropdownFound = true
                            } catch (e3) {
                                console.log(`❌ All dropdown selection methods failed`)
                            }
                        }
                    }

                    if (dropdownFound) {
                        // Wait for page to update after dropdown selection
                        console.log('⏳ Waiting for page to update after dropdown selection...')
                        await page.waitForTimeout(3000)

                        try {
                            await page.waitForLoadState('load', { timeout: 15000 })
                            console.log('✅ Page updated after dropdown selection')
                        } catch {
                            console.log('⚠️ Page update timeout - continuing anyway')
                        }
                    }
                    break
                }
            }

            if (!dropdownFound) {
                console.log('⚠️ Item Type dropdown not found with any selector - checking page state...')
                const pageContent = await page.content()
                if (pageContent.includes('Serial Number') || pageContent.includes('SerialNumber')) {
                    console.log('✅ Already on correct form view')
                } else {
                    console.log('⚠️ May need to configure dropdown selector')
                }
            }

            // Extra wait after dropdown selection for form to fully update
            await page.waitForTimeout(2000)

            // ===== STEP 2.2: Enter card number on renewal page =====
            console.log('🔍 Step 2.2: Looking for card number input fields...')

            // DEBUG: List all input fields after CISCO selection
            const allInputsAfterCisco = await page.$$('input')
            console.log(`🔍 DEBUG - Found ${allInputsAfterCisco.length} total input elements after CISCO selection`)
            for (let i = 0; i < Math.min(allInputsAfterCisco.length, 10); i++) {
                const id = await allInputsAfterCisco[i].getAttribute('id')
                const name = await allInputsAfterCisco[i].getAttribute('name')
                const type = await allInputsAfterCisco[i].getAttribute('type')
                const value = await allInputsAfterCisco[i].getAttribute('value')
                if (id || name) {
                    console.log(`   Input ${i}: id="${id}", name="${name}", type="${type}", value="${value?.slice(0, 20) || ''}"`)
                }
            }

            // beIN requires card number WITHOUT the last digit (check digit)
            // Full: 7511394806 → Enter: 751139480
            const formattedCard = cardNumber.slice(0, -1)
            console.log(`📝 Original card: ${cardNumber.slice(0, 4)}****${cardNumber.slice(-2)}`)
            console.log(`📝 Formatted for beIN (no last digit): ${formattedCard.slice(0, 4)}****${formattedCard.slice(-2)}`)

            // Find and fill Serial Number field (tbSerial1)
            const serial1Selectors = [
                '#ContentPlaceHolder1_tbSerial1',
                'input[id*="tbSerial1"]',
                'input[name*="tbSerial1"]'
            ]

            let serial1Found = false
            for (const selector of serial1Selectors) {
                const input = await page.$(selector)
                if (input) {
                    console.log(`✅ Found Serial Number field: ${selector}`)
                    await input.fill(formattedCard)
                    console.log(`✅ Serial Number entered`)

                    // Trigger blur event to potentially reveal Confirm field
                    await page.keyboard.press('Tab')
                    await page.waitForTimeout(1000)

                    serial1Found = true
                    break
                }
            }

            if (!serial1Found) {
                console.log('❌ Serial Number field (tbSerial1) not found!')
                throw new Error('لم يتم العثور على حقل رقم الكارت')
            }

            // Wait for Confirm Serial Number field to appear (it appears dynamically after tbSerial1 is filled)
            console.log('⏳ Waiting for Confirm Serial Number field to appear...')
            await page.waitForTimeout(2000)

            // Find and fill Confirm Serial Number field (tbSerial2) - CISCO form has this
            const serial2Selectors = [
                '#ContentPlaceHolder1_tbSerial2',
                'input[id*="tbSerial2"]',
                'input[name*="tbSerial2"]',
                'input[id*="ConfirmSerial"]'
            ]

            let serial2Found = false
            for (const selector of serial2Selectors) {
                const input = await page.$(selector)
                if (input) {
                    console.log(`✅ Found Confirm Serial Number field: ${selector}`)
                    await input.fill(formattedCard)
                    console.log(`✅ Confirm Serial Number entered`)
                    serial2Found = true
                    break
                }
            }

            if (!serial2Found) {
                console.log('⚠️ Confirm Serial Number field not found - may not be required for this card type')
            }

            // ===== STEP 2.3: Click Load button =====
            console.log('🔍 Step 2.3: Looking for Load button...')

            const loadBtnSelectors = [
                '#ContentPlaceHolder1_btnLoad',
                '#ContentPlaceHolder1_btnLoadAnother',
                '#ContentPlaceHolder1_btnSearch',
                'input[value="Load"]',
                'input[value*="Load"]',
                'input[type="submit"]'
            ]

            let loadBtnFound = false
            for (const selector of loadBtnSelectors) {
                const btn = await page.$(selector)
                if (btn) {
                    console.log(`✅ Found Load button with selector: ${selector}`)
                    await btn.click()
                    console.log('⏳ Waiting for packages to load...')
                    try {
                        await page.waitForLoadState('load', { timeout: 30000 })
                    } catch {
                        console.log('⚠️ Load timeout - continuing')
                    }
                    await page.waitForTimeout(3000)
                    console.log(`✅ Load button clicked, packages should be loaded`)
                    loadBtnFound = true
                    break
                }
            }

            if (!loadBtnFound) {
                console.log('⚠️ Load button not found - packages may already be loaded')
            }

            // Wait for packages table to load (beIN does a postback)
            console.log('⏳ Waiting for packages table to appear...')
            await page.waitForTimeout(5000)

            // DEBUG: List all inputs AFTER Load button click
            const inputsAfterLoad = await page.$$('input[type="text"]')
            console.log(`🔍 DEBUG - Found ${inputsAfterLoad.length} text inputs after Load`)
            for (let i = 0; i < inputsAfterLoad.length; i++) {
                const id = await inputsAfterLoad[i].getAttribute('id')
                const value = await inputsAfterLoad[i].getAttribute('value')
                console.log(`   Input ${i}: id="${id}", value="${value?.slice(0, 10)}"`)
            }

            // Check if tbSerial2 NOW exists (appears after Load if confirmation needed)
            const serial2AfterLoad = await page.$('#ContentPlaceHolder1_tbSerial2')
            if (serial2AfterLoad) {
                console.log('✅ Confirm Serial Number field appeared after Load!')
                await serial2AfterLoad.fill(formattedCard)
                console.log('✅ Confirm Serial Number entered')

                // Click Load button again
                const loadBtn2 = await page.$('input[value="Load"]')
                if (loadBtn2) {
                    console.log('🔄 Clicking Load button again...')
                    await loadBtn2.click()
                    await page.waitForTimeout(5000)
                }
            }

            // Try to wait for the packages table specifically
            try {
                await page.waitForSelector('#ContentPlaceHolder1_gvAvailablePackages', { timeout: 10000 })
                console.log('✅ Packages table appeared!')
            } catch {
                console.log('⚠️ Packages table not found within timeout, checking page state...')
            }

            // ===== DEBUG: Check for error messages after Load =====
            const errorLabels = await page.$$('span[id*="lbl"], label[id*="lbl"], .error, .alert, [style*="color: red"], [style*="color:red"]')
            console.log(`🔍 DEBUG - Found ${errorLabels.length} potential error/message labels`)
            for (let e = 0; e < errorLabels.length; e++) {
                const text = await errorLabels[e].textContent()
                if (text && text.trim()) {
                    console.log(`   Label ${e}: "${text.trim().slice(0, 100)}"`)
                }
            }

            // DEBUG: Get main content area text to understand what's shown
            const mainContent = await page.$('#ContentPlaceHolder1') || await page.$('.content') || await page.$('body')
            if (mainContent) {
                const contentText = await mainContent.textContent()
                const cleanText = contentText?.replace(/\s+/g, ' ').trim().slice(0, 500)
                console.log(`🔍 DEBUG - Page content preview: "${cleanText}"`)
            }

            // ===== DEBUG: Find all tables on page =====
            const allTables = await page.$$('table')
            console.log(`🔍 DEBUG - Found ${allTables.length} tables on page`)
            for (let t = 0; t < allTables.length; t++) {
                const tableId = await allTables[t].getAttribute('id')
                const tableClass = await allTables[t].getAttribute('class')
                const rowCount = await allTables[t].$$eval('tr', rows => rows.length)
                console.log(`   Table ${t}: id="${tableId}", class="${tableClass}", rows=${rowCount}`)
            }

            // DEBUG: Look for any GridView or data table
            const gridViews = await page.$$('table[id*="gv"], table[id*="GridView"], table[class*="Grid"]')
            console.log(`🔍 DEBUG - Found ${gridViews.length} potential GridView tables`)
            for (let g = 0; g < gridViews.length; g++) {
                const gvId = await gridViews[g].getAttribute('id')
                const gvRows = await gridViews[g].$$('tr')
                console.log(`   GridView ${g}: id="${gvId}", rows=${gvRows.length}`)

                // Log first few rows to understand structure
                for (let r = 0; r < Math.min(gvRows.length, 3); r++) {
                    const rowClass = await gvRows[r].getAttribute('class')
                    const cells = await gvRows[r].$$eval('td', tds => tds.map(td => td.textContent?.slice(0, 30)))
                    console.log(`      Row ${r}: class="${rowClass}", cells=${JSON.stringify(cells)}`)
                }
            }

            // ===== beIN Specific Package Extraction =====
            // Pattern: ContentPlaceHolder1_gvAvailablePackages_cbSelect_{index}
            // Table: ContentPlaceHolder1_gvAvailablePackages

            // Find all package rows in the table - try multiple patterns
            let packageRows = await page.$$('#ContentPlaceHolder1_gvAvailablePackages tr.GridRow, #ContentPlaceHolder1_gvAvailablePackages tr.GridAlternatingRow')

            // If not found, try alternative table selectors
            if (packageRows.length === 0) {
                console.log('🔍 Trying alternative table selectors...')
                packageRows = await page.$$('table[id*="gv"] tr:not(:first-child)') ||
                    await page.$$('table[id*="Package"] tr:not(:first-child)') ||
                    await page.$$('.GridRow, .GridAlternatingRow')
            }

            console.log(`📋 Found ${packageRows.length} package rows in beIN table`)

            for (let i = 0; i < packageRows.length; i++) {
                const row = packageRows[i]

                // Get checkbox
                const checkbox = await row.$('input[type="checkbox"]')
                if (!checkbox) continue

                // Get checkbox ID to build the selector
                const checkboxId = await checkbox.getAttribute('id')
                const checkboxSelector = checkboxId ? `#${checkboxId}` : `#ContentPlaceHolder1_gvAvailablePackages_cbSelect_${i}`

                // Get all cells in this row
                const cells = await row.$$('td')

                let name = ''
                let price = 0

                // Find name cell (usually has ContentPlaceHolder1_gvAvailablePackages_lblName_X)
                const nameSpan = await row.$('span[id*="lblName"]')
                if (nameSpan) {
                    name = await nameSpan.textContent() || ''
                }

                // Find price from cells (look for USD pattern)
                for (const cell of cells) {
                    const cellText = await cell.textContent() || ''
                    // Match price patterns: "174 USD", "174USD", "330 USD"
                    const priceMatch = cellText.match(/(\d+(?:\.\d{1,2})?)\s*USD/i)
                    if (priceMatch) {
                        price = parseFloat(priceMatch[1])
                        break
                    }
                }

                // If name not found in span, try to get from cell text
                if (!name) {
                    for (const cell of cells) {
                        const cellText = await cell.textContent() || ''
                        // Skip cells that only contain price or checkbox
                        if (cellText.includes('USD') || cellText.trim().length < 5) continue
                        if (cellText.includes('Months') || cellText.includes('Payment')) {
                            name = cellText.trim()
                            break
                        }
                    }
                }

                if (name && price > 0) {
                    packages.push({
                        index: i,
                        name: name.trim(),
                        price,
                        checkboxSelector
                    })
                    console.log(`  📦 Package ${i}: "${name}" - ${price} USD [${checkboxSelector}]`)
                }
            }

            // Fallback: If no packages found with specific pattern, try generic approach
            if (packages.length === 0) {
                console.log('⚠️ No packages found with beIN pattern, trying generic approach...')

                const allCheckboxes = await page.$$('input[type="checkbox"][id*="cbSelect"]')
                for (let i = 0; i < allCheckboxes.length; i++) {
                    const checkbox = allCheckboxes[i]
                    const checkboxId = await checkbox.getAttribute('id')
                    const checkboxSelector = checkboxId ? `#${checkboxId}` : `input[type="checkbox"]:nth-of-type(${i + 1})`

                    // Try to get parent row text
                    const parentRow = await checkbox.evaluateHandle((el: any) => el.closest('tr'))
                    const rowText = await parentRow.evaluate((el: any) => el?.innerText || el?.textContent || '')

                    const priceMatch = rowText.match(/(\d+(?:\.\d{1,2})?)\s*USD/i)
                    const price = priceMatch ? parseFloat(priceMatch[1]) : 0
                    const name = rowText.replace(/\d+\s*USD/gi, '').replace(/\s+/g, ' ').trim().slice(0, 80)

                    if (price > 0) {
                        packages.push({
                            index: i,
                            name: name || `Package ${i + 1}`,
                            price,
                            checkboxSelector
                        })
                    }
                }
            }

            console.log(`✅ Extracted ${packages.length} packages from beIN`)

            // ===== Error handling: No packages found =====
            if (packages.length === 0) {
                // Check for error messages on the page
                const errorMsg = await page.$('.alert-danger, .error-message, [class*="error"]')
                if (errorMsg) {
                    const errorText = await errorMsg.textContent()
                    throw new Error(`beIN Error: ${errorText?.trim() || 'لم يتم العثور على باقات'}`)
                }

                throw new Error('لم يتم العثور على باقات متاحة لهذا الكارت')
            }

            return packages

        } catch (error: any) {
            console.error('Error extracting packages:', error.message)
            throw new Error(`فشل في استخراج الباقات: ${error.message}`)
        }
    }

    /**
     * Extract STB (Set-Top Box) number from the page
     * First checks if STB was already extracted during Check page processing
     */
    async extractSTBNumber(accountId: string): Promise<string | null> {
        const session = this.accountSessions.get(accountId)
        if (!session) return null

        // First, check if we already extracted STB from Check page
        if (session.stbNumber) {
            console.log(`📺 Using cached STB Number: ${session.stbNumber}`)
            return session.stbNumber
        }

        const { page } = session

        try {
            // Common selectors for STB number display
            const stbSelectors = [
                '#stbNumber',
                '.stb-number',
                '[data-stb]',
                'td:has-text("STB")',
                'span:has-text("رقم الريسيفر")'
            ]

            for (const selector of stbSelectors) {
                const element = await page.$(selector)
                if (element) {
                    const text = await element.textContent()
                    if (text) {
                        // Extract numbers from the text
                        const stbMatch = text.match(/\d{10,}/)?.[0]
                        if (stbMatch) return stbMatch
                    }
                }
            }

            // Try to find in page content
            const pageContent = await page.content()
            const stbMatch = pageContent.match(/STB[:\s]*(\d{10,})/i)?.[1]
            return stbMatch || null

        } catch (error) {
            console.error('Error extracting STB number:', error)
            return null
        }
    }

    /**
     * Complete package purchase with optional promo code
     * beIN-specific implementation
     */
    async completePackagePurchase(
        accountId: string,
        selectedPackage: { index: number; name: string; price: number; checkboxSelector: string },
        promoCode?: string | null,
        stbNumber?: string
    ): Promise<{ success: boolean; message: string }> {
        const session = this.accountSessions.get(accountId)
        if (!session) throw new Error(`No session found for account ${accountId}`)

        const { page } = session

        try {
            console.log(`📦 Selecting package: ${selectedPackage.name} (${selectedPackage.price} USD)`)
            console.log(`   Using selector: ${selectedPackage.checkboxSelector}`)

            // ===== Step 1: Verify and click the correct checkbox =====
            const checkbox = await page.$(selectedPackage.checkboxSelector)
            if (!checkbox) {
                throw new Error(`Checkbox not found: ${selectedPackage.checkboxSelector}`)
            }

            // Double-check: verify this is the correct package by checking nearby text
            const row = await checkbox.evaluateHandle((el: any) => el.closest('tr'))
            const rowText = await row.evaluate((el: any) => el?.innerText || el?.textContent || '')

            // Verify the price matches (security check)
            const priceInRow = rowText.match(/(\d+(?:\.\d{1,2})?)\s*USD/i)
            if (priceInRow) {
                const extractedPrice = parseFloat(priceInRow[1])
                if (extractedPrice !== selectedPackage.price) {
                    throw new Error(`Price mismatch! Expected ${selectedPackage.price} USD but found ${extractedPrice} USD in row. Aborting to prevent wrong purchase.`)
                }
                console.log(`✅ Price verified: ${extractedPrice} USD matches selected package`)
            }

            // Click the checkbox
            await checkbox.click()
            await page.waitForTimeout(500)

            // Verify checkbox is now checked
            const isChecked = await checkbox.isChecked()
            if (!isChecked) {
                await checkbox.check() // Force check if click didn't work
            }
            console.log(`☑️ Checkbox selected`)

            // ===== Step 2: Apply promo code if provided =====
            if (promoCode) {
                console.log(`🎫 Applying promo code: ${promoCode}`)

                // beIN specific promo code input
                const promoInput = await page.$('#ContentPlaceHolder1_txtPromoCode') ||
                    await page.$('input[id*="PromoCode"]') ||
                    await page.$('input[name*="PromoCode"]')

                if (promoInput) {
                    await promoInput.fill(promoCode)
                    console.log(`✅ Promo code entered: ${promoCode}`)

                    // beIN Submit button for promo - correct ID from screenshot
                    const submitPromoBtn = await page.$('#ContentPlaceHolder1_btnPromoCode') ||
                        await page.$('input[value="Submit"]') ||
                        await page.$('input[id*="btnPromo"]')

                    if (submitPromoBtn) {
                        console.log('🔄 Clicking Submit to apply promo code...')
                        await submitPromoBtn.click()

                        // Wait for page to refresh and show updated prices
                        console.log('⏳ Waiting for promo code to be applied (5 seconds)...')
                        await page.waitForTimeout(5000)
                        console.log('✅ Promo code applied, page should show updated prices')
                    } else {
                        console.log('⚠️ Promo Submit button not found')
                    }
                } else {
                    console.log('⚠️ Promo code input not found, skipping...')
                }
            }

            // ===== Step 3: Click "Add >" button =====
            const addButton = await page.$('#ContentPlaceHolder1_btnAddToCart') ||
                await page.$('input[value="Add >"]') ||
                await page.$('input[id*="btnAdd"]')

            if (!addButton) {
                throw new Error('Add button not found')
            }

            console.log(`🛒 Clicking Add button...`)
            await addButton.click()
            await page.waitForLoadState('networkidle')
            await page.waitForTimeout(2000)

            // ===== Step 4: Check Shopping Cart and confirm =====
            // Check if there's a confirmation or final submit needed
            const finalSubmitBtn = await page.$('#ContentPlaceHolder1_btnConfirm') ||
                await page.$('input[value*="Confirm"]') ||
                await page.$('input[value*="Complete"]') ||
                await page.$('input[value*="Submit"]')

            if (finalSubmitBtn) {
                console.log(`✅ Clicking final confirm button...`)
                await finalSubmitBtn.click()
                await page.waitForLoadState('networkidle')
            }

            // ===== Step 5: Check result =====
            // Check for success message
            const successElement = await page.$(this.config.selSuccessMsg) ||
                await page.$('.alert-success') ||
                await page.$('[class*="success"]')
            if (successElement) {
                const message = await successElement.textContent()
                return { success: true, message: message?.trim() || 'تم التجديد بنجاح' }
            }

            // Check for error message
            const errorElement = await page.$(this.config.selErrorMsg) ||
                await page.$('.alert-danger') ||
                await page.$('[class*="error"]')
            if (errorElement) {
                const message = await errorElement.textContent()
                return { success: false, message: message?.trim() || 'فشل التجديد' }
            }

            // Check page content for indicators
            const pageContent = await page.content()
            if (pageContent.toLowerCase().includes('success') || pageContent.includes('تم')) {
                return { success: true, message: `تم تجديد ${selectedPackage.name} بنجاح` }
            }

            // Default: assume success if no error shown
            return { success: true, message: `تم إضافة ${selectedPackage.name} للسلة` }

        } catch (error: any) {
            console.error('❌ Error completing purchase:', error.message)
            return { success: false, message: `فشل في إتمام الشراء: ${error.message}` }
        }
    }

    // ===== Legacy methods for backward compatibility =====

    async ensureLogin(): Promise<{ requiresCaptcha?: boolean; captchaImage?: string }> {
        console.warn('⚠️ ensureLogin() is deprecated. Use ensureLoginWithAccount() instead.')
        throw new Error('Multi-account mode requires ensureLoginWithAccount()')
    }

    async completeCaptcha(solution: string): Promise<void> {
        console.warn('⚠️ completeCaptcha() is deprecated. Use completeCaptchaForAccount() instead.')
        throw new Error('Multi-account mode requires completeCaptchaForAccount()')
    }

    async renewCard(cardNumber: string, duration: string): Promise<{ success: boolean; message: string }> {
        console.warn('⚠️ renewCard() is deprecated. Use renewCardWithAccount() instead.')
        throw new Error('Multi-account mode requires renewCardWithAccount()')
    }

    async checkBalance(cardNumber: string): Promise<{ success: boolean; message: string }> {
        console.warn('⚠️ checkBalance() is deprecated. Use checkBalanceWithAccount() instead.')
        throw new Error('Multi-account mode requires checkBalanceWithAccount()')
    }

    async refreshSignal(cardNumber: string): Promise<{ success: boolean; message: string }> {
        console.warn('⚠️ refreshSignal() is deprecated. Use refreshSignalWithAccount() instead.')
        throw new Error('Multi-account mode requires refreshSignalWithAccount()')
    }

    // ===== Utility methods =====

    async reloadConfig(): Promise<void> {
        await this.loadConfig()
    }

    async close(): Promise<void> {
        // Close all account sessions
        for (const [accountId, session] of this.accountSessions) {
            try {
                await session.page.close()
                await session.context.close()
            } catch (e) {
                // Ignore errors during cleanup
            }
        }
        this.accountSessions.clear()

        if (this.browser) await this.browser.close()
        console.log('🔒 Browser closed')
    }

    /**
     * Close a specific account session
     */
    async closeAccountSession(accountId: string): Promise<void> {
        const session = this.accountSessions.get(accountId)
        if (session) {
            try {
                await session.page.close()
                await session.context.close()
            } catch (e) {
                // Ignore errors during cleanup
            }
            this.accountSessions.delete(accountId)
            console.log(`🔒 Session closed for account ${accountId}`)
        }
    }

    private isSessionValidForAccount(accountId: string): boolean {
        const session = this.accountSessions.get(accountId)
        if (!session?.lastLoginTime) return false
        const elapsed = Date.now() - session.lastLoginTime.getTime()
        return elapsed < (this.config.sessionTimeout * 60 * 1000)
    }

    /**
     * Close browser if idle for too long
     * Called periodically by IdleMonitor
     */
    async closeBrowserIfIdle(): Promise<boolean> {
        if (!this.browser) return false

        // Don't close if there are active sessions
        if (this.accountSessions.size > 0) {
            this.lastBrowserActivity = Date.now()
            return false
        }

        const idleTime = Date.now() - this.lastBrowserActivity
        if (idleTime > this.idleTimeoutMs) {
            await this.browser.close()
            this.browser = null
            console.log(`💤 Browser closed after ${Math.round(idleTime / 1000)}s idle`)
            return true
        }

        return false
    }

    /**
     * Cleanup idle sessions (sessions not used for a while)
     */
    async cleanupIdleSessions(maxIdleMs: number = 600000): Promise<number> {
        let closedCount = 0
        const now = Date.now()

        for (const [accountId, session] of this.accountSessions) {
            if (session.lastLoginTime) {
                const elapsed = now - session.lastLoginTime.getTime()
                if (elapsed > maxIdleMs) {
                    await this.closeAccountSession(accountId)
                    closedCount++
                }
            }
        }

        // If all sessions are closed and browser is idle, close browser too
        if (this.accountSessions.size === 0 && this.browser) {
            await this.closeBrowserIfIdle()
        }

        return closedCount
    }

    /**
     * Check if browser is currently active
     */
    isBrowserActive(): boolean {
        return this.browser !== null
    }

    /**
     * Get current stats for monitoring
     */
    getStats(): { browserActive: boolean; activeSessions: number; lastActivity: number } {
        return {
            browserActive: this.browser !== null,
            activeSessions: this.accountSessions.size,
            lastActivity: this.lastBrowserActivity
        }
    }
}

