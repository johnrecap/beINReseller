/**
 * HttpClientService - Direct HTTP-based beIN automation
 * 
 * Replaces Playwright browser automation with fast HTTP requests.
 * Uses axios + tough-cookie for session management.
 * 
 * Key Features:
 * - Cookie-based session persistence
 * - ASP.NET ViewState handling
 * - HTML error detection
 * - Automatic retry on network failures
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import https from 'https';
import { prisma } from '../lib/prisma';
import { TOTPGenerator } from '../utils/totp-generator';
import {
    HiddenFields,
    BeINHttpConfig,
    LoginResult,
    CheckCardResult,
    LoadPackagesResult,
    AvailablePackage,
    PurchaseResult,
    SessionData,
    SignalRefreshResult,
    CheckCardForSignalResult
} from './types';

export class HttpClientService {
    private axios: AxiosInstance;
    private jar: CookieJar;
    private config!: BeINHttpConfig;
    private totp: TOTPGenerator;

    // Current page state
    private currentViewState: HiddenFields | null = null;
    private currentStbNumber: string | null = null;

    // Session tracking for persistent login
    private lastLoginTime: Date | null = null;
    private sessionValid: boolean = false;

    // Config caching
    private static configCache: { data: BeINHttpConfig; timestamp: number } | null = null;
    private static readonly CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    // Browser-like headers
    private static readonly BROWSER_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    };

    constructor() {
        this.jar = new CookieJar();
        this.totp = new TOTPGenerator();

        // Create axios instance with cookie support
        // Note: Cannot use custom httpsAgent with axios-cookiejar-support
        this.axios = wrapper(axios.create({
            jar: this.jar,
            withCredentials: true,
            headers: HttpClientService.BROWSER_HEADERS,
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: (status) => status < 500 // Accept redirects
        }));

        // Configure automatic retry
        axiosRetry(this.axios, {
            retries: 3,
            retryDelay: axiosRetry.exponentialDelay,
            retryCondition: (error) =>
                axiosRetry.isNetworkOrIdempotentRequestError(error) ||
                error.response?.status === 500 ||
                error.response?.status === 502 ||
                error.response?.status === 503
        });
    }

    /**
     * Initialize and load config from database
     */
    async initialize(): Promise<void> {
        await this.loadConfig();
        console.log('[HTTP] HttpClientService initialized');
    }

    /**
     * Load configuration from database
     */
    private async loadConfig(): Promise<void> {
        const settings = await prisma.setting.findMany({
            where: {
                key: { startsWith: 'bein_' }
            }
        });

        const captchaSettings = await prisma.setting.findMany({
            where: {
                key: { startsWith: 'captcha_' }
            }
        });

        const workerSettings = await prisma.setting.findMany({
            where: {
                key: { startsWith: 'worker_' }
            }
        });

        const all = [...settings, ...captchaSettings, ...workerSettings];
        const get = (key: string, fallback: string = ''): string => {
            const setting = all.find(s => s.key === key);
            return setting?.value || fallback;
        };

        this.config = {
            captchaApiKey: get('captcha_2captcha_key'),
            captchaEnabled: get('captcha_enabled', 'true') === 'true',
            selCaptchaImg: get('bein_sel_captcha_img', 'Login1_ImageVerificationDealer_Image'),

            loginUrl: get('bein_login_url', 'https://sbs.beinsports.net/Dealers/NLogin.aspx'),
            renewUrl: get('bein_renew_url', '/Dealers/Pages/frmSellPackages.aspx'),
            checkUrl: get('bein_check_url', '/Dealers/Pages/frmCheck.aspx'),
            signalUrl: get('bein_signal_url', '/RefreshSignal'),

            sessionTimeout: parseInt(get('worker_session_timeout', '25')),
            maxRetries: parseInt(get('worker_max_retries', '3'))
        };

        // Cache the config
        HttpClientService.configCache = {
            data: this.config,
            timestamp: Date.now()
        };

        console.log('[HTTP] Config loaded:', {
            loginUrl: this.config.loginUrl,
            checkUrl: this.config.checkUrl,
            renewUrl: this.config.renewUrl
        });
    }

    /**
     * Check if cached config is still valid
     */
    private isCacheValid(): boolean {
        if (!HttpClientService.configCache) return false;
        return (Date.now() - HttpClientService.configCache.timestamp) < HttpClientService.CONFIG_CACHE_TTL_MS;
    }

    /**
     * Reload config (with cache check)
     */
    async reloadConfig(): Promise<void> {
        if (this.isCacheValid() && HttpClientService.configCache) {
            this.config = HttpClientService.configCache.data;
            console.log('[HTTP] Using cached config');
            return;
        }
        await this.loadConfig();
    }

    // =============================================
    // HELPER METHODS
    // =============================================

    /**
     * Build full URL from relative path
     * Resolves relative paths from the login page URL (e.g., /Dealers/NLogin.aspx)
     */
    private buildFullUrl(relativePath: string): string {
        if (relativePath.startsWith('http')) return relativePath;
        try {
            // Use full login URL as base (not just origin) to correctly resolve relative paths
            // e.g., "Controls/..." from /Dealers/NLogin.aspx -> /Dealers/Controls/...
            return new URL(relativePath, this.config.loginUrl).toString();
        } catch {
            console.error(`[HTTP] Invalid URL construction: ${relativePath}`);
            return this.config.loginUrl.replace(/\/[^\/]*$/, '/') + relativePath.replace(/^\//, '');
        }
    }

    /**
     * Extract ASP.NET hidden fields from HTML
     * These are REQUIRED for every POST request
     */
    private extractHiddenFields(html: string): HiddenFields {
        const $ = cheerio.load(html);

        const viewState = $('#__VIEWSTATE').val() as string || '';
        const viewStateGen = $('#__VIEWSTATEGENERATOR').val() as string || '';
        const eventValidation = $('#__EVENTVALIDATION').val() as string || '';
        const eventTarget = $('#__EVENTTARGET').val() as string || '';
        const eventArgument = $('#__EVENTARGUMENT').val() as string || '';

        const fields: HiddenFields = {
            __VIEWSTATE: viewState,
            __VIEWSTATEGENERATOR: viewStateGen,
            __EVENTVALIDATION: eventValidation
        };

        if (eventTarget) fields.__EVENTTARGET = eventTarget;
        if (eventArgument) fields.__EVENTARGUMENT = eventArgument;

        console.log(`[HTTP] ViewState extracted: ${viewState.length} chars`);
        return fields;
    }

    /**
     * Check for ASP.NET errors hidden in HTML (even with 200 OK)
     * Returns error message if found, null otherwise
     */
    private checkForErrors(html: string): string | null {
        const $ = cheerio.load(html);

        // Check common error selectors
        const errorSelectors = [
            'span[style*="color:Red"]',
            'span[style*="color: Red"]',
            'span[style*="color:red"]',
            '.alert-danger',
            '.error-message',
            '[id*="lblError"]',
            '[id*="Error"]'
        ];

        for (const sel of errorSelectors) {
            const el = $(sel);
            if (el.length && el.text().trim()) {
                const errorText = el.text().trim();

                // Filter out non-error content (navigation menu, page elements, etc.)
                const nonErrorPatterns = [
                    'Password',
                    'Topup',
                    'OTT',
                    'Points',
                    'Rewards',
                    'Documents',
                    'Customer',
                    'Menu',
                    'Home',
                    'Dashboard',
                    'Packages',
                    'Settings'
                ];

                const isNavigation = nonErrorPatterns.some(pattern =>
                    errorText.includes(pattern)
                );

                // Only return as error if it's short enough to be an error message
                // and doesn't contain navigation patterns
                if (errorText.length > 3 && errorText.length < 200 && !isNavigation) {
                    console.log(`[HTTP] Error detected: ${errorText}`);
                    return errorText;
                }
            }
        }

        // Check for session expiry keywords
        const bodyText = $('body').text().toLowerCase();
        if (bodyText.includes('session expired') || bodyText.includes('invalid session')) {
            return 'Session Expired';
        }
        if (bodyText.includes('please login') || bodyText.includes('تسجيل الدخول')) {
            return 'Session Expired - Please login again';
        }

        return null;
    }

    /**
     * Build form data from fields object
     * Encodes properly for ASP.NET WebForms
     */
    private buildFormData(fields: Record<string, string>): URLSearchParams {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(fields)) {
            params.append(key, value);
        }
        return params;
    }

    /**
     * Extract button value from HTML
     * ASP.NET requires exact button text (e.g., 'Check' vs 'Check Now')
     */
    private extractButtonValue(html: string, buttonIdPattern: string, fallback: string): string {
        const $ = cheerio.load(html);
        const button = $(`input[id*="${buttonIdPattern}"], input[name*="${buttonIdPattern}"]`);
        if (button.length) {
            const value = button.attr('value');
            if (value) {
                console.log(`[HTTP] Button "${buttonIdPattern}" has value: "${value}"`);
                return value;
            }
        }
        console.log(`[HTTP] Button "${buttonIdPattern}" not found, using fallback: "${fallback}"`);
        return fallback;
    }

    // =============================================
    // SESSION MANAGEMENT
    // =============================================

    /**
     * Export session for Redis caching
     */
    async exportSession(): Promise<SessionData> {
        const cookieStr = await this.jar.serialize();
        return {
            cookies: JSON.stringify(cookieStr),
            viewState: this.currentViewState || undefined,
            lastLoginTime: new Date().toISOString()
        };
    }

    /**
     * Import session from Redis
     */
    async importSession(data: SessionData): Promise<void> {
        try {
            const cookieData = JSON.parse(data.cookies);
            this.jar = await CookieJar.deserialize(cookieData);

            // Recreate axios with the loaded jar
            this.axios = wrapper(axios.create({
                jar: this.jar,
                withCredentials: true,
                headers: HttpClientService.BROWSER_HEADERS,
                timeout: 30000,
                maxRedirects: 5
            }));

            // AUDIT FIX: Configure retry on recreated axios instance
            axiosRetry(this.axios, {
                retries: 3,
                retryDelay: axiosRetry.exponentialDelay,
                retryCondition: (error) =>
                    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
                    error.response?.status === 500 ||
                    error.response?.status === 502 ||
                    error.response?.status === 503
            });

            if (data.viewState) {
                this.currentViewState = data.viewState;
            }

            console.log('[HTTP] Session imported successfully');
        } catch (error) {
            console.error('[HTTP] Failed to import session:', error);
            // Reset to clean state
            this.jar = new CookieJar();
        }
    }

    /**
     * Reset session (clear cookies)
     */
    resetSession(): void {
        this.jar = new CookieJar();
        this.currentViewState = null;
        this.currentStbNumber = null;
        this.lastLoginTime = null;
        this.sessionValid = false;
        console.log('[HTTP] Session reset');
    }

    /**
     * Check if current session is still active (within timeout period)
     * Uses sessionTimeout from config (in minutes)
     */
    isSessionActive(): boolean {
        if (!this.lastLoginTime || !this.sessionValid) {
            return false;
        }

        const elapsed = Date.now() - this.lastLoginTime.getTime();
        const timeoutMs = (this.config?.sessionTimeout || 25) * 60 * 1000; // default 25 min
        const isActive = elapsed < timeoutMs;

        if (isActive) {
            console.log(`[HTTP] Session active (${Math.floor(elapsed / 60000)} min / ${this.config?.sessionTimeout || 25} min timeout)`);
        } else {
            console.log(`[HTTP] Session expired (${Math.floor(elapsed / 60000)} min ago)`);
            this.sessionValid = false;
        }

        return isActive;
    }

    /**
     * Mark session as valid after successful login
     */
    private markSessionValid(): void {
        this.lastLoginTime = new Date();
        this.sessionValid = true;
        console.log('[HTTP] Session marked as valid');
    }

    /**
     * Invalidate session when server-side expiration is detected
     * This forces a fresh login on the next request
     */
    public invalidateSession(): void {
        this.sessionValid = false;
        this.lastLoginTime = null;
        this.currentViewState = null;
        console.log('[HTTP] ⚠️ Session invalidated - will require fresh login');
    }

    // =============================================
    // LOGIN FLOW
    // =============================================

    /**
     * Login to beIN portal
     * Returns CAPTCHA image if required
     * Skips login if session is still active
     */
    async login(username: string, password: string, totpSecret?: string): Promise<LoginResult> {
        console.log(`[HTTP] Starting login for: ${username}`);

        // Check if session is still active - skip re-login
        if (this.isSessionActive()) {
            console.log('[HTTP] ✅ Session still valid, skipping login');
            return { success: true };
        }

        try {
            // Step 1: GET login page
            console.log(`[HTTP] GET ${this.config.loginUrl}`);
            const loginPageRes = await this.axios.get(this.config.loginUrl);
            console.log(`[HTTP] Login page status: ${loginPageRes.status}`);

            // Extract hidden fields
            this.currentViewState = this.extractHiddenFields(loginPageRes.data);

            // Check for CAPTCHA using database selector
            const $ = cheerio.load(loginPageRes.data);

            // Use selector from database config (e.g., Login1_ImageVerificationDealer_Image)
            // Remove any leading # to avoid duplication
            const captchaSelectorRaw = this.config.selCaptchaImg;
            const captchaSelector = captchaSelectorRaw.replace(/^#/, '');

            // Try both ID selector and partial ID match
            let captchaImg = $(`#${captchaSelector}`);
            if (!captchaImg.length) {
                captchaImg = $(`img[id*="${captchaSelector}"]`);
            }

            // Fallback to generic selectors if not found
            if (!captchaImg.length) {
                captchaImg = $('img[src*="captcha"], img[id*="Captcha"], img[id*="captcha"], img[id*="Verification"]');
            }

            console.log(`[HTTP] CAPTCHA selector: #${captchaSelector}, found: ${captchaImg.length > 0}`);

            if (captchaImg.length) {
                const captchaSrc = captchaImg.attr('src');
                console.log(`[HTTP] CAPTCHA detected, src: ${captchaSrc?.substring(0, 100)}...`);

                // Check if it's already a data URI (base64 embedded)
                if (captchaSrc?.startsWith('data:image')) {
                    // Extract base64 from data URI
                    const base64Match = captchaSrc.match(/^data:image\/[^;]+;base64,(.+)$/);
                    if (base64Match) {
                        console.log('[HTTP] CAPTCHA is embedded data URI');
                        return {
                            success: false,
                            requiresCaptcha: true,
                            captchaImage: base64Match[1] // Raw base64 without prefix
                        };
                    }
                }

                // Fetch CAPTCHA image from URL
                const captchaUrl = captchaSrc?.startsWith('http')
                    ? captchaSrc
                    : this.buildFullUrl(captchaSrc || '');

                console.log(`[HTTP] Fetching CAPTCHA from: ${captchaUrl}`);

                // Debug: Log cookies being sent by cookie jar
                const cookies = await this.jar.getCookies(captchaUrl);
                const cookieHeader = cookies.map(c => `${c.key}=${c.value}`).join('; ');
                console.log(`[HTTP] Cookie jar has ${cookies.length} cookies: ${cookieHeader.substring(0, 100)}...`);

                // Let axios-cookiejar-support handle Cookie header automatically
                const captchaRes = await this.axios.get(captchaUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'Referer': this.config.loginUrl,
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                    }
                });

                const contentType = captchaRes.headers['content-type'] || 'image/png';
                console.log(`[HTTP] CAPTCHA content-type: ${contentType}, size: ${captchaRes.data.length} bytes`);

                // Check if we got an image or HTML error page
                if (contentType.includes('text/html')) {
                    console.error('[HTTP] CAPTCHA request returned HTML instead of image - session issue');
                    // Log first 200 chars of response for debugging
                    const htmlSnippet = Buffer.from(captchaRes.data).toString('utf-8').substring(0, 200);
                    console.error(`[HTTP] Response: ${htmlSnippet}...`);
                    throw new Error('CAPTCHA fetch failed - server returned HTML');
                }

                const captchaBase64 = Buffer.from(captchaRes.data).toString('base64');

                // Note: Do NOT refresh ViewState here - it would generate a NEW CAPTCHA
                // The original ViewState from the login page is the correct one
                // that matches the CAPTCHA we just fetched

                return {
                    success: false,
                    requiresCaptcha: true,
                    captchaImage: captchaBase64
                };
            }

            // No CAPTCHA - proceed with login
            return await this.submitLogin(username, password, totpSecret);

        } catch (error: any) {
            console.error('[HTTP] Login error:', error.message);
            return { success: false, error: `Login failed: ${error.message}` };
        }
    }

    /**
     * Submit login credentials (after CAPTCHA if needed)
     */
    async submitLogin(
        username: string,
        password: string,
        totpSecret?: string,
        captchaSolution?: string
    ): Promise<LoginResult> {
        if (!this.currentViewState) {
            return { success: false, error: 'ViewState not available - call login() first' };
        }

        try {
            // Build form data
            const formData: Record<string, string> = {
                ...this.currentViewState,
                'Login1$UserName': username,
                'Login1$Password': password,
                'Login1$LoginButton': 'Sign In'
            };

            // Add 2FA if available
            if (totpSecret) {
                const totpCode = this.totp.generate(totpSecret);
                console.log(`[HTTP] Generated 2FA code: ${totpCode}`);
                formData['Login1$txt2FaCode'] = totpCode;
            }

            // AUDIT FIX: Only add CAPTCHA field if solution was provided
            // Sending empty string may trigger validation errors on beIN
            if (captchaSolution) {
                formData['Login1$ImageVerificationDealer$txtContent'] = captchaSolution;
            }

            // Step 2: POST login
            console.log('[HTTP] POST login credentials...');
            const loginRes = await this.axios.post(
                this.config.loginUrl,
                this.buildFormData(formData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': this.config.loginUrl
                    }
                }
            );

            console.log(`[HTTP] Login response: ${loginRes.status}`);

            // Check for errors in HTML
            const error = this.checkForErrors(loginRes.data);
            if (error) {
                return { success: false, error };
            }

            // Check if still on login page (login failed)
            const $ = cheerio.load(loginRes.data);
            if ($('#Login1_UserName').length || $('#Login1_LoginButton').length) {
                // Still on login page - check for specific error
                const errorSpan = $('span[style*="Red"]').first().text().trim();
                return { success: false, error: errorSpan || 'Login failed - invalid credentials' };
            }

            // Check URL for success indicators
            const finalUrl = loginRes.request?.res?.responseUrl || '';
            if (finalUrl.toLowerCase().includes('login') || finalUrl.toLowerCase().includes('error')) {
                return { success: false, error: 'Login failed - redirected to error page' };
            }

            console.log('[HTTP] ✅ Login successful!');
            this.markSessionValid();
            return { success: true };

        } catch (error: any) {
            console.error('[HTTP] Submit login error:', error.message);
            return { success: false, error: `Submit failed: ${error.message}` };
        }
    }

    // =============================================
    // CHECK CARD FLOW
    // =============================================

    /**
     * Check card on Check.aspx page
     * Extracts STB number for later use
     */
    async checkCard(cardNumber: string): Promise<CheckCardResult> {
        console.log(`[HTTP] Checking card: ${cardNumber.slice(0, 4)}****`);

        try {
            const checkUrl = this.buildFullUrl(this.config.checkUrl);

            // Step 1: GET check page
            console.log(`[HTTP] GET ${checkUrl}`);
            const checkPageRes = await this.axios.get(checkUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            // Check for session expiry
            const sessionError = this.checkForErrors(checkPageRes.data);
            if (sessionError?.includes('Session') || sessionError?.includes('login')) {
                this.invalidateSession();
                return { success: false, error: 'Session expired - please login again' };
            }

            // Extract ViewState
            this.currentViewState = this.extractHiddenFields(checkPageRes.data);

            // Get actual button value from HTML (ASP.NET may use 'Check', 'Check Now', etc.)
            const checkBtnValue = this.extractButtonValue(checkPageRes.data, 'btnCheck', 'Check');

            // Step 2: POST card number - FIXED: use tbSerial (not tbSerial1 or txtSerialNumber)
            const formData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$tbSerial': cardNumber,  // Log showed: "tbSerial" (no 1)
                'ctl00$ContentPlaceHolder1$btnCheck': checkBtnValue
            };

            console.log('[HTTP] POST check card...');
            const checkRes = await this.axios.post(
                checkUrl,
                this.buildFormData(formData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': checkUrl
                    }
                }
            );

            // Check for errors
            const error = this.checkForErrors(checkRes.data);
            if (error) {
                console.log(`[HTTP] ❌ Check card error: "${error}"`);
                return { success: false, error };
            }

            // DEBUG: Check for "Invalid Serial Number" in check page response
            const responseHtml = checkRes.data as string;
            if (responseHtml.includes('Invalid Serial') || responseHtml.includes('not found')) {
                console.log(`[HTTP] ⚠️ Check page returned invalid/not found error`);
                console.log(`[HTTP] Response preview: ${responseHtml.slice(0, 300).replace(/\s+/g, ' ')}...`);
            }

            // DEBUG: Log all inputs to see if layout is unexpected
            const $check = cheerio.load(responseHtml);
            const inputs = $check('input[type="text"]');
            console.log(`[HTTP] Check page inputs: ${inputs.length}`);
            inputs.each((i, el) => {
                console.log(`[HTTP] Input ${i}: name="${$check(el).attr('name')}" value="${$check(el).val()}"`);
            });

            // Extract STB number from response - IMPROVED patterns from Playwright
            const $ = cheerio.load(checkRes.data);
            const pageText = $('body').text();

            // Pattern 1: "STB(s): 947242535522003" (from beIN Check page)
            let stbMatch = pageText.match(/STB\(s\)[:\s]*(\d{10,})/i)?.[1];

            // Pattern 2: "STB: 947242535522003"
            if (!stbMatch) {
                stbMatch = pageText.match(/STB[:\s]+(\d{10,})/i)?.[1];
            }

            // Pattern 3: ContentPlaceHolder1_lblSerial contains "paired to STB(s): XXXXX"
            if (!stbMatch) {
                const lblSerial = $('#ContentPlaceHolder1_lblSerial').text();
                stbMatch = lblSerial.match(/STB\(s\)[:\s]*(\d{10,})/i)?.[1] ||
                    lblSerial.match(/(\d{15})/)?.[1];
            }

            // Pattern 4: Arabic label "رقم الريسيفر"
            if (!stbMatch) {
                stbMatch = pageText.match(/رقم الريسيفر[:\s]*(\d{10,})/)?.[1];
            }

            // Pattern 5: Any 15-digit number as fallback
            if (!stbMatch) {
                stbMatch = pageText.match(/(\d{15})/)?.[1];
            }

            // AUDIT FIX: Validate STB format before storing
            if (stbMatch && stbMatch.length >= 10 && /^\d+$/.test(stbMatch)) {
                this.currentStbNumber = stbMatch;
                console.log(`[HTTP] ✅ STB extracted: ${stbMatch}`);
            } else {
                console.log('[HTTP] ⚠️ STB not found in response');
            }

            // Update ViewState for next request
            this.currentViewState = this.extractHiddenFields(checkRes.data);

            return {
                success: true,
                stbNumber: this.currentStbNumber || undefined,
                cardInfo: pageText.slice(0, 200)
            };

        } catch (error: any) {
            console.error('[HTTP] Check card error:', error.message);
            return { success: false, error: `Check failed: ${error.message}` };
        }
    }

    /**
     * START RENEWAL WITH CHECK - Combined flow matching Playwright automation
     * 
     * This method mirrors the bein-automation.ts startRenewalSession() flow:
     * 1. Go to Check page first
     * 2. Validate card and extract STB number
     * 3. Then proceed to SellPackages page to load packages
     * 
     * This is the RECOMMENDED method for starting the renewal wizard.
     */
    async startRenewalWithCheck(cardNumber: string): Promise<LoadPackagesResult> {
        console.log(`[HTTP] ========== START RENEWAL WITH CHECK ==========`);
        console.log(`[HTTP] Card: ${cardNumber.slice(0, 4)}****`);

        try {
            // Step 1: Go to Check page first (like Playwright does)
            console.log(`[HTTP] Step 1: Validating card on Check page...`);
            const checkResult = await this.checkCard(cardNumber);

            if (!checkResult.success) {
                console.log(`[HTTP] ❌ Card validation failed: ${checkResult.error}`);
                return {
                    success: false,
                    packages: [],
                    error: checkResult.error || 'Card validation failed'
                };
            }

            console.log(`[HTTP] ✅ Card validated successfully`);
            if (this.currentStbNumber) {
                console.log(`[HTTP] ✅ STB extracted: ${this.currentStbNumber}`);
            } else {
                console.log(`[HTTP] ⚠️ STB not found - will try to extract later`);
            }

            // Step 2: Load packages from SellPackages page
            console.log(`[HTTP] Step 2: Loading packages from SellPackages...`);
            const packagesResult = await this.loadPackages(cardNumber);

            // Include the STB we extracted from Check page
            if (this.currentStbNumber && !packagesResult.stbNumber) {
                packagesResult.stbNumber = this.currentStbNumber;
            }

            console.log(`[HTTP] ========== RENEWAL SESSION STARTED ==========`);
            return packagesResult;

        } catch (error: any) {
            console.error(`[HTTP] Start renewal error: ${error.message}`);
            return {
                success: false,
                packages: [],
                error: `Start renewal failed: ${error.message}`
            };
        }
    }

    // =============================================
    // LOAD PACKAGES FLOW
    // =============================================

    /**
     * Load available packages from SellPackages page
     */
    async loadPackages(cardNumber: string): Promise<LoadPackagesResult> {
        console.log(`[HTTP] Loading packages for card: ${cardNumber.slice(0, 4)}****`);

        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            // Step 1: GET sell packages page
            console.log(`[HTTP] GET ${renewUrl}`);
            const pageRes = await this.axios.get(renewUrl, {
                headers: { 'Referer': this.buildFullUrl(this.config.checkUrl) }
            });

            // Check for session expiry
            const sessionError = this.checkForErrors(pageRes.data);
            if (sessionError?.includes('Session') || sessionError?.includes('login')) {
                this.invalidateSession();
                return { success: false, packages: [], error: 'Session expired' };
            }

            // Extract ViewState
            this.currentViewState = this.extractHiddenFields(pageRes.data);
            let $ = cheerio.load(pageRes.data);

            // Step 2: Select Item Type (CISCO dropdown)
            const ddlType = $('select[id*="ddlType"]');
            let ciscoValue = '';

            if (ddlType.length) {
                // Find CISCO/Smartcard option value (with fallback to first option)
                let firstOptionValue = '';
                ddlType.find('option').each((index, el) => {
                    const text = $(el).text();
                    const value = $(el).attr('value') || '';

                    // Store first non-empty option as fallback
                    if (!firstOptionValue && value) {
                        firstOptionValue = value;
                    }

                    // Prefer CISCO, Smartcard, or Humax
                    if (text.includes('CISCO') || text.includes('Smartcard') || text.includes('Humax')) {
                        ciscoValue = value;
                        console.log(`[HTTP] Found device option: value="${value}" text="${text}"`);
                    }
                });

                // Fallback to first option if CISCO not found
                if (!ciscoValue && firstOptionValue) {
                    ciscoValue = firstOptionValue;
                    console.log(`[HTTP] CISCO not found, using fallback: value="${ciscoValue}"`);
                }

                // DEBUG: Log all inputs in the SellPackages form to ensure we aren't missing anything
                console.log(`[HTTP] SellPackages Form Inputs:`);
                const formInputs = $('input, select, textarea');
                formInputs.each((i, el) => {
                    const name = $(el).attr('name');
                    const id = $(el).attr('id');
                    const val = $(el).val();
                    const type = $(el).attr('type');
                    if (name && name !== '__VIEWSTATE' && name !== '__EVENTVALIDATION') {
                        console.log(`  - [${type}] name="${name}" id="${id}" value="${val}"`);
                    }
                });

                if (ciscoValue) {
                    // POST to select CISCO
                    const selectFormData: Record<string, string> = {
                        ...this.currentViewState!,
                        '__EVENTTARGET': 'ctl00$ContentPlaceHolder1$ddlType',
                        '__EVENTARGUMENT': '',
                        'ctl00$ContentPlaceHolder1$ddlType': ciscoValue
                    };

                    console.log('[HTTP] POST select CISCO type...');
                    const selectRes = await this.axios.post(
                        renewUrl,
                        this.buildFormData(selectFormData),
                        {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': renewUrl
                            }
                        }
                    );

                    this.currentViewState = this.extractHiddenFields(selectRes.data);
                    $ = cheerio.load(selectRes.data);

                    // DEBUG: Verify CISCO selection was applied
                    const selectedValue = $('select[id*="ddlType"]').val();
                    console.log(`[HTTP] Dropdown after POST: selected value = "${selectedValue}"`);

                    // Check if tbSerial1 field appeared (it should be visible after CISCO selection)
                    const serial1Visible = $('input[id*="tbSerial1"]').length > 0;
                    console.log(`[HTTP] tbSerial1 visible after CISCO: ${serial1Visible}`);

                    // DEBUG: Check what value tbSerial1 has by default (is '7' pre-filled?)
                    const serial1DefaultValue = $('input[id*="tbSerial1"]').val() || '';
                    console.log(`[HTTP] tbSerial1 default value: "${serial1DefaultValue}"`);
                }
            }


            // Step 3: Enter serial number
            // beIN SellPackages page has "7" pre-filled in tbSerial1, BUT:
            // When we POST, we REPLACE the field value entirely!
            // So we need to send the FULL card WITHOUT last digit (check digit)
            // Example: 7511394806 → 751139480 (slice 0,-1)
            const formattedCard = cardNumber.slice(0, -1);
            console.log(`[HTTP] Card format: ${cardNumber} → ${formattedCard} (removed last digit only)`);

            // Get actual Load button value from current HTML
            const currentHtml = $.html();
            // Button name can be btnLoad or btnLoad1 (seen in logs)
            let loadBtnName = 'ctl00$ContentPlaceHolder1$btnLoad';
            let loadBtnValue = this.extractButtonValue(currentHtml, 'btnLoad', 'Load');

            if (currentHtml.includes('btnLoad1')) {
                loadBtnName = 'ctl00$ContentPlaceHolder1$btnLoad1';
                loadBtnValue = this.extractButtonValue(currentHtml, 'btnLoad1', 'Load');
                console.log(`[HTTP] Detected Load button name: btnLoad1`);
            } else {
                console.log(`[HTTP] Detected Load button name: btnLoad`);
            }

            // Step 3a: First POST - tbSerial1 + Click Load button
            // For ASP.NET WebForms, button click can be done via:
            // 1. Including button name=value (what we're doing)
            // 2. OR using __EVENTTARGET (for LinkButtons)
            // NOTE: Do NOT include tbSerial2 here - it doesn't exist yet and causes Server Error
            const firstFormData: Record<string, string> = {
                ...this.currentViewState!,
                '__EVENTTARGET': '',
                '__EVENTARGUMENT': '',
                'ctl00$ContentPlaceHolder1$ddlType': ciscoValue,
                'ctl00$ContentPlaceHolder1$tbSerial1': formattedCard,
                // tbSerial2 is NOT included here - it appears AFTER first Load click
                [loadBtnName]: loadBtnValue
            };

            // Check if page uses ScriptManager (AJAX UpdatePanel)
            const scriptManager = $('[id*="ScriptManager"], [id*="ToolkitScriptManager"]');
            if (scriptManager.length) {
                console.log(`[HTTP] ScriptManager detected - page uses AJAX`);
            }

            // DEBUG: Log the form data we're sending
            console.log(`[HTTP] Form data for Load POST [${Object.keys(firstFormData).length} fields]:`);
            for (const key of Object.keys(firstFormData)) {
                const value = firstFormData[key];
                // Show full value for small fields, truncated for large ViewState
                const showValue = value.length > 50 ? value.substring(0, 20) + '...' + value.substring(value.length - 20) : value;
                console.log(`  - ${key}: "${showValue}"`);
            }

            // Check cookies
            const cookieString = await this.jar.getCookieString(renewUrl); // Fixed: this.jar
            console.log(`[HTTP] Cookies for Load POST: ${cookieString}`);

            console.log('[HTTP] POST load packages (step 1: tbSerial1 only)...');
            let loadRes = await this.axios.post(
                renewUrl,
                this.buildFormData(firstFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                        // NOTE: Do NOT use X-Requested-With or X-MicrosoftAjax headers
                        // as they change the response format to UpdatePanel delta
                    }
                }
            );

            // DEBUG: Log first 500 chars of response to see what we got
            const responseHtml = loadRes.data as string;
            console.log(`[HTTP] Response length: ${responseHtml.length} chars`);
            // Capture any error labels immediately
            const $temp = cheerio.load(responseHtml);
            const errors = $temp('[id*="lblError"], .error, span[style*="red"]').text().trim();
            if (errors) console.log(`[HTTP] Immediate Error Check: "${errors}"`);

            console.log(`[HTTP] Response preview: ${responseHtml.slice(0, 300).replace(/\s+/g, ' ')}...`);

            // Parse response and check for tbSerial2
            this.currentViewState = this.extractHiddenFields(loadRes.data);
            $ = cheerio.load(loadRes.data);

            // DEBUG: Check page title to see where we landed
            const pageTitle = $('title').text().trim();
            console.log(`[HTTP] Page title after POST: "${pageTitle}"`);

            // Check if we got redirected to login page
            if (pageTitle.toLowerCase().includes('login') ||
                $('input[id*="Login"]').length > 0 ||
                responseHtml.includes('Login1_UserName')) {
                console.log(`[HTTP] ❌ SESSION EXPIRED - Redirected to login page!`);
                this.invalidateSession();
                return { success: false, packages: [], error: 'Session expired - please login again' };
            }

            // Check for error messages in the response - beIN uses lblError for errors
            const errorLabels = $('span[style*="red"], .error, .alert-danger, [id*="lblError"], [id*="lbl"][style*="red"], span[id*="lbl"]');
            errorLabels.each((i, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 5 && text.length < 200) {
                    console.log(`[HTTP] Label ${i}: "${text.slice(0, 100)}"`);
                }
            });

            // Check page body for common error keywords
            const bodyText = $('body').text().toLowerCase();
            if (bodyText.includes('invalid') || bodyText.includes('error') || bodyText.includes('not found')) {
                const matchedKeyword = bodyText.includes('invalid') ? 'invalid' :
                    bodyText.includes('error') ? 'error' : 'not found';
                console.log(`[HTTP] ⚠️ Page contains "${matchedKeyword}" keyword`);

                // Try to find the actual message near the keyword
                const invalidMatch = $('body').text().match(/invalid[^.]{0,50}/i);
                if (invalidMatch) {
                    console.log(`[HTTP] Context: "${invalidMatch[0]}"`);
                }
            }

            // DEBUG: Log all input fields in response
            const allInputs = $('input[type="text"]');
            console.log(`[HTTP] DEBUG: Found ${allInputs.length} text inputs after step 1`);
            allInputs.each((i, el) => {
                const id = $(el).attr('id') || '';
                const name = $(el).attr('name') || '';
                if (id.includes('Serial') || name.includes('Serial')) {
                    console.log(`[HTTP] DEBUG: Input ${i}: id="${id}" name="${name}"`);
                }
            });

            const serial2Field = $('input[id*="tbSerial2"], input[name*="tbSerial2"]');
            if (serial2Field.length > 0) {
                console.log('[HTTP] ✅ tbSerial2 field found - sending step 2...');

                // Detect the new "Load" button for Step 2 (usually btnLoad2 based on screenshots)
                const step2Html = loadRes.data as string;
                let step2BtnName = 'ctl00$ContentPlaceHolder1$btnLoad';
                let step2BtnValue = this.extractButtonValue(step2Html, 'btnLoad', 'Load');

                if (step2Html.includes('btnLoad2')) {
                    step2BtnName = 'ctl00$ContentPlaceHolder1$btnLoad2';
                    step2BtnValue = this.extractButtonValue(step2Html, 'btnLoad2', 'Load');
                    console.log(`[HTTP] Detected Step 2 Load button name: btnLoad2`);
                } else {
                    console.log(`[HTTP] Using default/previous Load button for Step 2: ${step2BtnName}`);
                }

                // Step 3b: Second POST - with both tbSerial1 and tbSerial2
                const secondFormData: Record<string, string> = {
                    ...this.currentViewState!,
                    'ctl00$ContentPlaceHolder1$ddlType': ciscoValue,
                    'ctl00$ContentPlaceHolder1$tbSerial1': formattedCard,
                    'ctl00$ContentPlaceHolder1$tbSerial2': formattedCard,
                    [step2BtnName]: step2BtnValue
                };

                console.log('[HTTP] POST load packages (step 2: tbSerial2 confirmation)...');
                loadRes = await this.axios.post(
                    renewUrl,
                    this.buildFormData(secondFormData),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Referer': renewUrl
                        }
                    }
                );
            } else {
                console.log('[HTTP] ⚠️ tbSerial2 field NOT found in response - checking for packages directly');
            }

            // Check for errors
            const loadError = this.checkForErrors(loadRes.data);
            if (loadError) {
                return { success: false, packages: [], error: loadError };
            }

            // Parse packages from response
            this.currentViewState = this.extractHiddenFields(loadRes.data);
            $ = cheerio.load(loadRes.data);

            // DEBUG: Log table structure
            const allTables = $('table');
            console.log(`[HTTP] DEBUG: Found ${allTables.length} tables`);
            allTables.each((i, table) => {
                const id = $(table).attr('id') || 'no-id';
                const rows = $(table).find('tr').length;
                if (id.includes('Package') || id.includes('gv') || rows > 2) {
                    console.log(`[HTTP] DEBUG: Table "${id}" has ${rows} rows`);
                }
            });

            const packages: AvailablePackage[] = [];

            // Try specific selectors for package table first
            // Note: Avoid generic selectors like 'table tr' as they might catch container tables
            const tableSelectors = [
                '#ContentPlaceHolder1_gvAvailablePackages tr.GridRow',
                '#ContentPlaceHolder1_gvAvailablePackages tr.GridAlternatingRow',
                '#ContentPlaceHolder1_gvAvailablePackages tr:not(.GridHeader)', // Best selector: ID + excludes header
                'table[id*="gvAvailablePackages"] tr:not(:first-child)',
                '.GridRow',
                '.GridAlternatingRow'
            ];

            // Use a Set to avoid duplicates if multiple selectors find the same rows
            // But since we pick the 'best' selector set (longest), we just need to pick the right one.
            // The issue was 'table tr:has(checkbox)' matching the OUTER row (which contains the inner table).
            // We removed that generic selector.

            let packageRows = $('__empty_selector__'); // Initialize with empty selection
            for (const sel of tableSelectors) {
                const rows = $(sel);
                // We want the set that has the most rows (likely the individual items)
                // But we must ensure we don't pick a set that includes the parent container
                if (rows.length > packageRows.length) {
                    packageRows = rows;
                }
            }

            console.log(`[HTTP] Found ${packageRows.length} package rows`);

            packageRows.each((index, row) => {
                const $row = $(row);

                // CRITICAL FIX: Skip rows that contain a table (nested/container rows)
                // This prevents the "Outer Row" from being parsed as a package
                if ($row.find('table').length > 0) {
                    console.log(`[HTTP] Skipping row ${index} - contains nested table (container row)`);
                    return;
                }

                const checkbox = $row.find('input[type="checkbox"]');

                // CRITICAL FIX 2: Skip rows with multiple checkboxes
                // The container row will find match ALL checkboxes inside it
                if (checkbox.length > 1) {
                    console.log(`[HTTP] Skipping row ${index} - contains ${checkbox.length} checkboxes (container row)`);
                    return;
                }

                if (checkbox.length === 1) {
                    const checkboxId = checkbox.attr('id') || '';
                    const checkboxName = checkbox.attr('name') || '';

                    // IMPORTANT: Log both id and name for debugging
                    console.log(`[HTTP] Checkbox ${index}: id="${checkboxId}" name="${checkboxName}"`);

                    // Extract package name
                    const nameSpan = $row.find('span[id*="lblName"]');
                    const name = nameSpan.text().trim() || `Package ${index + 1}`;

                    // Extract price (look for USD pattern)
                    const rowText = $row.text();
                    const priceMatch = rowText.match(/(\d+(?:\.\d{1,2})?)\s*USD/i);
                    const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

                    if (price > 0) {
                        packages.push({
                            index,
                            name,
                            price,
                            checkboxValue: checkboxName // Use name for POST (ASP.NET convention)
                        });
                        console.log(`[HTTP] Package ${index}: "${name}" - ${price} USD [name=${checkboxName}]`);
                    }
                }
            });

            if (packages.length === 0) {
                console.log('[HTTP] ⚠️ No packages found');
                return {
                    success: false,
                    packages: [],
                    error: 'No packages available for this card'
                };
            }

            // Extract dealer balance from page
            // "Adding Packages - Your Current Credit Balance is 435 USD"
            const pageText = $('body').text();
            const balanceMatch = pageText.match(/Current Credit Balance is (\d+(?:\.\d{1,2})?)\s*USD/i);
            const dealerBalance = balanceMatch ? parseFloat(balanceMatch[1]) : undefined;

            if (dealerBalance !== undefined) {
                console.log(`[HTTP] 💰 Dealer Balance: ${dealerBalance} USD`);
            }

            console.log(`[HTTP] ✅ Loaded ${packages.length} packages`);
            return {
                success: true,
                packages,
                stbNumber: this.currentStbNumber || undefined,
                dealerBalance  // NEW: For balance verification
            };

        } catch (error: any) {
            console.error('[HTTP] Load packages error:', error.message);
            return { success: false, packages: [], error: `Load failed: ${error.message}` };
        }
    }

    // =============================================
    // PROMO CODE FLOW
    // =============================================

    /**
     * Apply promo code and re-extract packages with updated prices
     * Matches Playwright's applyPromoAndRefreshPackages() flow
     * 
     * @param promoCode - The promo code to apply
     * @param cardNumber - Card number (for re-extracting packages)
     * @returns Updated packages with discounted prices
     */
    async applyPromoCode(promoCode: string, cardNumber: string): Promise<LoadPackagesResult> {
        console.log(`[HTTP] Applying promo code: ${promoCode}`);

        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            if (!this.currentViewState) {
                return { success: false, packages: [], error: 'ViewState not available - load packages first' };
            }

            // Step 1: POST promo code
            const promoFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$txtPromoCode': promoCode,
                'ctl00$ContentPlaceHolder1$btnPromoCode': 'Submit'
            };

            console.log('[HTTP] POST promo code submit...');
            const promoRes = await this.axios.post(
                renewUrl,
                this.buildFormData(promoFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                    }
                }
            );

            // Check for errors
            const error = this.checkForErrors(promoRes.data);
            if (error) {
                console.log(`[HTTP] ⚠️ Promo code error: ${error}`);
                return { success: false, packages: [], error };
            }

            // Update ViewState from response
            this.currentViewState = this.extractHiddenFields(promoRes.data);

            // Step 2: Re-extract packages from the response (should have updated prices)
            const $ = cheerio.load(promoRes.data);
            const packages: AvailablePackage[] = [];

            // Try specific selectors for package table first
            // Note: Avoid generic selectors like 'table tr' as they might catch container tables
            const tableSelectors = [
                '#ContentPlaceHolder1_gvAvailablePackages tr.GridRow',
                '#ContentPlaceHolder1_gvAvailablePackages tr.GridAlternatingRow',
                '#ContentPlaceHolder1_gvAvailablePackages tr:not(.GridHeader)', // Best selector: ID + excludes header
                'table[id*="gvAvailablePackages"] tr:not(:first-child)',
                '.GridRow',
                '.GridAlternatingRow'
            ];

            // Use a Set to avoid duplicates if multiple selectors find the same rows
            // But since we pick the 'best' selector set (longest), we just need to pick the right one.
            // The issue was 'table tr:has(checkbox)' matching the OUTER row (which contains the inner table).
            // We removed that generic selector.

            let packageRows = $('__empty_selector__'); // Initialize with empty selection
            for (const sel of tableSelectors) {
                const rows = $(sel);
                // We want the set that has the most rows (likely the individual items)
                // But we must ensure we don't pick a set that includes the parent container
                if (rows.length > packageRows.length) {
                    packageRows = rows;
                }
            }

            console.log(`[HTTP] Found ${packageRows.length} package rows`);

            packageRows.each((index, row) => {
                const $row = $(row);

                // CRITICAL FIX: Skip rows that contain a table (nested/container rows)
                if ($row.find('table').length > 0) {
                    console.log(`[HTTP] Skipping row ${index} - contains nested table (container row)`);
                    return;
                }

                const checkbox = $row.find('input[type="checkbox"]');

                // CRITICAL FIX 2: Skip rows with multiple checkboxes (container row)
                if (checkbox.length > 1) {
                    console.log(`[HTTP] Skipping row ${index} - contains ${checkbox.length} checkboxes (container row)`);
                    return;
                }

                if (checkbox.length === 1) {
                    const checkboxName = checkbox.attr('name') || '';
                    const nameSpan = $row.find('span[id*="lblName"]');
                    const name = nameSpan.text().trim() || `Package ${index + 1}`;

                    // Extract price (look for USD pattern)
                    const rowText = $row.text();
                    const priceMatch = rowText.match(/(\d+(?:\.\d{1,2})?)\s*USD/i);
                    const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

                    if (price > 0) {
                        packages.push({
                            index,
                            name,
                            price,
                            checkboxValue: checkboxName
                        });
                        console.log(`[HTTP] Package ${index}: "${name}" - ${price} USD (after promo)`);
                    }
                }
            });

            // Check if promo code resulted in empty packages (User Requirement)
            if (packages.length === 0) {
                console.log('[HTTP] ⚠️ No packages found after promo code - treating as invalid');

                // Check if there was a specific error message on page
                const promoError = $('[id*="lblError"], .error, span[style*="red"]').text().trim();
                if (promoError) console.log(`[HTTP] Promo Error Text: "${promoError}"`);

                return {
                    success: false,
                    packages: [],
                    error: 'No promo code found please try again'
                };
            }

            console.log(`[HTTP] ✅ Loaded ${packages.length} packages with promo code`);
            return {
                success: true,
                packages,
                stbNumber: this.currentStbNumber || undefined
            };

        } catch (error: any) {
            console.error('[HTTP] Apply promo error:', error.message);
            return { success: false, packages: [], error: `Promo failed: ${error.message}` };
        }
    }

    // =============================================
    // PURCHASE FLOW
    // =============================================

    /**
     * Complete package purchase
     * 
     * IMPORTANT: This method continues from where loadPackages() left off.
     * It uses the stored ViewState and checkbox values - NO page refresh/GET!
     * 
     * @param selectedPackage - Package to purchase (with checkboxValue from loadPackages)
     * @param promoCode - Optional promo code
     * @param stbNumber - STB number (from checkCard)
     * @param skipFinalClick - If true, stops before final OK (for user confirmation)
     */
    async completePurchase(
        selectedPackage: AvailablePackage,
        promoCode?: string,
        stbNumber?: string,
        skipFinalClick: boolean = false
    ): Promise<PurchaseResult> {
        console.log(`[HTTP] Completing purchase: ${selectedPackage.name} - ${selectedPackage.price} USD`);

        const stb = stbNumber || this.currentStbNumber;
        if (!stb) {
            return { success: false, message: 'STB number not available' };
        }

        // CRITICAL: Check we have ViewState from previous step (loadPackages)
        if (!this.currentViewState) {
            console.log('[HTTP] ❌ No ViewState available - session may have been lost');
            return {
                success: false,
                message: 'Session expired - ViewState not available. Please start a new operation.'
            };
        }

        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            // Use the checkbox value stored from loadPackages (NO GET request!)
            const checkboxValue = selectedPackage.checkboxValue;
            if (!checkboxValue) {
                return {
                    success: false,
                    message: 'No checkbox value for package - invalid package data'
                };
            }

            console.log(`[HTTP] 📦 Using stored checkbox: ${checkboxValue}`);
            console.log(`[HTTP] 📦 Using stored ViewState: ${this.currentViewState.__VIEWSTATE?.length || 0} chars`);

            // Step 1: Select checkbox + Add to cart (POST directly, no GET!)
            const addFormData: Record<string, string> = {
                ...this.currentViewState,
                [checkboxValue]: 'on',
                'ctl00$ContentPlaceHolder1$btnAddToCart': 'Add >'
            };

            // Add promo code if provided
            if (promoCode) {
                addFormData['ctl00$ContentPlaceHolder1$txtPromoCode'] = promoCode;
            }

            console.log('[HTTP] POST add to cart...');
            let res = await this.axios.post(
                renewUrl,
                this.buildFormData(addFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                    }
                }
            );

            // Check for errors in response
            const addError = this.checkForErrors(res.data);
            if (addError) {
                console.log(`[HTTP] ❌ Add to cart error: ${addError}`);
                return { success: false, message: `Add to cart failed: ${addError}` };
            }

            this.currentViewState = this.extractHiddenFields(res.data);
            console.log('[HTTP] ✅ Added to cart');

            // Step 2: Click Sell button
            const sellFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$btnSell': 'Sell'
            };

            console.log('[HTTP] POST sell...');
            res = await this.axios.post(
                renewUrl,
                this.buildFormData(sellFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                    }
                }
            );

            // Check for errors
            const sellError = this.checkForErrors(res.data);
            if (sellError) {
                console.log(`[HTTP] ❌ Sell error: ${sellError}`);
                return { success: false, message: `Sell failed: ${sellError}` };
            }

            this.currentViewState = this.extractHiddenFields(res.data);
            console.log('[HTTP] ✅ Sell clicked');

            // Step 3: Enter STB number in both fields
            // beIN uses 'tbStbSerial1' and 'tbStbSerial2' (sometimes 'toStbSerial2')
            const stbFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$tbStbSerial1': stb,
                'ctl00$ContentPlaceHolder1$tbStbSerial2': stb,
                'ctl00$ContentPlaceHolder1$toStbSerial2': stb  // Alternative field name
            };

            console.log(`[HTTP] POST STB: ${stb}`);
            res = await this.axios.post(
                renewUrl,
                this.buildFormData(stbFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                    }
                }
            );

            // Check for errors
            const stbError = this.checkForErrors(res.data);
            if (stbError) {
                console.log(`[HTTP] ❌ STB error: ${stbError}`);
                return { success: false, message: `STB entry failed: ${stbError}` };
            }

            this.currentViewState = this.extractHiddenFields(res.data);
            console.log('[HTTP] ✅ STB entered');

            // If skipFinalClick, return here for user confirmation
            if (skipFinalClick) {
                console.log('[HTTP] ⏸️ Paused for user confirmation');
                return {
                    success: true,
                    message: `Ready to confirm - ${selectedPackage.name} at ${selectedPackage.price} USD`,
                    awaitingConfirm: true
                };
            }

            // Step 4: Click OK to confirm
            return await this.confirmPurchase();

        } catch (error: any) {
            console.error('[HTTP] Purchase error:', error.message);
            return { success: false, message: `Purchase failed: ${error.message}` };
        }
    }

    /**
     * Get current dealer balance from beIN portal
     * Used for verifying if purchase actually went through
     */
    async getCurrentBalance(): Promise<number | null> {
        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            console.log('[HTTP] Fetching current balance...');
            const res = await this.axios.get(renewUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            const $ = cheerio.load(res.data);
            const pageText = $('body').text();

            // Match pattern: "Your Current Credit Balance is 435 USD"
            const balanceMatch = pageText.match(/Current Credit Balance is (\d+(?:\.\d{1,2})?)\s*USD/i);

            if (balanceMatch) {
                const balance = parseFloat(balanceMatch[1]);
                console.log(`[HTTP] 💰 Current Balance: ${balance} USD`);
                return balance;
            }

            console.log('[HTTP] ⚠️ Could not extract balance from page');
            return null;
        } catch (error: any) {
            console.error('[HTTP] Error fetching balance:', error.message);
            return null;
        }
    }

    /**
     * Confirm purchase - Full flow:
     * 1. Get balance BEFORE purchase
     * 2. Click OK button (after STB entry)
     * 3. Select "Direct Payment" radio button
     * 4. Click "Pay" button
     * 5. Get balance AFTER purchase
     * 6. SUCCESS if balance decreased, FAIL otherwise
     */
    async confirmPurchase(expectedCost?: number): Promise<PurchaseResult> {
        console.log('[HTTP] Confirming purchase...');

        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            if (!this.currentViewState) {
                return { success: false, message: 'ViewState not available' };
            }

            // ===============================================
            // STEP 0: Get BALANCE BEFORE from frmSellPackages
            // ===============================================
            console.log('[HTTP] 💰 Getting balance BEFORE purchase...');
            const balanceBefore = await this.getBalanceFromSellPackagesPage();
            console.log(`[HTTP] 💰 Balance BEFORE: ${balanceBefore !== null ? balanceBefore + ' USD' : 'unknown'}`);

            // Get STB number from queue processor context (will be passed in)
            // For now, we try to use the stored one
            const stb = this.currentStbNumber || '';

            // IMPORTANT: ASP.NET WebForms requires ALL form fields on each POST
            // Including STB fields with OK button is required
            const okFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$tbStbSerial1': stb,
                'ctl00$ContentPlaceHolder1$tbStbSerial2': stb,
                'ctl00$ContentPlaceHolder1$toStbSerial2': stb,  // Alternative field
                'ctl00$ContentPlaceHolder1$btnStbOk': 'Ok'
            };

            console.log(`[HTTP] POST confirm (Ok) with STB: ${stb}...`);
            let res = await this.axios.post(
                renewUrl,
                this.buildFormData(okFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                    }
                }
            );

            // Check for errors after OK
            const okError = this.checkForErrors(res.data);
            if (okError) {
                console.log(`[HTTP] ❌ OK button error: ${okError}`);
                return { success: false, message: okError };
            }

            // Extract ViewState for next step
            this.currentViewState = this.extractHiddenFields(res.data);
            console.log('[HTTP] ✅ OK clicked, payment options page');

            // Check if payment options page appeared
            const $ = cheerio.load(res.data);
            const pageText = $('body').text();

            // Check if already success (no payment needed)
            if (pageText.includes('Contract Created Successfully') || pageText.includes('Success')) {
                console.log('[HTTP] ✅ Purchase completed directly (no payment selection)');
                const balanceAfterDirect = await this.getBalanceFromSellPackagesPage();
                return {
                    success: true,
                    message: 'Contract Created Successfully',
                    newBalance: balanceAfterDirect || undefined
                };
            }

            // ===============================================
            // DEBUG: Log all form elements on payment page
            // ===============================================
            console.log('[HTTP] DEBUG: Inspecting payment page form elements...');

            // Find all radio buttons
            const radioButtons = $('input[type="radio"]');
            console.log(`[HTTP] DEBUG: Found ${radioButtons.length} radio buttons`);
            radioButtons.each((i, el) => {
                const name = $(el).attr('name') || 'no-name';
                const id = $(el).attr('id') || 'no-id';
                const value = $(el).attr('value') || 'no-value';
                const checked = $(el).prop('checked') ? ' [CHECKED]' : '';
                console.log(`[HTTP] DEBUG: Radio ${i}: name="${name}" id="${id}" value="${value}"${checked}`);
            });

            // Find all buttons/inputs of type submit
            const buttons = $('input[type="submit"], button, input[type="button"]');
            console.log(`[HTTP] DEBUG: Found ${buttons.length} buttons`);
            buttons.each((i, el) => {
                const name = $(el).attr('name') || 'no-name';
                const id = $(el).attr('id') || 'no-id';
                const value = $(el).attr('value') || $(el).text().trim() || 'no-value';
                console.log(`[HTTP] DEBUG: Button ${i}: name="${name}" id="${id}" value="${value}"`);
            });

            // ===============================================
            // STEP 2: Click Pay (Direct Payment is auto-selected on beIN)
            // ===============================================
            // Note: Radio button RbdDirectPay is selected by default on beIN portal
            // No need to explicitly select it, just click Pay
            const payFormData: Record<string, string> = {
                ...this.currentViewState,
                // Keep STB fields
                'ctl00$ContentPlaceHolder1$tbStbSerial1': stb,
                'ctl00$ContentPlaceHolder1$tbStbSerial2': stb,
                // Just click Pay button
                'ctl00$ContentPlaceHolder1$SRtnPay': 'Pay'
            };

            // Log what we're sending
            console.log('[HTTP] DEBUG: Pay form data:');
            for (const [key, value] of Object.entries(payFormData)) {
                if (!key.includes('VIEWSTATE') && !key.includes('EVENTVALIDATION')) {
                    console.log(`[HTTP]   - ${key}: "${value}"`);
                }
            }

            console.log('[HTTP] POST Pay (Direct Payment)...');
            res = await this.axios.post(
                renewUrl,
                this.buildFormData(payFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                    }
                }
            );

            // Check for immediate errors
            const payError = this.checkForErrors(res.data);
            if (payError) {
                console.log(`[HTTP] ❌ Pay error: ${payError}`);
                return { success: false, message: payError };
            }

            // Log response for debugging
            const $result = cheerio.load(res.data);
            const resultPageText = $result('body').text();
            console.log(`[HTTP] Pay response preview: ${resultPageText.substring(0, 300)}...`);

            // Check for error patterns in response
            const errorPatterns = [
                'insufficient balance',
                'رصيد غير كافي',
                'Insufficient Credit',
                'not available',
                'Sign In',
                'Login'
            ];

            for (const pattern of errorPatterns) {
                if (resultPageText.toLowerCase().includes(pattern.toLowerCase())) {
                    console.log(`[HTTP] ❌ Purchase failed: Page contains "${pattern}"`);
                    return { success: false, message: `Purchase failed - ${pattern}` };
                }
            }

            // ===============================================
            // STEP 3: Get BALANCE AFTER from frmSellPackages
            // ===============================================
            console.log('[HTTP] 💰 Getting balance AFTER purchase...');

            // Small delay to ensure beIN has processed the payment
            await new Promise(resolve => setTimeout(resolve, 1000));

            const balanceAfter = await this.getBalanceFromSellPackagesPage();
            console.log(`[HTTP] 💰 Balance AFTER: ${balanceAfter !== null ? balanceAfter + ' USD' : 'unknown'}`);

            // ===============================================
            // STEP 4: VERIFY SUCCESS BY BALANCE CHANGE
            // ===============================================
            if (balanceBefore !== null && balanceAfter !== null) {
                const balanceChange = balanceBefore - balanceAfter;
                console.log(`[HTTP] 💰 Balance change: ${balanceBefore} - ${balanceAfter} = ${balanceChange} USD`);

                if (balanceChange > 0) {
                    // Balance decreased = SUCCESS!
                    console.log(`[HTTP] ✅ PURCHASE CONFIRMED! Balance decreased by ${balanceChange} USD`);
                    return {
                        success: true,
                        message: `تم الشراء بنجاح - تم خصم ${balanceChange} USD`,
                        newBalance: balanceAfter
                    };
                } else if (balanceChange === 0) {
                    // Balance unchanged = FAILED
                    console.log('[HTTP] ❌ Balance unchanged - purchase did NOT go through');
                    return {
                        success: false,
                        message: 'فشل الشراء - لم يتم خصم أي رصيد من حساب beIN',
                        newBalance: balanceAfter
                    };
                } else {
                    // Balance increased? Shouldn't happen
                    console.log('[HTTP] ⚠️ Unexpected balance increase');
                    return {
                        success: false,
                        message: 'حالة غير متوقعة - برجاء التحقق يدوياً',
                        newBalance: balanceAfter
                    };
                }
            }

            // Couldn't get balance - check for success message in response
            const successPatterns = [
                'Contract Created Successfully',
                'تم إنشاء العقد بنجاح',
                'Package Added Successfully'
            ];

            for (const pattern of successPatterns) {
                if (resultPageText.includes(pattern) || res.data.includes(pattern)) {
                    console.log(`[HTTP] ✅ Success message found: "${pattern}"`);
                    return { success: true, message: pattern, newBalance: balanceAfter || undefined };
                }
            }

            // Couldn't verify - return uncertain status
            console.log('[HTTP] ⚠️ Could not verify balance - uncertain status');
            return {
                success: false,
                message: 'تعذر التحقق من حالة الشراء - برجاء التحقق يدوياً',
                newBalance: balanceAfter || undefined
            };

        } catch (error: any) {
            console.error('[HTTP] Confirm error:', error.message);
            return { success: false, message: `Confirm failed: ${error.message}` };
        }
    }

    /**
     * Get dealer balance from frmSellPackages.aspx page
     * This is the reliable source for balance
     */
    async getBalanceFromSellPackagesPage(): Promise<number | null> {
        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            const res = await this.axios.get(renewUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            const $ = cheerio.load(res.data);
            const pageText = $('body').text();

            // Match pattern: "Your Current Credit Balance is 435 USD"
            const balanceMatch = pageText.match(/Current Credit Balance is (\d+(?:\.\d{1,2})?)\s*USD/i);

            if (balanceMatch) {
                return parseFloat(balanceMatch[1]);
            }

            return null;
        } catch (error: any) {
            console.error('[HTTP] Error getting balance from sell packages page:', error.message);
            return null;
        }
    }

    /**
     * Cancel purchase (click Cancel button)
     */
    async cancelPurchase(): Promise<PurchaseResult> {
        console.log('[HTTP] Cancelling purchase...');

        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            if (!this.currentViewState) {
                return { success: false, message: 'ViewState not available' };
            }

            const cancelFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$btnStbCancel': 'Cancel'
            };

            console.log('[HTTP] POST cancel...');
            await this.axios.post(
                renewUrl,
                this.buildFormData(cancelFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                    }
                }
            );

            console.log('[HTTP] ✅ Purchase cancelled');
            return { success: true, message: 'Purchase cancelled' };

        } catch (error: any) {
            console.error('[HTTP] Cancel error:', error.message);
            return { success: false, message: `Cancel failed: ${error.message}` };
        }
    }

    // =============================================
    // GETTERS
    // =============================================

    getSTBNumber(): string | null {
        return this.currentStbNumber;
    }

    getConfig(): BeINHttpConfig {
        return this.config;
    }

    // =============================================
    // SIGNAL REFRESH FLOW (Two-Step)
    // Step 1: checkCardForSignal - Check card and show status
    // Step 2: activateSignalOnly - Click activate button
    // =============================================

    /**
     * Step 1: Check card status for signal refresh (WITHOUT activating)
     * Goes to Check page, enters card, extracts status
     * Stores ViewState for subsequent activation
     * 
     * @param cardNumber - The smart card number
     * @returns Card status without triggering activation
     */
    async checkCardForSignal(cardNumber: string): Promise<CheckCardForSignalResult> {
        console.log(`[HTTP] Checking card for signal: ${cardNumber.slice(0, 4)}****`);

        try {
            const checkUrl = this.buildFullUrl(this.config.checkUrl);

            // Step 1: GET check page
            console.log(`[HTTP] GET ${checkUrl}`);
            const checkPageRes = await this.axios.get(checkUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            // Check for session expiry
            const sessionError = this.checkForErrors(checkPageRes.data);
            if (sessionError?.includes('Session') || sessionError?.includes('login')) {
                this.invalidateSession();
                return { success: false, error: 'Session expired - please login again' };
            }

            // Extract ViewState
            this.currentViewState = this.extractHiddenFields(checkPageRes.data);

            // Get actual button value
            const checkBtnValue = this.extractButtonValue(checkPageRes.data, 'btnCheck', 'Check');

            // Step 2: POST card number to check
            const formData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$tbSerial': cardNumber,
                'ctl00$ContentPlaceHolder1$btnCheck': checkBtnValue
            };

            console.log('[HTTP] POST check card...');
            const checkRes = await this.axios.post(
                checkUrl,
                this.buildFormData(formData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': checkUrl
                    }
                }
            );

            // Check for errors
            const error = this.checkForErrors(checkRes.data);
            if (error) {
                console.log(`[HTTP] ❌ Check card error: "${error}"`);
                return { success: false, error };
            }

            // Parse response
            const $ = cheerio.load(checkRes.data);

            // CRITICAL: Store ViewState for activation step
            this.currentViewState = this.extractHiddenFields(checkRes.data);

            // Extract card status
            const pageText = $('body').text();
            const messagesDiv = $('#ContentPlaceHolder1_MessagesArea, .MessagesArea, [id*="Messages"]');
            const messageText = messagesDiv.text();

            // Check if Premium
            const isPremium = pageText.toLowerCase().includes('premium') ||
                messageText.toLowerCase().includes('premium');

            // Extract STB number
            const stbMatch = pageText.match(/STB\(s\):\s*(\d{10,})/i) ||
                pageText.match(/(\d{15})/);
            const stbNumber = stbMatch ? stbMatch[1] : '';

            // Extract expiry date
            const expiryMatch = pageText.match(/Expired?\s+(?:on\s+)?(\d{2}\/\d{2}\/\d{4})/i);
            const expiryDate = expiryMatch ? expiryMatch[1] : '';

            // Extract wallet balance
            const balanceMatch = pageText.match(/Wallet\s*balance\s*:\s*\$?(\d+(?:\.\d{2})?)/i);
            const walletBalance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

            // Get Activate button value (contains the count)
            const activateBtnValue = this.extractButtonValue(checkRes.data, 'btnActivate', 'Activate');
            console.log(`[HTTP] Button "btnActivate" value: "${activateBtnValue}"`);

            // Extract Activate count from BUTTON VALUE (e.g., "Activate ( 1 / 20 )")
            const activateMatch = activateBtnValue.match(/Activate\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
            const activateCount = activateMatch
                ? { current: parseInt(activateMatch[1]), max: parseInt(activateMatch[2]) }
                : { current: 0, max: 20 };

            const canActivate = activateCount.current < activateCount.max;

            // Extract Contracts Table
            const contracts = this.extractContractsTable($);
            console.log(`[HTTP] ✅ Card status: Premium=${isPremium}, STB=${stbNumber}, Expiry=${expiryDate}, Balance=$${walletBalance}, Activate=${activateCount.current}/${activateCount.max}, CanActivate=${canActivate}, Contracts=${contracts.length}`);

            return {
                success: true,
                cardStatus: {
                    isPremium,
                    smartCardSerial: cardNumber,
                    stbNumber,
                    expiryDate,
                    walletBalance,
                    activateCount,
                    canActivate
                },
                contracts
            };

        } catch (error: any) {
            console.error('[HTTP] Check card for signal error:', error.message);
            return { success: false, error: `Check failed: ${error.message}` };
        }
    }

    /**
     * Extract contracts/subscription history table from check page
     */
    private extractContractsTable($: cheerio.CheerioAPI): Array<{ type: string; status: string; package: string; startDate: string; expiryDate: string; invoiceNo: string; }> {
        const contracts: Array<{ type: string; status: string; package: string; startDate: string; expiryDate: string; invoiceNo: string; }> = [];

        try {
            // Find the contracts table - try multiple selectors based on beIN HTML structure
            // The table ID is like: ContentPlaceHolder1_TabContainer1_TabPanel1_ctrlContracts_GridView1
            const tableSelectors = [
                '[id*="ctrlContracts_GridView"]',
                '[id*="Contracts_GridView"]',
                'table[id*="GridView1"]',
                'table.Grid',
                '#ContentPlaceHolder1_TabContainer1_TabPanel1_ctrlContracts_GridView1'
            ];

            let table = null;
            for (const selector of tableSelectors) {
                const found = $(selector).first();
                if (found.length) {
                    table = found;
                    console.log(`[HTTP] Found contracts table with selector: ${selector}`);
                    break;
                }
            }

            if (!table || !table.length) {
                // Try finding any table inside TabContainer/TabPanel
                table = $('[id*="TabPanel"]').find('table').first();
                if (table.length) {
                    console.log('[HTTP] Found contracts table in TabPanel');
                }
            }

            if (!table || !table.length) {
                console.log('[HTTP] No contracts table found');
                return contracts;
            }

            // Get all rows - check both tr in tbody and direct tr
            const rows = table.find('tbody tr').length > 0
                ? table.find('tbody tr')
                : table.find('tr').slice(1); // Skip header row

            console.log(`[HTTP] Found ${rows.length} rows in contracts table`);

            rows.each((index, row) => {
                const cells = $(row).find('td');

                // Skip if this looks like a header row or paging row
                if (cells.length < 5) {
                    return;
                }

                // beIN table structure: first cell is icon (image), then Type, Status, Package, StartDate, ExpiryDate, InvoiceNo
                // But header row might have th instead of td

                // Find the first cell that contains text (not just an image)
                let startIndex = 0;
                for (let i = 0; i < Math.min(cells.length, 3); i++) {
                    const cellText = $(cells[i]).text().trim();
                    const hasImage = $(cells[i]).find('img').length > 0;

                    if (hasImage && !cellText) {
                        startIndex = i + 1;
                    } else if (cellText) {
                        startIndex = i;
                        break;
                    }
                }

                // Extract data - be flexible with cell positions
                const remainingCells = cells.length - startIndex;
                if (remainingCells >= 5) {
                    const contract = {
                        type: $(cells[startIndex]).text().trim(),
                        status: $(cells[startIndex + 1]).text().trim(),
                        package: $(cells[startIndex + 2]).text().trim(),
                        startDate: $(cells[startIndex + 3]).text().trim(),
                        expiryDate: $(cells[startIndex + 4]).text().trim(),
                        invoiceNo: remainingCells >= 6 ? $(cells[startIndex + 5]).text().trim() : ''
                    };

                    // Only add if has valid data (type must be a known type)
                    const validTypes = ['package', 'purchase', 'payinstallment', 'addonevent'];
                    if (contract.type && validTypes.some(t => contract.type.toLowerCase().includes(t))) {
                        contracts.push(contract);
                    }
                }
            });

            console.log(`[HTTP] Extracted ${contracts.length} contracts from table`);
        } catch (error: any) {
            console.error('[HTTP] Error extracting contracts:', error.message);
        }

        return contracts;
    }

    /**
     * Step 2: Activate signal ONLY (assumes checkCardForSignal was called first)
     * Uses stored ViewState to click the Activate button
     * 
     * @param cardNumber - The smart card number (must match previous check)
     * @returns Activation result
     */
    async activateSignalOnly(cardNumber: string): Promise<SignalRefreshResult> {
        console.log(`[HTTP] Activating signal for card: ${cardNumber.slice(0, 4)}****`);

        try {
            const checkUrl = this.buildFullUrl(this.config.checkUrl);

            // Verify we have ViewState from previous check
            if (!this.currentViewState || !this.currentViewState.__VIEWSTATE) {
                console.log('[HTTP] ⚠️ No ViewState - need to check card first');
                return { success: false, error: 'Please check card status first' };
            }

            // Get Activate button value
            // We need to re-fetch the page to get fresh ViewState and button value
            console.log('[HTTP] GET page to get fresh Activate button...');
            const pageRes = await this.axios.get(checkUrl, {
                headers: { 'Referer': checkUrl }
            });

            // Re-check the card to get fresh ViewState
            this.currentViewState = this.extractHiddenFields(pageRes.data);
            const checkBtnValue = this.extractButtonValue(pageRes.data, 'btnCheck', 'Check');

            // POST to check card again (to get to the state where Activate button is visible)
            const checkFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$tbSerial': cardNumber,
                'ctl00$ContentPlaceHolder1$btnCheck': checkBtnValue
            };

            const checkRes = await this.axios.post(
                checkUrl,
                this.buildFormData(checkFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': checkUrl
                    }
                }
            );

            // Update ViewState
            this.currentViewState = this.extractHiddenFields(checkRes.data);

            // Get Activate button info
            const activateBtnName = 'ctl00$ContentPlaceHolder1$btnActivate';
            const activateBtnValue = this.extractButtonValue(checkRes.data, 'btnActivate', 'Activate');
            console.log(`[HTTP] Button "btnActivate" value: "${activateBtnValue}"`);

            // Extract current count for comparison
            const activateMatch = activateBtnValue.match(/Activate\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
            const activateCount = activateMatch
                ? { current: parseInt(activateMatch[1]), max: parseInt(activateMatch[2]) }
                : { current: 0, max: 20 };

            // Check limit
            if (activateCount.current >= activateCount.max) {
                return {
                    success: true,
                    activated: false,
                    message: 'Daily activation limit reached',
                    cardStatus: {
                        isPremium: false,
                        smartCardSerial: cardNumber,
                        stbNumber: '',
                        expiryDate: '',
                        walletBalance: 0,
                        activateCount
                    }
                };
            }

            // POST to activate
            const activateFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$tbSerial': cardNumber,
                [activateBtnName]: activateBtnValue
            };

            console.log('[HTTP] POST activate signal...');
            const activateRes = await this.axios.post(
                checkUrl,
                this.buildFormData(activateFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': checkUrl
                    }
                }
            );

            const rawResponse = activateRes.data;
            console.log('[HTTP] Activate response length:', rawResponse.length);

            // Check for errors
            const activateError = this.checkForErrors(rawResponse);

            // Check success indicators
            const responseText = rawResponse.toLowerCase();
            const hasSuccessMessage = responseText.includes('signal sent') ||
                responseText.includes('activation signal sent') ||
                responseText.includes('successfully') ||
                responseText.includes('تم الارسال') ||
                responseText.includes('تم التفعيل') ||
                responseText.includes('تمت العملية');

            // Extract new count
            const newBtnMatch = rawResponse.match(/Activate\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
            let newActivateCount = newBtnMatch
                ? { current: parseInt(newBtnMatch[1]), max: parseInt(newBtnMatch[2]) }
                : null;

            let countIncreased = newActivateCount && newActivateCount.current > activateCount.current;

            // Verification if no clear success
            if (!countIncreased && !hasSuccessMessage) {
                console.log('[HTTP] ⚠️ No clear success indicator, verifying...');
                await new Promise(resolve => setTimeout(resolve, 500));

                const verifyRes = await this.axios.get(checkUrl, {
                    headers: { 'Referer': checkUrl }
                });

                // Re-check card
                this.currentViewState = this.extractHiddenFields(verifyRes.data);
                const verifyCheckFormData: Record<string, string> = {
                    ...this.currentViewState,
                    'ctl00$ContentPlaceHolder1$tbSerial': cardNumber,
                    'ctl00$ContentPlaceHolder1$btnCheck': this.extractButtonValue(verifyRes.data, 'btnCheck', 'Check')
                };

                const verifyCheckRes = await this.axios.post(
                    checkUrl,
                    this.buildFormData(verifyCheckFormData),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Referer': checkUrl
                        }
                    }
                );

                const verifyBtnValue = this.extractButtonValue(verifyCheckRes.data, 'btnActivate', '');
                const verifyMatch = verifyBtnValue.match(/Activate\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);

                if (verifyMatch) {
                    const verifiedCount = parseInt(verifyMatch[1]);
                    if (verifiedCount > activateCount.current) {
                        console.log(`[HTTP] ✅ Verified: count increased ${activateCount.current} → ${verifiedCount}`);
                        countIncreased = true;
                        newActivateCount = { current: verifiedCount, max: parseInt(verifyMatch[2]) };
                    }
                }
            }

            const isSuccess = countIncreased || hasSuccessMessage;

            if (isSuccess) {
                console.log('[HTTP] ✅ Signal activated successfully!');
                return {
                    success: true,
                    activated: true,
                    message: 'تم تفعيل الإشارة بنجاح',
                    cardStatus: {
                        isPremium: false,
                        smartCardSerial: cardNumber,
                        stbNumber: '',
                        expiryDate: '',
                        walletBalance: 0,
                        activateCount: newActivateCount || { current: activateCount.current + 1, max: activateCount.max }
                    }
                };
            } else {
                console.log('[HTTP] ❌ Activation failed');
                return {
                    success: true,
                    activated: false,
                    error: activateError || 'لم يتم التفعيل - حاول مرة أخرى',
                    cardStatus: {
                        isPremium: false,
                        smartCardSerial: cardNumber,
                        stbNumber: '',
                        expiryDate: '',
                        walletBalance: 0,
                        activateCount: newActivateCount || activateCount
                    }
                };
            }

        } catch (error: any) {
            console.error('[HTTP] Signal activation error:', error.message);
            return { success: false, error: `Activation failed: ${error.message}` };
        }
    }

    /**
     * Activate signal refresh for a card (LEGACY - combined check + activate)
     * Goes to Check page, enters card, extracts status, and clicks Activate
     * 
     * @param cardNumber - The smart card number
     * @returns Signal refresh result with card status and activation result
     */
    async activateSignal(cardNumber: string): Promise<SignalRefreshResult> {
        console.log(`[HTTP] Activating signal for card: ${cardNumber.slice(0, 4)}****`);

        try {
            const checkUrl = this.buildFullUrl(this.config.checkUrl);

            // Step 1: GET check page
            console.log(`[HTTP] GET ${checkUrl}`);
            const checkPageRes = await this.axios.get(checkUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            // Check for session expiry
            const sessionError = this.checkForErrors(checkPageRes.data);
            if (sessionError?.includes('Session') || sessionError?.includes('login')) {
                this.invalidateSession();
                return { success: false, error: 'Session expired - please login again' };
            }

            // Extract ViewState
            this.currentViewState = this.extractHiddenFields(checkPageRes.data);

            // Get actual button value
            const checkBtnValue = this.extractButtonValue(checkPageRes.data, 'btnCheck', 'Check');

            // Step 2: POST card number to check
            const formData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$tbSerial': cardNumber,
                'ctl00$ContentPlaceHolder1$btnCheck': checkBtnValue
            };

            console.log('[HTTP] POST check card for signal...');
            const checkRes = await this.axios.post(
                checkUrl,
                this.buildFormData(formData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': checkUrl
                    }
                }
            );

            // Check for errors
            const error = this.checkForErrors(checkRes.data);
            if (error) {
                console.log(`[HTTP] ❌ Check card error: "${error}"`);
                return { success: false, error };
            }

            // Parse response
            const $ = cheerio.load(checkRes.data);
            this.currentViewState = this.extractHiddenFields(checkRes.data);

            // Extract card status
            const pageText = $('body').text();
            const messagesDiv = $('#ContentPlaceHolder1_MessagesArea, .MessagesArea, [id*="Messages"]');
            const messageText = messagesDiv.text();

            // Check if Premium
            const isPremium = pageText.toLowerCase().includes('premium') ||
                messageText.toLowerCase().includes('premium');

            // Extract STB number
            const stbMatch = pageText.match(/STB\(s\):\s*(\d{10,})/i) ||
                pageText.match(/(\d{15})/);
            const stbNumber = stbMatch ? stbMatch[1] : '';

            // Extract expiry date
            const expiryMatch = pageText.match(/Expired?\s+(?:on\s+)?(\d{2}\/\d{2}\/\d{4})/i);
            const expiryDate = expiryMatch ? expiryMatch[1] : '';

            // Extract wallet balance
            const balanceMatch = pageText.match(/Wallet\s*balance\s*:\s*\$?(\d+(?:\.\d{2})?)/i);
            const walletBalance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

            // Step 3: Get Activate button value FIRST (contains the count)
            const activateBtnName = 'ctl00$ContentPlaceHolder1$btnActivate';
            const activateBtnValue = this.extractButtonValue(checkRes.data, 'btnActivate', 'Activate');
            console.log(`[HTTP] Button "btnActivate" value: "${activateBtnValue}"`);

            // Extract Activate count from BUTTON VALUE (e.g., "Activate ( 1 / 20 )")
            // NOT from pageText since button text may not appear in body.text()
            const activateMatch = activateBtnValue.match(/Activate\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
            const activateCount = activateMatch
                ? { current: parseInt(activateMatch[1]), max: parseInt(activateMatch[2]) }
                : { current: 0, max: 20 };

            console.log(`[HTTP] Card status: Premium=${isPremium}, STB=${stbNumber}, Expiry=${expiryDate}, Balance=$${walletBalance}, Activate=${activateCount.current}/${activateCount.max}`);

            // Check if we can activate (limit reached)
            if (activateCount.current >= activateCount.max) {
                return {
                    success: true,
                    cardStatus: {
                        isPremium,
                        smartCardSerial: cardNumber,
                        stbNumber,
                        expiryDate,
                        walletBalance,
                        activateCount
                    },
                    activated: false,
                    message: 'Daily activation limit reached'
                };
            }

            if (!activateBtnValue || activateBtnValue === 'Activate') {
                // Try to find actual button
                const btnEl = $('input[id*="btnActivate"], button[id*="btnActivate"]');
                if (btnEl.length === 0) {
                    console.log('[HTTP] ⚠️ Activate button not found');
                    return {
                        success: true,
                        cardStatus: {
                            isPremium,
                            smartCardSerial: cardNumber,
                            stbNumber,
                            expiryDate,
                            walletBalance,
                            activateCount
                        },
                        activated: false,
                        error: 'Activate button not found on page'
                    };
                }
            }

            // Standard Layout Submit Button (input type="submit")
            // This requires the button name and value to be in the body
            // ALSO: Must include the 'tbSerial' input field, otherwise server might see it as empty/reset
            const activateFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$tbSerial': cardNumber,
                // For submit buttons, we MUST send name=value
                [activateBtnName]: activateBtnValue
            };

            // Remove __EVENTTARGET/ARGUMENT if they exist in viewstate or previous logic
            if (activateFormData['__EVENTTARGET']) delete activateFormData['__EVENTTARGET'];
            if (activateFormData['__EVENTARGUMENT']) delete activateFormData['__EVENTARGUMENT'];

            console.log('[HTTP] POST activate signal (submit button)...');
            console.log(`[HTTP] Button param: ${activateBtnName}="${activateBtnValue}"`);
            console.log(`[HTTP] Card param: ctl00$ContentPlaceHolder1$tbSerial="${cardNumber}"`);
            const activateRes = await this.axios.post(
                checkUrl,
                this.buildFormData(activateFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': checkUrl
                    }
                }
            );

            // ASP.NET UpdatePanel returns a delta response, not full HTML
            // Format: length|type|id|content|length|type|id|content|...
            // Look for success indicators in the raw response
            const rawResponse = activateRes.data;

            // DEBUG: Log more of the response to understand its format
            console.log('[HTTP] Activate response length:', rawResponse.length);
            console.log('[HTTP] Activate response (first 500 chars):', rawResponse.substring(0, 500).replace(/\s+/g, ' '));

            // Check for success

            // For UpdatePanel responses, look for error patterns in the raw delta
            const activateError = this.checkForErrors(rawResponse);

            // Detect response type: Full HTML or Delta
            const isFullHtml = rawResponse.includes('<!DOCTYPE') || rawResponse.includes('<html');
            const isDeltaFormat = rawResponse.startsWith('1|#|') || rawResponse.includes('|hiddenField|__VIEWSTATE|');

            console.log(`[HTTP] Response type: ${isFullHtml ? 'Full HTML' : isDeltaFormat ? 'Delta' : 'Unknown'}`);

            let newActivateCount: { current: number; max: number } | null = null;

            if (isFullHtml) {
                // Parse full HTML response with cheerio
                const $response = cheerio.load(rawResponse);
                const newBtnValue = this.extractButtonValue(rawResponse, 'btnActivate', '');
                console.log(`[HTTP] New button value from HTML: "${newBtnValue}"`);

                const newMatch = newBtnValue.match(/Activate\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
                newActivateCount = newMatch
                    ? { current: parseInt(newMatch[1]), max: parseInt(newMatch[2]) }
                    : null;
            } else {
                // Try regex on delta response
                const newActivateMatch = rawResponse.match(/Activate\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
                newActivateCount = newActivateMatch
                    ? { current: parseInt(newActivateMatch[1]), max: parseInt(newActivateMatch[2]) }
                    : null;
            }

            console.log(`[HTTP] Activate count: before=${activateCount.current}/${activateCount.max}, after=${newActivateCount?.current}/${newActivateCount?.max}`);

            // SUCCESS DETECTION:
            const responseText = rawResponse.toLowerCase();

            // Check for success messages (English and Arabic)
            const hasSuccessMessage = responseText.includes('signal sent') ||
                responseText.includes('activation signal sent') ||
                responseText.includes('successfully') ||
                responseText.includes('تم الارسال') ||  // Arabic: "Sent"
                responseText.includes('تم التفعيل') ||  // Arabic: "Activated"
                responseText.includes('تمت العملية');   // Arabic: "Operation completed"

            let countIncreased = newActivateCount && newActivateCount.current > activateCount.current;

            console.log(`[HTTP] Initial success detection: message=${hasSuccessMessage}, countChanged=${countIncreased}`);

            // STRICT SUCCESS: If count didn't increase and no success message, verify with a fresh GET
            if (!countIncreased && !hasSuccessMessage) {
                console.log('[HTTP] ⚠️ No clear success indicator from response, sending verification request...');

                try {
                    // Wait a moment for server to process
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Re-GET the check page to verify the actual count
                    const verifyRes = await this.axios.get(checkUrl, {
                        headers: { 'Referer': checkUrl }
                    });

                    const verifyBtnValue = this.extractButtonValue(verifyRes.data, 'btnActivate', '');
                    console.log(`[HTTP] Verification button value: "${verifyBtnValue}"`);

                    const verifyMatch = verifyBtnValue.match(/Activate\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);

                    if (verifyMatch) {
                        const verifiedCount = parseInt(verifyMatch[1]);
                        const verifiedMax = parseInt(verifyMatch[2]);

                        console.log(`[HTTP] Verified count: ${verifiedCount}/${verifiedMax} (was ${activateCount.current}/${activateCount.max})`);

                        if (verifiedCount > activateCount.current) {
                            console.log(`[HTTP] ✅ Verification confirmed: count increased ${activateCount.current} → ${verifiedCount}`);
                            countIncreased = true;
                            newActivateCount = { current: verifiedCount, max: verifiedMax };
                        } else {
                            console.log(`[HTTP] ❌ Verification failed: count did not increase`);
                        }
                    }
                } catch (verifyError: any) {
                    console.log(`[HTTP] ⚠️ Verification request failed: ${verifyError.message}`);
                }
            }

            // STRICT SUCCESS: Only count as success if count ACTUALLY increased OR explicit success message
            const isSuccess = countIncreased || hasSuccessMessage;

            console.log(`[HTTP] Final success determination: isSuccess=${isSuccess}, countIncreased=${countIncreased}, hasSuccessMessage=${hasSuccessMessage}`);

            if (isSuccess) {
                console.log('[HTTP] ✅ Signal activated successfully!');
                return {
                    success: true,
                    cardStatus: {
                        isPremium,
                        smartCardSerial: cardNumber,
                        stbNumber,
                        expiryDate,
                        walletBalance,
                        activateCount: newActivateCount || { current: activateCount.current + 1, max: activateCount.max }
                    },
                    activated: true,
                    message: 'Activation Signal Sent'
                };
            } else {
                console.log(`[HTTP] ❌ Activation failed: count did not increase, no success message`);
                return {
                    success: true,
                    cardStatus: {
                        isPremium,
                        smartCardSerial: cardNumber,
                        stbNumber,
                        expiryDate,
                        walletBalance,
                        activateCount: newActivateCount || activateCount
                    },
                    activated: false,
                    error: activateError || 'Activation did not complete - please try again'
                };
            }

        } catch (error: any) {
            console.error('[HTTP] Signal activation error:', error.message);
            return { success: false, error: `Signal activation failed: ${error.message}` };
        }
    }
}
