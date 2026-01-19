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
    SessionData
} from './types';

export class HttpClientService {
    private axios: AxiosInstance;
    private jar: CookieJar;
    private config!: BeINHttpConfig;
    private totp: TOTPGenerator;

    // Current page state
    private currentViewState: HiddenFields | null = null;
    private currentStbNumber: string | null = null;

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
     */
    private buildFullUrl(relativePath: string): string {
        if (relativePath.startsWith('http')) return relativePath;
        try {
            const baseUrl = new URL(this.config.loginUrl).origin;
            return new URL(relativePath, baseUrl).toString();
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
                // Filter out non-error content
                if (errorText.length > 3 && !errorText.includes('Password')) {
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
        console.log('[HTTP] Session reset');
    }

    // =============================================
    // LOGIN FLOW
    // =============================================

    /**
     * Login to beIN portal
     * Returns CAPTCHA image if required
     */
    async login(username: string, password: string, totpSecret?: string): Promise<LoginResult> {
        console.log(`[HTTP] Starting login for: ${username}`);

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
            const captchaSelector = this.config.selCaptchaImg;
            let captchaImg = $(`#${captchaSelector}, img[id*="${captchaSelector}"]`);

            // Fallback to generic selectors if not found
            if (!captchaImg.length) {
                captchaImg = $('img[src*="captcha"], img[id*="Captcha"], img[id*="captcha"], img[id*="Verification"]');
            }

            console.log(`[HTTP] CAPTCHA selector: ${captchaSelector}, found: ${captchaImg.length > 0}`);

            if (captchaImg.length) {
                const captchaSrc = captchaImg.attr('src');
                console.log('[HTTP] CAPTCHA detected, fetching image...');

                // Fetch CAPTCHA image
                const captchaUrl = captchaSrc?.startsWith('http')
                    ? captchaSrc
                    : this.buildFullUrl(captchaSrc || '');

                const captchaRes = await this.axios.get(captchaUrl, {
                    responseType: 'arraybuffer'
                });

                const captchaBase64 = Buffer.from(captchaRes.data).toString('base64');

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

            // Add CAPTCHA if provided
            if (captchaSolution) {
                formData['Login1$txtCaptcha'] = captchaSolution;
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
                return { success: false, error: 'Session expired - please login again' };
            }

            // Extract ViewState
            this.currentViewState = this.extractHiddenFields(checkPageRes.data);

            // Get actual button value from HTML (ASP.NET may use 'Check', 'Check Now', etc.)
            const checkBtnValue = this.extractButtonValue(checkPageRes.data, 'btnCheck', 'Check');

            // Step 2: POST card number
            const formData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$txtSerialNumber': cardNumber,
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
                return { success: false, error };
            }

            // Extract STB number from response
            const $ = cheerio.load(checkRes.data);

            // Pattern 1: "STB(s): 947242535522003"
            const pageText = $('body').text();
            let stbMatch = pageText.match(/STB\(s\)[:\s]*(\d{10,})/i)?.[1];

            // Pattern 2: Label containing STB
            if (!stbMatch) {
                stbMatch = $('#ContentPlaceHolder1_lblSerial').text().match(/(\d{15})/)?.[1];
            }

            // Pattern 3: Any 15-digit number
            if (!stbMatch) {
                stbMatch = pageText.match(/(\d{15})/)?.[1];
            }

            if (stbMatch) {
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
                return { success: false, packages: [], error: 'Session expired' };
            }

            // Extract ViewState
            this.currentViewState = this.extractHiddenFields(pageRes.data);
            let $ = cheerio.load(pageRes.data);

            // Step 2: Select Item Type (CISCO dropdown)
            const ddlType = $('select[id*="ddlType"]');
            let ciscoValue = '';

            if (ddlType.length) {
                // Find CISCO option value
                ddlType.find('option').each((_, el) => {
                    const text = $(el).text();
                    const value = $(el).attr('value') || '';
                    if (text.includes('CISCO') || text.includes('Smartcard')) {
                        ciscoValue = value;
                        console.log(`[HTTP] Found CISCO option: value="${value}" text="${text}"`);
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
                }
            }

            // Step 3: Enter serial number (remove last digit)
            const formattedCard = cardNumber.slice(0, -1);
            console.log(`[HTTP] Using formatted card (9 digits): ${formattedCard.slice(0, 4)}****`);

            // Get actual Load button value from current HTML
            const currentHtml = $.html();
            const loadBtnValue = this.extractButtonValue(currentHtml, 'btnLoad', 'Load');

            const serialFormData: Record<string, string> = {
                ...this.currentViewState!,
                'ctl00$ContentPlaceHolder1$tbSerial1': formattedCard,
                'ctl00$ContentPlaceHolder1$tbSerial2': formattedCard,
                'ctl00$ContentPlaceHolder1$btnLoad': loadBtnValue
            };

            console.log('[HTTP] POST load packages...');
            const loadRes = await this.axios.post(
                renewUrl,
                this.buildFormData(serialFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                    }
                }
            );

            // Check for errors
            const loadError = this.checkForErrors(loadRes.data);
            if (loadError) {
                return { success: false, packages: [], error: loadError };
            }

            // Parse packages from response
            this.currentViewState = this.extractHiddenFields(loadRes.data);
            $ = cheerio.load(loadRes.data);

            const packages: AvailablePackage[] = [];
            const packageRows = $('table[id*="gvAvailablePackages"] tr.GridRow, table[id*="gvAvailablePackages"] tr.GridAlternatingRow');

            console.log(`[HTTP] Found ${packageRows.length} package rows`);

            packageRows.each((index, row) => {
                const $row = $(row);
                const checkbox = $row.find('input[type="checkbox"]');

                if (checkbox.length) {
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

            console.log(`[HTTP] ✅ Loaded ${packages.length} packages`);
            return {
                success: true,
                packages,
                stbNumber: this.currentStbNumber || undefined
            };

        } catch (error: any) {
            console.error('[HTTP] Load packages error:', error.message);
            return { success: false, packages: [], error: `Load failed: ${error.message}` };
        }
    }

    // =============================================
    // PURCHASE FLOW
    // =============================================

    /**
     * Complete package purchase
     * @param selectedPackage - Package to purchase
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

        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            if (!this.currentViewState) {
                return { success: false, message: 'ViewState not available' };
            }

            // Step 1: Select checkbox + Add to cart
            const addFormData: Record<string, string> = {
                ...this.currentViewState,
                [selectedPackage.checkboxValue]: 'on', // Check the checkbox
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

            this.currentViewState = this.extractHiddenFields(res.data);

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

            this.currentViewState = this.extractHiddenFields(res.data);

            // Step 3: Enter STB number
            const stbFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$tbStbSerial1': stb,
                'ctl00$ContentPlaceHolder1$toStbSerial2': stb // Note: "to" not "tb" for second field
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

            this.currentViewState = this.extractHiddenFields(res.data);

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
     * Confirm purchase (click OK button)
     */
    async confirmPurchase(): Promise<PurchaseResult> {
        console.log('[HTTP] Confirming purchase...');

        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            if (!this.currentViewState) {
                return { success: false, message: 'ViewState not available' };
            }

            const okFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$btnStbOk': 'Ok'
            };

            console.log('[HTTP] POST confirm (Ok)...');
            const res = await this.axios.post(
                renewUrl,
                this.buildFormData(okFormData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': renewUrl
                    }
                }
            );

            // Check for errors
            const error = this.checkForErrors(res.data);
            if (error) {
                return { success: false, message: error };
            }

            // Check for success indicators
            const $ = cheerio.load(res.data);
            const successMsg = $('.alert-success, [class*="success"]').text().trim();

            if (successMsg) {
                console.log(`[HTTP] ✅ Purchase confirmed: ${successMsg}`);
                return { success: true, message: successMsg };
            }

            // Check page content
            const pageText = $('body').text().toLowerCase();
            if (pageText.includes('success') || pageText.includes('تم')) {
                console.log('[HTTP] ✅ Purchase confirmed');
                return { success: true, message: 'Purchase completed successfully' };
            }

            console.log('[HTTP] ✅ Purchase completed (no explicit message)');
            return { success: true, message: 'Purchase completed' };

        } catch (error: any) {
            console.error('[HTTP] Confirm error:', error.message);
            return { success: false, message: `Confirm failed: ${error.message}` };
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
}
