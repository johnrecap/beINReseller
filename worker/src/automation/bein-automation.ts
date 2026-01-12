/**
 * beIN Automation - Core Playwright-based automation class
 * 
 * Handles all interactions with the beIN management portal:
 * - Login with 2FA (TOTP) and CAPTCHA solving
 * - Card renewal
 * - Balance checking
 * - Signal refresh
 * 
 * All settings are loaded from the database dynamically.
 */

import { Browser, Page, chromium, BrowserContext } from 'playwright'
import { PrismaClient } from '../../node_modules/@prisma/client'
import { TOTPGenerator } from '../utils/totp-generator'
import { CaptchaSolver } from '../utils/captcha-solver'
import { SessionManager } from '../utils/session-manager'

const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL
})

interface BeINConfig {
    // Credentials
    username: string
    password: string
    totpSecret: string

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

export class BeINAutomation {
    private browser: Browser | null = null
    private context: BrowserContext | null = null
    private page: Page | null = null

    private totp: TOTPGenerator
    private captcha!: CaptchaSolver
    private session: SessionManager
    private config!: BeINConfig

    private lastLoginTime: Date | null = null

    constructor() {
        this.totp = new TOTPGenerator()
        this.session = new SessionManager()
    }

    /**
     * Load configuration from database
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
            username: get('bein_username'),
            password: get('bein_password'),
            totpSecret: get('bein_totp_secret'),

            captchaApiKey: get('captcha_2captcha_key'),
            captchaEnabled: get('captcha_enabled', 'true') === 'true',

            loginUrl: get('bein_login_url', 'https://sbs.bein.com/'),
            renewUrl: get('bein_renew_url', '/Renew'),
            checkUrl: get('bein_check_url', '/CheckBalance'),
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
    }

    async initialize(): Promise<void> {
        // Load config first
        await this.loadConfig()

        this.browser = await chromium.launch({
            headless: this.config.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        })

        // Try to restore session
        const savedSession = await this.session.loadSession()
        if (savedSession) {
            this.context = await this.browser.newContext({
                storageState: savedSession.storageState
            })
            this.lastLoginTime = new Date(savedSession.createdAt)
            console.log('📦 Restored previous session')
        } else {
            this.context = await this.browser.newContext()
        }

        this.page = await this.context.newPage()

        // Set reasonable timeouts
        this.page.setDefaultTimeout(30000)
        this.page.setDefaultNavigationTimeout(60000)
    }

    async ensureLogin(): Promise<{ requiresCaptcha?: boolean; captchaImage?: string }> {
        if (!this.page) throw new Error('Browser not initialized')

        // Check if session is still valid
        if (this.isSessionValid()) {
            console.log('✅ Session still valid, skipping login')
            return {}
        }

        console.log('🔐 Starting login process...')

        await this.page.goto(this.config.loginUrl)
        await this.page.waitForLoadState('networkidle')

        // Fill credentials
        await this.page.fill(this.config.selUsername, this.config.username)
        await this.page.fill(this.config.selPassword, this.config.password)

        // Handle 2FA (TOTP)
        if (this.config.totpSecret) {
            try {
                const totpCode = this.totp.generate(this.config.totpSecret)
                await this.page.fill(this.config.sel2fa, totpCode)
                console.log('🔢 2FA code entered')
            } catch (e) {
                console.log('ℹ️ 2FA field not found or not required')
            }
        }

        // Handle CAPTCHA - Manual Mode
        try {
            const captchaElement = await this.page.$(this.config.selCaptchaImg)
            if (captchaElement) {
                const captchaBuffer = await captchaElement.screenshot()
                const captchaBase64 = captchaBuffer.toString('base64')

                // Pause and return image for manual entry
                console.log('🧩 CAPTCHA found, waiting for manual solution...')
                return {
                    requiresCaptcha: true,
                    captchaImage: captchaBase64
                }
            }
        } catch (e) {
            console.log('ℹ️ No CAPTCHA found, continuing...')
        }

        // Submit form (only if no CAPTCHA or auto-submit logic if needed later)
        await this.page.click(this.config.selSubmit)
        await this.page.waitForLoadState('networkidle')

        // Verify login success
        const currentUrl = this.page.url()
        if (currentUrl.includes('login') || currentUrl.includes('error')) {
            throw new Error('Login failed - check credentials or portal status')
        }

        // Save session
        const storageState = await this.context!.storageState()
        await this.session.saveSession(storageState)
        this.lastLoginTime = new Date()

        console.log('✅ Login successful')
        return {}
    }

    async completeCaptcha(solution: string): Promise<void> {
        if (!this.page) throw new Error('Browser not initialized')

        try {
            await this.page.fill(this.config.selCaptchaInput, solution)
            console.log('🧩 Manual CAPTCHA solution entered')

            // Submit form
            await this.page.click(this.config.selSubmit)
            await this.page.waitForLoadState('networkidle')

            // Verify login success
            const currentUrl = this.page.url()
            if (currentUrl.includes('login') || currentUrl.includes('error')) {
                throw new Error('Login failed after CAPTCHA - check solution')
            }

            // Save session
            const storageState = await this.context!.storageState()
            await this.session.saveSession(storageState)
            this.lastLoginTime = new Date()

            console.log('✅ Login successful after CAPTCHA')
        } catch (error: any) {
            throw new Error(`Failed to complete CAPTCHA login: ${error.message}`)
        }
    }

    async renewCard(cardNumber: string, duration: string): Promise<{ success: boolean; message: string }> {
        if (!this.page) throw new Error('Browser not initialized')

        try {
            const renewUrl = this.config.loginUrl + this.config.renewUrl
            await this.page.goto(renewUrl)
            await this.page.waitForLoadState('networkidle')

            await this.page.fill(this.config.selCardInput, cardNumber)
            await this.page.selectOption(this.config.selDuration, duration)
            await this.page.click(this.config.selRenewSubmit)

            await this.page.waitForLoadState('networkidle')

            const successElement = await this.page.$(this.config.selSuccessMsg)
            if (successElement) {
                const message = await successElement.textContent()
                return { success: true, message: message || 'تم التجديد بنجاح' }
            }

            const errorElement = await this.page.$(this.config.selErrorMsg)
            if (errorElement) {
                const message = await errorElement.textContent()
                return { success: false, message: message || 'فشل التجديد' }
            }

            return { success: true, message: 'تم إرسال طلب التجديد' }

        } catch (error: any) {
            return { success: false, message: `خطأ في التجديد: ${error.message}` }
        }
    }

    async checkBalance(cardNumber: string): Promise<{ success: boolean; message: string }> {
        if (!this.page) throw new Error('Browser not initialized')

        try {
            const checkUrl = this.config.loginUrl + this.config.checkUrl
            await this.page.goto(checkUrl)
            await this.page.waitForLoadState('networkidle')

            await this.page.fill(this.config.selCheckCard, cardNumber)
            await this.page.click(this.config.selCheckSubmit)

            await this.page.waitForLoadState('networkidle')

            const balanceElement = await this.page.$(this.config.selBalanceResult)
            if (balanceElement) {
                const balance = await balanceElement.textContent()
                return { success: true, message: balance || 'تم الاستعلام' }
            }

            return { success: true, message: 'تم الاستعلام عن الرصيد' }

        } catch (error: any) {
            return { success: false, message: `خطأ في الاستعلام: ${error.message}` }
        }
    }

    async refreshSignal(cardNumber: string): Promise<{ success: boolean; message: string }> {
        if (!this.page) throw new Error('Browser not initialized')

        try {
            const signalUrl = this.config.loginUrl + this.config.signalUrl
            await this.page.goto(signalUrl)
            await this.page.waitForLoadState('networkidle')

            await this.page.fill(this.config.selCardInput, cardNumber)
            await this.page.click(this.config.selSubmit)

            await this.page.waitForLoadState('networkidle')

            return { success: true, message: 'تم تحديث الإشارة بنجاح' }

        } catch (error: any) {
            return { success: false, message: `خطأ في تحديث الإشارة: ${error.message}` }
        }
    }

    async reloadConfig(): Promise<void> {
        await this.loadConfig()
    }

    async close(): Promise<void> {
        if (this.page) await this.page.close()
        if (this.context) await this.context.close()
        if (this.browser) await this.browser.close()
        console.log('🔒 Browser closed')
    }

    private isSessionValid(): boolean {
        if (!this.lastLoginTime) return false
        const elapsed = Date.now() - this.lastLoginTime.getTime()
        return elapsed < (this.config.sessionTimeout * 60 * 1000)
    }
}
