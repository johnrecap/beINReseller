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

        await page.goto(this.config.loginUrl)
        await page.waitForLoadState('networkidle')

        // Fill credentials from account (not from settings)
        await page.fill(this.config.selUsername, account.username)
        await page.fill(this.config.selPassword, account.password)

        // Handle 2FA (TOTP)
        if (account.totpSecret) {
            try {
                const totpCode = this.totp.generate(account.totpSecret)
                await page.fill(this.config.sel2fa, totpCode)
                console.log('🔢 2FA code entered')
            } catch (e) {
                console.log('ℹ️ 2FA field not found or not required')
            }
        }

        // Handle CAPTCHA - Manual Mode
        try {
            const captchaElement = await page.$(this.config.selCaptchaImg)
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

        // Submit form
        await page.click(this.config.selSubmit)
        await page.waitForLoadState('networkidle')

        // Verify login success
        const currentUrl = page.url()
        if (currentUrl.includes('login') || currentUrl.includes('error')) {
            throw new Error('Login failed - check credentials or portal status')
        }

        // Save session
        const storageState = await context.storageState()
        await this.session.saveSessionForAccount(account.id, storageState)

        // Update session last login time
        session.lastLoginTime = new Date()

        console.log(`✅ Login successful for ${account.label || account.username}`)
        return {}
    }

    /**
     * Complete CAPTCHA for a specific account
     */
    async completeCaptchaForAccount(accountId: string, solution: string): Promise<void> {
        const session = this.accountSessions.get(accountId)
        if (!session) throw new Error(`No session found for account ${accountId}`)

        const { page, context } = session

        try {
            await page.fill(this.config.selCaptchaInput, solution)
            console.log('🧩 Manual CAPTCHA solution entered')

            // Submit form
            await page.click(this.config.selSubmit)
            await page.waitForLoadState('networkidle')

            // Verify login success
            const currentUrl = page.url()
            if (currentUrl.includes('login') || currentUrl.includes('error')) {
                throw new Error('Login failed after CAPTCHA - check solution')
            }

            // Save session
            const storageState = await context.storageState()
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
            const renewUrl = this.config.loginUrl + this.config.renewUrl
            await page.goto(renewUrl)
            await page.waitForLoadState('networkidle')

            await page.fill(this.config.selCardInput, cardNumber)
            await page.selectOption(this.config.selDuration, duration)
            await page.click(this.config.selRenewSubmit)

            await page.waitForLoadState('networkidle')

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
            const checkUrl = this.config.loginUrl + this.config.checkUrl
            await page.goto(checkUrl)
            await page.waitForLoadState('networkidle')

            await page.fill(this.config.selCheckCard, cardNumber)
            await page.click(this.config.selCheckSubmit)

            await page.waitForLoadState('networkidle')

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
            const signalUrl = this.config.loginUrl + this.config.signalUrl
            await page.goto(signalUrl)
            await page.waitForLoadState('networkidle')

            await page.fill(this.config.selCardInput, cardNumber)
            await page.click(this.config.selSubmit)

            await page.waitForLoadState('networkidle')

            return { success: true, message: 'تم تحديث الإشارة بنجاح' }

        } catch (error: any) {
            return { success: false, message: `خطأ في تحديث الإشارة: ${error.message}` }
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

