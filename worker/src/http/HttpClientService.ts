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
import { getProxyManager, ProxyConfig } from '../utils/proxy-manager';
// FIX: Import createCookieAgent for proper proxy + cookie integration
import { createCookieAgent } from 'http-cookie-agent/http';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
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
    private lastInstallmentPageHtml: string | null = null;  // Stored by loadInstallment for payInstallment

    // Session tracking for persistent login
    private lastLoginTime: Date | null = null;
    private sessionValid: boolean = false;
    private sessionExpiresAt: number | null = null;  // Unix timestamp (ms) for reliable expiry tracking

    // Proxy config for manual proxy
    private proxyConfig: ProxyConfig | null = null;

    // Config caching
    private static configCache: { data: BeINHttpConfig; timestamp: number } | null = null;
    private static readonly CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    // Default session timeout: 15 minutes (conservative)
    private static readonly DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000;

    // Browser-like headers (matching old working project)
    // NOTE: Sec-Fetch-* headers were REMOVED because:
    // 1. Old project works perfectly without them
    // 2. Akamai may detect inconsistent header combinations
    // 3. Simpler header set = less chance of detection
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

    constructor(proxyConfig?: ProxyConfig) {
        this.jar = new CookieJar();
        this.totp = new TOTPGenerator();
        this.proxyConfig = proxyConfig || null;

        // Build axios config
        const axiosConfig: Record<string, unknown> = {
            jar: this.jar,  // Required for wrapper() when no proxy
            withCredentials: true,
            headers: HttpClientService.BROWSER_HEADERS,
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: (status: number) => status < 500
        };

        // FIX: Proper cookie handling with proxy using createCookieAgent()
        // This properly integrates cookies during redirect chains (required for Akamai)
        if (proxyConfig) {
            // PROXY MODE: Use createCookieAgent to wrap proxy agent with cookie support
            const proxyManager = getProxyManager();
            const proxyUrl = proxyManager.buildProxyUrlFromConfig(proxyConfig);
            const proxyType = proxyConfig.proxyType || 'socks5';

            // Create a cookie-aware agent that wraps the proxy agent
            // This ensures cookies are properly handled during redirect chains
            if (proxyType === 'socks5') {
                const SocksCookieAgent = createCookieAgent(SocksProxyAgent);
                axiosConfig.httpsAgent = new SocksCookieAgent(proxyUrl, {
                    cookies: { jar: this.jar }
                });
            } else {
                const HttpsCookieAgent = createCookieAgent(HttpsProxyAgent);
                axiosConfig.httpsAgent = new HttpsCookieAgent(proxyUrl, {
                    cookies: { jar: this.jar }
                });
            }

            axiosConfig.proxy = false; // Disable axios built-in proxy

            // Create axios instance - cookie handling is done by the agent
            this.axios = axios.create(axiosConfig);
            console.log(`[HTTP] Using proxy: ${proxyManager.getMaskedProxyUrlFromConfig(proxyConfig)} (cookie-aware agent)`);
        } else {
            // NO PROXY MODE: Use wrapper() for automatic cookie handling
            this.axios = wrapper(axios.create(axiosConfig));
            console.log('[HTTP] No proxy - using wrapper() for automatic cookie handling');
        }

        this.setupAxiosRetry();
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
            // AUDIT FIX 1.2: Configurable CAPTCHA solution field with fallback
            selCaptchaSolution: get('bein_sel_captcha_solution', 'Login1$ImageVerificationDealer$txtContent'),

            loginUrl: get('bein_login_url', 'https://sbs.beinsports.net/Dealers/NLogin.aspx'),
            renewUrl: get('bein_renew_url', '/Dealers/Pages/frmSellPackages.aspx'),
            checkUrl: get('bein_check_url', '/Dealers/Pages/frmCheck.aspx'),
            signalUrl: get('bein_signal_url', '/RefreshSignal'),
            installmentUrl: get('bein_installment_url', '/Dealers/Pages/frmPayMonthlyInstallment.aspx'),

            sessionTimeout: parseInt(get('worker_session_timeout', '15')),
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

    // NOTE: setupCookieInterceptors() was REMOVED because it didn't work with proxies.
    // Manual cookie interceptors don't capture cookies during HTTP redirect chains,
    // which Akamai uses for session validation. We now use createCookieAgent() from
    // 'http-cookie-agent/http' which properly wraps the proxy agent with cookie support.
    // See constructor and importSession() for the new implementation.

    /**
     * Setup axios retry configuration
     * AUDIT FIX 5.1: Extracted to avoid duplication in constructor and importSession
     */
    private setupAxiosRetry(): void {
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
     * Build full URL from relative path
     * Resolves relative paths from the login page URL (e.g., /Dealers/NLogin.aspx)
     */
    private buildFullUrl(relativePath: string): string {
        if (relativePath.startsWith('http')) return relativePath;
        const baseUrl = this.config?.loginUrl || 'https://sbs.beinsports.net/Dealers/NLogin.aspx';

        try {
            // Use full login URL as base (not just origin) to correctly resolve relative paths
            return new URL(relativePath, baseUrl).toString();
        } catch {
            console.error(`[HTTP] Invalid URL construction: ${relativePath}`);
            return baseUrl.replace(/\/[^\/]*$/, '/') + relativePath.replace(/^\//, '');
        }
    }

    /**
     * Build POST request headers
     * NOTE: We only add Content-Type, Referer, Origin
     * The BROWSER_HEADERS are already set as axios defaults
     * This matches the old working project pattern
     * @param refererUrl - The URL to use as Referer and Origin base
     */
    private buildPostHeaders(refererUrl: string): Record<string, string> {
        return {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': refererUrl,
            'Origin': new URL(refererUrl).origin
        };
    }

    /**
     * Extract ASP.NET hidden fields from HTML
     * These are REQUIRED for every POST request
     * 
     * ViewState Length Guide:
     * - Login page: ~500-700 chars (small)
     * - Check results page: 1500-3000+ chars (large with card data)
     * - SellPackages page: 2000-5000+ chars (large with packages grid)
     */
    private extractHiddenFields(html: string): HiddenFields {
        const $ = cheerio.load(html);

        const viewState = $('#__VIEWSTATE').val() as string || '';
        const viewStateGen = $('#__VIEWSTATEGENERATOR').val() as string || '';
        const eventValidation = $('#__EVENTVALIDATION').val() as string || '';
        const eventTarget = $('#__EVENTTARGET').val() as string || '';
        const eventArgument = $('#__EVENTARGUMENT').val() as string || '';
        const lastFocus = $('#__LASTFOCUS').val() as string || '';

        const fields: HiddenFields = {
            __VIEWSTATE: viewState,
            __VIEWSTATEGENERATOR: viewStateGen,
            __EVENTVALIDATION: eventValidation,
            __LASTFOCUS: lastFocus  // Required for some ASP.NET postbacks
        };

        if (eventTarget) fields.__EVENTTARGET = eventTarget;
        if (eventArgument) fields.__EVENTARGUMENT = eventArgument;

        // AUDIT FIX 2.3: Validate extracted fields
        if (!viewState || viewState.length < 100) {
            console.warn(`[HTTP] WARNING: ViewState appears invalid or missing (length: ${viewState.length})`);
        }
        if (!eventValidation) {
            console.warn('[HTTP] WARNING: EventValidation is missing - POST requests may fail');
        }

        // ViewState length analysis for debugging
        // Login page typically has 500-700 chars, results page has 1500+ chars
        const viewStateCategory = viewState.length < 800 ? '⚠️ SMALL (likely login page)' :
            viewState.length < 1500 ? '📄 MEDIUM' :
                '✅ LARGE (likely results page)';
        console.log(`[HTTP] ViewState extracted: ${viewState.length} chars ${viewStateCategory}`);

        return fields;
    }

    /**
     * Extract packages from HTML table
     * AUDIT FIX 5.2: Extracted to avoid duplication in loadPackages and applyPromoCode
     * @param $ - Cheerio instance loaded with HTML
     * @param logPrefix - Prefix for log messages (e.g., '' or 'after promo')
     */
    private extractPackagesFromHtml($: cheerio.CheerioAPI, logPrefix: string = ''): AvailablePackage[] {
        const packages: AvailablePackage[] = [];

        // Try specific selectors for package table first
        const tableSelectors = [
            '#ContentPlaceHolder1_gvAvailablePackages tr.GridRow',
            '#ContentPlaceHolder1_gvAvailablePackages tr.GridAlternatingRow',
            '#ContentPlaceHolder1_gvAvailablePackages tr:not(.GridHeader)',
            'table[id*="gvAvailablePackages"] tr:not(:first-child)',
            '.GridRow',
            '.GridAlternatingRow'
        ];

        let packageRows = $('__empty_selector__'); // Initialize with empty selection
        for (const sel of tableSelectors) {
            const rows = $(sel);
            if (rows.length > packageRows.length) {
                packageRows = rows;
            }
        }

        console.log(`[HTTP] Found ${packageRows.length} package rows${logPrefix ? ` ${logPrefix}` : ''}`);

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
                const checkboxId = checkbox.attr('id') || '';
                const checkboxName = checkbox.attr('name') || '';

                // Log both id and name for debugging
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
                    console.log(`[HTTP] Package ${index}: "${name}" - ${price} USD${logPrefix ? ` ${logPrefix}` : ''}`);
                }
            }
        });

        return packages;
    }

    /**
     * Check for ASP.NET errors hidden in HTML (even with 200 OK)
     * Returns error message if found, null otherwise
     */
    private checkForErrors(html: string): string | null {
        const $ = cheerio.load(html);

        const errorSelectors = [
            'span[style*="color:Red"]',
            'span[style*="color: Red"]',
            '.alert-danger',
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
                    'Settings',
                    // QPay section has pre-filled error from dealer settings - not relevant to renewal flow
                    'Mobile number is required',
                    'valid mobile number'
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

        // NOTE: Removed "enter the following code" check - it caused false positives
        // during login flow when login fails and returns login page with new CAPTCHA.
        // Login page detection is handled separately in submitLogin().

        return null;
    }

    /**
     * AUDIT FIX 2.1: Title-first session expiry detection
     * 
     * Strategy: Check page TITLE first before checking for login form elements.
     * This prevents false positives on valid pages like "Finance Module".
     * 
     * Detection Logic:
     * 1. If page title contains valid logged-in patterns → NOT expired, return null
     * 2. If page title contains login patterns → Check for login form → expired
     * 3. If page title is unclear → Use conservative element detection
     * 
     * @param html - The HTML response to check
     * @returns Error message if session expired, null otherwise
     */
    private checkForSessionExpiry(html: string): string | null {
        const $ = cheerio.load(html);

        // ============================================
        // STEP 1: Extract and analyze page title
        // ============================================
        const pageTitle = $('title').text().trim();
        const pageTitleLower = pageTitle.toLowerCase();

        console.log(`[HTTP] 🔍 Session check - Page title: "${pageTitle}"`);

        // ============================================
        // STEP 1.5: Detect redirect pages ("Object moved")
        // These are HTTP 302 redirects - session is definitely expired
        // ============================================
        if (pageTitleLower.includes('object moved') ||
            pageTitleLower.includes('redirect') ||
            pageTitleLower === '' ||
            html.includes('Object moved to')) {
            console.log(`[HTTP] ⚠️ REDIRECT DETECTED - "${pageTitle}" indicates session expired`);
            return 'Session Expired - Redirect detected (Object moved)';
        }

        // ============================================
        // STEP 1.6: Check for empty/missing ViewState
        // A valid ASP.NET page MUST have ViewState
        // ============================================
        const viewStateMatch = html.match(/id="__VIEWSTATE"[^>]*value="([^"]*)"/);
        const viewStateValue = viewStateMatch ? viewStateMatch[1] : '';

        if (viewStateValue.length < 100) {
            console.log(`[HTTP] ⚠️ EMPTY VIEWSTATE - Length: ${viewStateValue.length} (session likely expired)`);
            return 'Session Expired - No ViewState (invalid page)';
        }

        // Valid logged-in page title patterns (beIN SBS pages)
        const validPagePatterns = [
            'finance',      // Finance Module
            'module',       // Any module page
            'dashboard',    // Dashboard
            'check',        // frmCheck.aspx
            'sell',         // frmSellPackages.aspx
            'packages',     // Package pages
            'subscription', // Subscription pages
            'sbs'           // SBS system pages
        ];

        // Login page title patterns
        const loginPagePatterns = [
            'login',        // Login page
            'sign in',      // Sign In page
            'nlogin',       // NLogin.aspx
            'signin'        // SignIn variations
        ];

        // ============================================
        // STEP 2: Check if this is a valid logged-in page
        // ============================================
        const isValidPageTitle = validPagePatterns.some(pattern => pageTitleLower.includes(pattern));
        const isLoginPageTitle = loginPagePatterns.some(pattern => pageTitleLower.includes(pattern));

        console.log(`[HTTP] 🔍 Title analysis - Valid page: ${isValidPageTitle}, Login page: ${isLoginPageTitle}`);

        // If title indicates a valid logged-in page (and NOT a login page)
        if (isValidPageTitle && !isLoginPageTitle) {
            // ============================================
            // LAYER 2: Secondary Check - Verify body content is not login page
            // Catches cases where beIN returns login page with cached/wrong title
            // ============================================
            const hasLoginFormInBody = $('input[id="Login1_UserName"]').length > 0;
            const bodyText = $('body').text();
            const hasSignInText = bodyText.includes('Sign In');
            const hasCaptchaText = bodyText.includes('Enter the following code');
            const hasLoginContentInBody = hasSignInText && hasCaptchaText;

            console.log(`[HTTP] 🔍 Layer 2 (Secondary) - Login form: ${hasLoginFormInBody}, Sign In: ${hasSignInText}, CAPTCHA text: ${hasCaptchaText}`);

            if (hasLoginFormInBody || hasLoginContentInBody) {
                console.log(`[HTTP] ⚠️ CACHED TITLE ISSUE - Valid title but login page content detected`);
                return 'Session Expired - Login page with cached title';
            }

            // ============================================
            // LAYER 3: Positive Indicator Check - Verify expected content exists
            // Confirms we got a real authenticated page, not empty/broken response
            // ============================================
            const hasContentPlaceHolder = $('[id*="ContentPlaceHolder1"]').length > 0;
            const hasCheckElements = $('input[id*="tbSerial"], input[id*="btnCheck"], input[id*="btnActivate"]').length > 0;
            const hasMessagesArea = $('[id*="MessagesArea"], [id*="Messages"]').length > 0;
            const hasExpectedContent = hasContentPlaceHolder || hasCheckElements || hasMessagesArea;

            console.log(`[HTTP] 🔍 Layer 3 (Positive) - ContentPlaceHolder: ${hasContentPlaceHolder}, Check elements: ${hasCheckElements}, Messages: ${hasMessagesArea}`);

            if (!hasExpectedContent) {
                console.log(`[HTTP] ⚠️ NO EXPECTED CONTENT - Valid title but page appears empty/broken`);
                // Don't fail immediately - might be a valid but unexpected page structure
                // Just log warning and continue
                console.log(`[HTTP] ⚠️ Proceeding with caution - page may be incomplete`);
            }

            console.log(`[HTTP] ✅ Valid page detected by title AND content - no session expiry`);
            return null;
        }

        // ============================================
        // STEP 3: If title indicates login page, confirm with form elements
        // ============================================
        if (isLoginPageTitle) {
            // Check for actual login form elements (exact ID match, not partial)
            const hasLoginUsername = $('input[id="Login1_UserName"]').length > 0;
            const hasLoginButton = $('input[id="Login1_LoginButton"]').length > 0;
            const hasLoginForm = hasLoginUsername || hasLoginButton;

            console.log(`[HTTP] 🔍 Login page check - Username field: ${hasLoginUsername}, Login button: ${hasLoginButton}`);

            if (hasLoginForm) {
                console.log(`[HTTP] ⚠️ SESSION EXPIRED - Login page title + login form detected`);
                return 'Session Expired - Redirected to Login Page';
            }
        }

        // ============================================
        // STEP 4: Fallback - Check for login form without clear title
        // ============================================
        // Only trigger if we find the EXACT login form (not partial matches)
        const hasExactLoginForm = $('input[id="Login1_UserName"]').length > 0 &&
            $('input[id="Login1_LoginButton"]').length > 0;

        // Check for CAPTCHA that's specific to login page (Image Verification with text input)
        const hasLoginCaptcha = $('img[id="Login1_ImageVerificationDealer_Image"]').length > 0 &&
            $('input[id="Login1_ImageVerificationDealer_txtContent"]').length > 0;

        console.log(`[HTTP] 🔍 Fallback check - Exact login form: ${hasExactLoginForm}, Login CAPTCHA: ${hasLoginCaptcha}`);

        if (hasExactLoginForm || hasLoginCaptcha) {
            console.log(`[HTTP] ⚠️ SESSION EXPIRED - Login form elements detected (fallback)`);
            return 'Session Expired - Redirected to Login Page';
        }

        // ============================================
        // STEP 5: No session expiry detected
        // ============================================
        console.log(`[HTTP] ✅ No session expiry detected`);
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
     * Includes timestamps for cross-worker session tracking
     */
    async exportSession(): Promise<SessionData> {
        const cookieStr = await this.jar.serialize();
        const now = Date.now();
        const timeoutMs = (this.config?.sessionTimeout || 15) * 60 * 1000;

        return {
            cookies: JSON.stringify(cookieStr),
            viewState: this.currentViewState || undefined,
            lastLoginTime: new Date().toISOString(),
            loginTimestamp: this.sessionExpiresAt ? (this.sessionExpiresAt - timeoutMs) : now,
            expiresAt: this.sessionExpiresAt || (now + timeoutMs)
        };
    }

    /**
     * Import session from Redis
     * Restores cookies, ViewState, and session expiry
     */
    async importSession(data: SessionData): Promise<void> {
        try {
            const cookieData = JSON.parse(data.cookies);
            this.jar = await CookieJar.deserialize(cookieData);

            // Build axios config with proxy if available
            const axiosConfig: Record<string, unknown> = {
                jar: this.jar,  // Required for wrapper() when no proxy
                withCredentials: true,
                headers: HttpClientService.BROWSER_HEADERS,
                timeout: 30000,
                maxRedirects: 5
            };

            // FIX: Proper cookie handling with proxy using createCookieAgent()
            // Same logic as constructor - ensures cookies work during redirect chains
            if (this.proxyConfig) {
                // PROXY MODE: Use createCookieAgent to wrap proxy agent with cookie support
                const proxyManager = getProxyManager();
                const proxyUrl = proxyManager.buildProxyUrlFromConfig(this.proxyConfig);
                const proxyType = this.proxyConfig.proxyType || 'socks5';

                // Create a cookie-aware agent that wraps the proxy agent
                if (proxyType === 'socks5') {
                    const SocksCookieAgent = createCookieAgent(SocksProxyAgent);
                    axiosConfig.httpsAgent = new SocksCookieAgent(proxyUrl, {
                        cookies: { jar: this.jar }
                    });
                } else {
                    const HttpsCookieAgent = createCookieAgent(HttpsProxyAgent);
                    axiosConfig.httpsAgent = new HttpsCookieAgent(proxyUrl, {
                        cookies: { jar: this.jar }
                    });
                }

                axiosConfig.proxy = false;

                this.axios = axios.create(axiosConfig);
                console.log(`[HTTP] Session imported with proxy: ${proxyManager.getMaskedProxyUrlFromConfig(this.proxyConfig)} (cookie-aware agent)`);
            } else {
                // NO PROXY MODE: Use wrapper()
                this.axios = wrapper(axios.create(axiosConfig));
                console.log('[HTTP] Session imported - using wrapper() for automatic cookie handling');
            }

            this.setupAxiosRetry();

            if (data.viewState) {
                this.currentViewState = data.viewState;
            }

            // Restore session expiry from cached data
            if (data.expiresAt) {
                this.sessionExpiresAt = data.expiresAt;
            } else if (data.loginTimestamp) {
                // Calculate expiry from loginTimestamp
                const timeoutMs = (this.config?.sessionTimeout || 15) * 60 * 1000;
                this.sessionExpiresAt = data.loginTimestamp + timeoutMs;
            }

            console.log('[HTTP] Session imported successfully');
        } catch (error) {
            console.error('[HTTP] Failed to import session:', error);
            // Reset to clean state
            this.jar = new CookieJar();
            this.sessionExpiresAt = null;
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
        this.sessionExpiresAt = null;
        console.log('[HTTP] Session reset');
    }

    /**
     * Check if current session is still active (within timeout period)
     * Uses sessionExpiresAt if available (from Redis cache), otherwise falls back to lastLoginTime
     */
    isSessionActive(): boolean {
        if (!this.sessionValid) {
            return false;
        }

        const now = Date.now();

        // Prefer sessionExpiresAt if available (more accurate for cross-worker)
        if (this.sessionExpiresAt) {
            const isActive = now < this.sessionExpiresAt;
            const remainingMs = this.sessionExpiresAt - now;

            if (isActive) {
                const remainingMin = Math.floor(remainingMs / 60000);
                const remainingSec = Math.floor((remainingMs % 60000) / 1000);
                console.log(`[HTTP] Session active (${remainingMin}m ${remainingSec}s remaining)`);
            } else {
                const expiredAgoMs = -remainingMs;
                const expiredAgoMin = Math.floor(expiredAgoMs / 60000);
                console.log(`[HTTP] Session expired (${expiredAgoMin} min ago)`);
                this.sessionValid = false;
            }
            return isActive;
        }

        // Fallback to lastLoginTime
        if (!this.lastLoginTime) {
            return false;
        }

        const elapsed = now - this.lastLoginTime.getTime();
        const timeoutMs = (this.config?.sessionTimeout || 15) * 60 * 1000;
        const isActive = elapsed < timeoutMs;

        if (isActive) {
            const remainingMs = timeoutMs - elapsed;
            const remainingMin = Math.floor(remainingMs / 60000);
            console.log(`[HTTP] Session active (~${remainingMin} min remaining, age-based)`);
        } else {
            console.log(`[HTTP] Session expired (${Math.floor(elapsed / 60000)} min old)`);
            this.sessionValid = false;
        }

        return isActive;
    }

    /**
     * Mark session as valid after successful login
     * Sets both lastLoginTime and sessionExpiresAt for reliable tracking
     */
    private markSessionValid(): void {
        const now = Date.now();
        const timeoutMs = (this.config?.sessionTimeout || 15) * 60 * 1000;

        this.lastLoginTime = new Date(now);
        this.sessionExpiresAt = now + timeoutMs;
        this.sessionValid = true;

        console.log(`[HTTP] Session marked as valid (expires in ${Math.floor(timeoutMs / 60000)} min)`);
    }

    /**
     * Mark session as valid when restored from Redis cache
     * Uses expiresAt from session data if available
     * @param expiresAt - Optional expiry timestamp from cached session
     */
    public markSessionValidFromCache(expiresAt?: number): void {
        this.sessionValid = true;
        this.lastLoginTime = new Date();

        if (expiresAt && expiresAt > Date.now()) {
            this.sessionExpiresAt = expiresAt;
            const remainingMin = Math.floor((expiresAt - Date.now()) / 60000);
            console.log(`[HTTP] Session marked valid from cache (${remainingMin} min remaining)`);
        } else {
            // No expiresAt or already expired - set new expiry
            const timeoutMs = (this.config?.sessionTimeout || 15) * 60 * 1000;
            this.sessionExpiresAt = Date.now() + timeoutMs;
            console.log('[HTTP] Session marked valid from cache (new expiry set)');
        }
    }

    /**
     * Get session timeout from config (in minutes)
     * Used for setting Redis TTL
     */
    public getSessionTimeout(): number {
        return this.config?.sessionTimeout || 15;
    }

    /**
     * Invalidate session when server-side expiration is detected
     * This forces a fresh login on the next request
     */
    public invalidateSession(): void {
        this.sessionValid = false;
        this.lastLoginTime = null;
        this.sessionExpiresAt = null;
        this.currentViewState = null;
        console.log('[HTTP] ⚠️ Session invalidated - will require fresh login');
    }

    /**
     * Validate session on beIN server
     * Makes a lightweight request to check if session is still valid
     * 
     * @returns true if session is valid on beIN server, false if expired
     */
    public async validateSession(): Promise<boolean> {
        if (!this.sessionValid) {
            console.log('[HTTP] validateSession: No active session');
            return false;
        }

        try {
            // Use check page as a lightweight validation endpoint
            const checkUrl = this.buildFullUrl(this.config?.checkUrl || '/Dealers/Pages/frmCheck.aspx');
            console.log(`[HTTP] validateSession: Checking ${checkUrl}`);

            const response = await this.axios.get(checkUrl, {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.config?.loginUrl || 'https://sbs.beinsports.net/'
                },
                timeout: 15000,
                maxRedirects: 0,
                validateStatus: (status) => status < 400 || status === 302
            });

            // Check if we got redirected to login page (session expired)
            const sessionExpiry = this.checkForSessionExpiry(response.data);
            if (sessionExpiry) {
                console.log(`[HTTP] validateSession: Session expired - ${sessionExpiry}`);
                this.invalidateSession();
                return false;
            }

            // Update ViewState for future requests
            const newViewState = this.extractHiddenFields(response.data);
            if (newViewState.__VIEWSTATE) {
                this.currentViewState = newViewState;
            }

            // Refresh login timestamp
            this.lastLoginTime = new Date();
            console.log('[HTTP] validateSession: Session is valid ✅');
            return true;

        } catch (error: any) {
            console.error(`[HTTP] validateSession error: ${error.message}`);
            // Don't invalidate on network error - might be temporary
            return false;
        }
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
            // === DEBUG: Check IP before login to verify proxy ===
            try {
                const ipCheckRes = await this.axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
                console.log(`[HTTP] 🌐 Current IP (via proxy): ${ipCheckRes.data?.ip || 'unknown'}`);
            } catch (ipErr: any) {
                console.log(`[HTTP] ⚠️ IP check failed: ${ipErr.message}`);
            }
            // === END DEBUG ===

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
                // AUDIT FIX 1.2: Use configurable field name with fallback
                formData[this.config.selCaptchaSolution || 'Login1$ImageVerificationDealer$txtContent'] = captchaSolution;
            }

            // Step 2: POST login
            console.log('[HTTP] POST login credentials...');
            const loginRes = await this.axios.post(
                this.config.loginUrl,
                this.buildFormData(formData),
                {
                    headers: this.buildPostHeaders(this.config.loginUrl)
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
            const pageTitle = $('title').text().trim();

            // === FIX: Check page title first for success indicators ===
            // beIN may include login form elements as hidden fields even after successful login
            const successTitlePatterns = ['Finance', 'Module', 'Dashboard', 'Dealers', 'Packages', 'Check', 'frmCheck'];
            const isSuccessPage = successTitlePatterns.some(pattern =>
                pageTitle.toLowerCase().includes(pattern.toLowerCase())
            );

            if (isSuccessPage) {
                console.log(`[HTTP] ✅ Login successful! (Page: ${pageTitle})`);
                this.markSessionValid();
                return { success: true };
            }
            // === END FIX ===

            if ($('#Login1_UserName').length || $('#Login1_LoginButton').length) {
                // === DEBUG: Log page details ===
                const allRedSpans = $('span[style*="Red"], span[style*="red"]').map((i, el) => $(el).text().trim()).get();
                const bodySnippet = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 500);
                console.log(`[HTTP] 📄 DEBUG - Page title: ${pageTitle}`);
                console.log(`[HTTP] 📄 DEBUG - Red spans found: ${JSON.stringify(allRedSpans)}`);
                console.log(`[HTTP] 📄 DEBUG - Body snippet: ${bodySnippet}...`);
                // === END DEBUG ===

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
        console.log(`[HTTP] Checking card: ${cardNumber}`);

        try {
            const checkUrl = this.buildFullUrl(this.config.checkUrl);

            // Step 1: GET check page
            console.log(`[HTTP] GET ${checkUrl}`);
            const checkPageRes = await this.axios.get(checkUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            // Check for session expiry using form-based detection (AUDIT FIX 2.1)
            const sessionExpiry = this.checkForSessionExpiry(checkPageRes.data);
            if (sessionExpiry) {
                this.invalidateSession();
                return { success: false, error: sessionExpiry };
            }

            // Also check for error text patterns
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
                    headers: this.buildPostHeaders(checkUrl)
                }
            );

            // CRITICAL FIX: Check for session expiry on POST response
            // Akamai may block the POST and return login page even if GET worked
            const postSessionExpiry = this.checkForSessionExpiry(checkRes.data);
            if (postSessionExpiry) {
                console.log(`[HTTP] ❌ POST response is login page - session expired during POST`);
                this.invalidateSession();
                return { success: false, error: postSessionExpiry };
            }

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
        console.log(`[HTTP] Card: ${cardNumber}`);

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
        console.log(`[HTTP] Loading packages for card: ${cardNumber}`);

        try {
            const renewUrl = this.buildFullUrl(this.config.renewUrl);

            // Step 1: GET sell packages page
            console.log(`[HTTP] GET ${renewUrl}`);
            const pageRes = await this.axios.get(renewUrl, {
                headers: { 'Referer': this.buildFullUrl(this.config.checkUrl) }
            });

            // Check for session expiry using form-based detection (AUDIT FIX 2.1)
            const sessionExpiry = this.checkForSessionExpiry(pageRes.data);
            if (sessionExpiry) {
                this.invalidateSession();
                return { success: false, packages: [], error: sessionExpiry };
            }

            // Also check for error messages
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
                            headers: this.buildPostHeaders(renewUrl)
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
                [loadBtnName]: loadBtnValue,
                // FIX: Clear hidden QPay mobile field to prevent ASP.NET validation error
                'ctl00$ContentPlaceHolder1$ctrlQPay$txtMobileNumber': ''
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
                    // NOTE: Do NOT use X-Requested-With or X-MicrosoftAjax headers
                    // as they change the response format to UpdatePanel delta
                    headers: this.buildPostHeaders(renewUrl)
                }
            );

            // DEBUG: Log first 500 chars of response to see what we got
            const responseHtml = loadRes.data as string;
            console.log(`[HTTP] Response length: ${responseHtml.length} chars`);
            // Capture any error labels immediately
            const $temp = cheerio.load(responseHtml);
            const errors = $temp('[id*="lblError"], .error, span[style*="red"]').text().trim();
            if (errors) console.log(`[HTTP] Immediate Error Check: "${errors}"`);

            console.log(`[HTTP] Response preview: ${responseHtml.slice(0, 300).replace(/\\s+/g, ' ')}...`);

            // Parse response and check for tbSerial2
            this.currentViewState = this.extractHiddenFields(loadRes.data);
            $ = cheerio.load(loadRes.data);

            // DEBUG: Check page title to see where we landed
            const pageTitle = $('title').text().trim();
            console.log(`[HTTP] Page title after POST: "${pageTitle}"`);

            // CRITICAL FIX: Use proper session expiry detection (includes Layer 2 & 3)
            const loadPostSessionExpiry = this.checkForSessionExpiry(loadRes.data);
            if (loadPostSessionExpiry) {
                console.log(`[HTTP] ❌ SESSION EXPIRED during loadPackages POST - ${loadPostSessionExpiry}`);
                this.invalidateSession();
                return { success: false, packages: [], error: loadPostSessionExpiry };
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
                    [step2BtnName]: step2BtnValue,
                    // FIX: Clear hidden QPay mobile field to prevent ASP.NET validation error
                    'ctl00$ContentPlaceHolder1$ctrlQPay$txtMobileNumber': ''
                };

                console.log('[HTTP] POST load packages (step 2: tbSerial2 confirmation)...');
                loadRes = await this.axios.post(
                    renewUrl,
                    this.buildFormData(secondFormData),
                    {
                        headers: this.buildPostHeaders(renewUrl)
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

            // AUDIT FIX 5.2: Use helper method for package extraction
            const packages = this.extractPackagesFromHtml($);

            if (packages.length === 0) {
                console.log('[HTTP] ⚠️ No packages found');
                return {
                    success: false,
                    packages: [],
                    error: 'No packages available for this card'
                };
            }

            // Extract dealer balance from page
            // "Adding Packages - Your Current Credit Balance is 1,340 USD"
            const pageText = $('body').text();
            const balanceMatch = pageText.match(/Current Credit Balance is ([\d,]+(?:\.\d+)?)\s*USD/i);
            const dealerBalance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : undefined;

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
    // DEALER BALANCE CHECK (Admin Feature)
    // =============================================

    /**
     * Fetch the dealer's current credit balance from beIN
     * This is used by the admin panel to display account balances
     * 
     * The balance is extracted from a page that shows:
     * "Adding Packages - Your Current Credit Balance is XXX USD"
     * 
     * @param cardNumber - Any valid card number to access the packages page
     * @returns The dealer balance in USD, or null if not found
     */
    async fetchDealerBalance(cardNumber: string): Promise<{ success: boolean; balance: number | null; error?: string }> {
        console.log(`[HTTP] Fetching dealer balance...`);

        try {
            // We need to navigate to the packages page to see the balance
            // First, check if we're logged in
            if (!this.sessionValid) {
                return { success: false, balance: null, error: 'Not logged in' };
            }

            // Navigate to renewal page
            const renewUrl = this.buildFullUrl(this.config.renewUrl);
            console.log('[HTTP] GET renewal page for balance check...');

            const renewRes = await this.axios.get(renewUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            // Check for errors
            const error = this.checkForErrors(renewRes.data);
            if (error) {
                return { success: false, balance: null, error };
            }

            // Extract ViewState
            this.currentViewState = this.extractHiddenFields(renewRes.data);
            if (!this.currentViewState) {
                return { success: false, balance: null, error: 'Failed to extract ViewState' };
            }

            // Submit card number to get to packages page
            const cardFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$txtSmartNo': cardNumber,
                'ctl00$ContentPlaceHolder1$btnSubmit': 'Submit'
            };

            console.log('[HTTP] POST card number for balance check...');
            const cardRes = await this.axios.post(
                renewUrl,
                this.buildFormData(cardFormData),
                {
                    headers: this.buildPostHeaders(renewUrl)
                }
            );

            // Check for errors
            const cardError = this.checkForErrors(cardRes.data);
            if (cardError) {
                return { success: false, balance: null, error: cardError };
            }

            // Extract balance from page
            // "Your Current Credit Balance is 1,340 USD"
            const pageText = cardRes.data;

            // Try multiple patterns - handle commas in numbers like 1,340 and any decimal places like 2,000.001
            const patterns = [
                /Current Credit Balance is ([\d,]+(?:\.\d+)?)\s*USD/i,
                /Credit Balance[:\s]+([\d,]+(?:\.\d+)?)\s*USD/i,
                /Balance[:\s]+([\d,]+(?:\.\d+)?)\s*USD/i,
                /([\d,]+(?:\.\d+)?)\s*USD\s*(?:Credit|Balance)/i
            ];

            for (const pattern of patterns) {
                const match = pageText.match(pattern);
                if (match) {
                    // Remove commas before parsing: "1,340" -> "1340"
                    const balance = parseFloat(match[1].replace(/,/g, ''));
                    console.log(`[HTTP] 💰 Dealer Balance: ${balance} USD`);
                    return { success: true, balance };
                }
            }

            console.log('[HTTP] ⚠️ Could not extract balance from page');
            return { success: false, balance: null, error: 'Balance not found on page' };

        } catch (err: any) {
            console.error('[HTTP] Fetch balance error:', err.message);
            return { success: false, balance: null, error: `Fetch failed: ${err.message}` };
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
                    headers: this.buildPostHeaders(renewUrl)
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
            // AUDIT FIX 5.2: Use helper method for package extraction
            const $ = cheerio.load(promoRes.data);
            const packages = this.extractPackagesFromHtml($, '(after promo)');

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
                    headers: this.buildPostHeaders(renewUrl)
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
                    headers: this.buildPostHeaders(renewUrl)
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
                    headers: this.buildPostHeaders(renewUrl)
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

            // Match pattern: "Your Current Credit Balance is 1,340 USD"
            const balanceMatch = pageText.match(/Current Credit Balance is ([\d,]+(?:\.\d+)?)\s*USD/i);

            if (balanceMatch) {
                const balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
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
            // NOTE: DO NOT make any GET requests before OK button!
            // ASP.NET WebForms is stateful - any navigation resets form state
            // We'll verify success by checking balance AFTER payment only
            // ===============================================

            // Get STB number from queue processor context (will be passed in)
            // For now, we try to use the stored one
            const stb = this.currentStbNumber || '';

            // AUDIT FIX 4.1: Defensive logging for empty STB
            if (!stb) {
                console.warn('[HTTP] WARNING: STB number is empty - this may cause purchase to fail');
                console.warn('[HTTP] Hint: Ensure setSTBNumber() was called or stbNumber was passed');
            }

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
                    headers: this.buildPostHeaders(renewUrl)
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

            // Find all text inputs (including STB fields)
            const textInputs = $('input[type="text"]');
            console.log(`[HTTP] DEBUG: Found ${textInputs.length} text inputs`);
            textInputs.each((i, el) => {
                const name = $(el).attr('name') || 'no-name';
                const id = $(el).attr('id') || 'no-id';
                const value = $(el).val() || '';
                console.log(`[HTTP] DEBUG: TextInput ${i}: name="${name}" id="${id}" value="${value}"`);
            });

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
            // STEP 2: Click Pay (Direct Payment)
            // ===============================================
            // IMPORTANT: Use the ACTUAL field names from the page (tbSerial1, not tbStbSerial1!)
            // The payment page has tbSerial1 (card number) NOT tbStbSerial1/2 (STB)

            // Extract the actual tbSerial1 value from the page
            const tbSerial1Value = $('input[name="ctl00$ContentPlaceHolder1$tbSerial1"]').val() as string || '';
            console.log(`[HTTP] DEBUG: tbSerial1 value from page: "${tbSerial1Value}"`);

            const payFormData: Record<string, string> = {
                ...this.currentViewState,
                // Card serial field (from the page, NOT STB!)
                'ctl00$ContentPlaceHolder1$tbSerial1': tbSerial1Value,
                // Radio button for Direct Payment (From Account)
                'ctl00$ContentPlaceHolder1$Epay': 'RbdDirectPay',
                // Pay button
                'ctl00$ContentPlaceHolder1$BtnPay': 'Pay'
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
                    headers: this.buildPostHeaders(renewUrl)
                }
            );

            // Check for immediate errors
            const payError = this.checkForErrors(res.data);
            if (payError) {
                console.log(`[HTTP] ❌ Pay error: ${payError}`);
                return { success: false, message: payError };
            }

            // Detailed response logging for debugging
            const $result = cheerio.load(res.data);
            const resultPageText = $result('body').text();

            // Log page title
            const pageTitle = $result('title').text();
            console.log(`[HTTP] Pay response - Page title: "${pageTitle}"`);

            // Log all labels and alerts
            const labels = $result('span[id*="lbl"], span[class*="alert"], div[class*="alert"], span[class*="success"], span[class*="error"]');
            console.log(`[HTTP] Pay response - Found ${labels.length} labels/alerts:`);
            labels.each((i, el) => {
                const text = $result(el).text().trim();
                if (text) {
                    console.log(`[HTTP]   Label ${i}: "${text.substring(0, 100)}"`);
                }
            });

            // Log any visible messages
            const messages = $result('[id*="Message"], [id*="msg"], [id*="Msg"], [class*="message"]');
            messages.each((i, el) => {
                const text = $result(el).text().trim();
                if (text) {
                    console.log(`[HTTP]   Message: "${text.substring(0, 100)}"`);
                }
            });

            // Full page text preview (more characters)
            console.log(`[HTTP] Pay response preview (500 chars): ${resultPageText.substring(0, 500)}`);

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
            // STEP 3: Check for SUCCESS MESSAGES first
            // ===============================================
            const successPatterns = [
                'Contract Created Successfully',
                'تم إنشاء العقد بنجاح',
                'Package Added Successfully',
                'تم إضافة الباقة بنجاح'
            ];

            for (const pattern of successPatterns) {
                if (resultPageText.includes(pattern) || res.data.includes(pattern)) {
                    console.log(`[HTTP] ✅ SUCCESS! Found message: "${pattern}"`);

                    // Get balance after to report
                    const balanceAfter = await this.getBalanceFromSellPackagesPage();
                    console.log(`[HTTP] 💰 Balance after success: ${balanceAfter !== null ? balanceAfter + ' USD' : 'unknown'}`);

                    return {
                        success: true,
                        message: pattern,
                        newBalance: balanceAfter || undefined
                    };
                }
            }

            // ===============================================
            // STEP 4: Get BALANCE AFTER to verify
            // ===============================================
            console.log('[HTTP] 💰 No success message found, checking balance...');

            // Small delay to ensure beIN has processed
            await new Promise(resolve => setTimeout(resolve, 1000));

            const balanceAfter = await this.getBalanceFromSellPackagesPage();
            console.log(`[HTTP] 💰 Balance AFTER: ${balanceAfter !== null ? balanceAfter + ' USD' : 'unknown'}`);

            // If we can't find success message and can't verify balance, fail
            console.log('[HTTP] ⚠️ No success confirmation found');
            return {
                success: false,
                message: 'لم يتم العثور على تأكيد النجاح من beIN',
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

            // Match pattern: "Your Current Credit Balance is 1,340 USD"
            const balanceMatch = pageText.match(/Current Credit Balance is ([\d,]+(?:\.\d+)?)\s*USD/i);

            if (balanceMatch) {
                return parseFloat(balanceMatch[1].replace(/,/g, ''));
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
                    headers: this.buildPostHeaders(renewUrl)
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

    setSTBNumber(stb: string): void {
        this.currentStbNumber = stb;
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
        console.log(`[HTTP] Checking card for signal: ${cardNumber}`);

        try {
            const checkUrl = this.buildFullUrl(this.config.checkUrl);

            // === DEBUG: Log cookies before check page request ===
            const checkCookies = await this.jar.getCookies(checkUrl);
            console.log(`[HTTP] 🍪 DEBUG - Cookies for check page: ${checkCookies.length} cookies`);
            if (checkCookies.length > 0) {
                console.log(`[HTTP] 🍪 DEBUG - Cookie names: ${checkCookies.map(c => c.key).join(', ')}`);
            }
            // === END DEBUG ===

            // Step 1: GET check page
            console.log(`[HTTP] GET ${checkUrl}`);
            const checkPageRes = await this.axios.get(checkUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            // === DEBUG: Check what page we got ===
            const $getPage = cheerio.load(checkPageRes.data);
            const getPageTitle = $getPage('title').text().trim();
            console.log(`[HTTP] 📄 DEBUG - GET check page title: "${getPageTitle}"`);
            if (getPageTitle.toLowerCase().includes('sign in') || getPageTitle.toLowerCase().includes('login')) {
                console.log('[HTTP] ⚠️ WARNING: GET check page returned LOGIN page - session may be lost!');
            }
            // === END DEBUG ===

            // Check for session expiry using form-based detection (AUDIT FIX 2.1)
            const sessionExpiry = this.checkForSessionExpiry(checkPageRes.data);
            if (sessionExpiry) {
                this.invalidateSession();
                return { success: false, error: sessionExpiry };
            }

            // Also check for error text patterns
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

            // === DEBUG: Log cookies before POST ===
            const postCookies = await this.jar.getCookies(checkUrl);
            console.log(`[HTTP] 🍪 DEBUG - Cookies for POST check: ${postCookies.length} cookies`);
            console.log(`[HTTP] 📝 DEBUG - ViewState length: ${this.currentViewState.__VIEWSTATE?.length || 0} chars`);
            console.log(`[HTTP] 📝 DEBUG - btnCheck value: "${checkBtnValue}"`);
            // === END DEBUG ===

            console.log('[HTTP] POST check card...');
            const checkRes = await this.axios.post(
                checkUrl,
                this.buildFormData(formData),
                {
                    headers: this.buildPostHeaders(checkUrl)
                }
            );

            // === DEBUG: Check POST response page ===
            console.log(`[HTTP] 📄 DEBUG - POST response status: ${checkRes.status}`);
            const $postPage = cheerio.load(checkRes.data);
            const postPageTitle = $postPage('title').text().trim();
            console.log(`[HTTP] 📄 DEBUG - POST check response title: "${postPageTitle}"`);
            const hasCheckForm = $postPage('#ContentPlaceHolder1_tbSerial').length > 0;
            console.log(`[HTTP] 📄 DEBUG - Check form exists: ${hasCheckForm}`);

            // Check if POST returned login page - this means session was lost
            if (postPageTitle.toLowerCase().includes('sign in') || postPageTitle.toLowerCase().includes('login')) {
                console.log('[HTTP] ⚠️ ERROR: POST check returned LOGIN page - session lost during POST!');
                this.invalidateSession();
                return { success: false, error: 'Session expired during card check - please try again' };
            }
            // === END DEBUG ===

            // NOTE: After successful POST, the form field may be hidden or replaced with results
            // We only fail if the page indicates a session issue (login page/CAPTCHA)
            // The hasCheckForm check is informational, not a hard requirement
            if (!hasCheckForm) {
                console.log('[HTTP] ⚠️ Form field not visible after POST (this may be normal for results page)');

                // AUDIT FIX 2.1: Use title-first detection instead of unreliable body text check
                // The page title "Finance Module" indicates a valid page even if form is hidden
                const postTitleLower = postPageTitle.toLowerCase();
                const validTitlePatterns = ['finance', 'module', 'check', 'sbs', 'subscription'];
                const isValidPostPage = validTitlePatterns.some(p => postTitleLower.includes(p));

                if (isValidPostPage) {
                    // ============================================
                    // LAYER 2: Secondary Check - Verify body content is not login page
                    // ============================================
                    const postBodyText = $postPage('body').text();
                    const hasLoginFormInPost = $postPage('input[id="Login1_UserName"]').length > 0;
                    const hasSignInText = postBodyText.includes('Sign In');
                    const hasCaptchaText = postBodyText.includes('Enter the following code');
                    const hasLoginContentInPost = hasSignInText && hasCaptchaText;

                    console.log(`[HTTP] 🔍 POST Layer 2 - Login form: ${hasLoginFormInPost}, Sign In: ${hasSignInText}, CAPTCHA: ${hasCaptchaText}`);

                    if (hasLoginFormInPost || hasLoginContentInPost) {
                        console.log('[HTTP] ⚠️ POST CACHED TITLE - Valid title but login content - session expired');
                        this.invalidateSession();
                        return { success: false, error: 'Session expired - please login again' };
                    }

                    // ============================================
                    // LAYER 3: Positive Indicator Check
                    // ============================================
                    const hasMessagesArea = $postPage('[id*="MessagesArea"], [id*="Messages"]').length > 0;
                    const hasActivateBtn = $postPage('input[id*="btnActivate"]').length > 0;
                    const hasCardInfo = postBodyText.includes('STB') || postBodyText.includes('Serial') || postBodyText.includes('Wallet');
                    const hasExpectedContent = hasMessagesArea || hasActivateBtn || hasCardInfo;

                    console.log(`[HTTP] 🔍 POST Layer 3 - Messages: ${hasMessagesArea}, Activate btn: ${hasActivateBtn}, Card info: ${hasCardInfo}`);

                    if (!hasExpectedContent) {
                        console.log('[HTTP] ⚠️ POST has valid title but no expected card content - might be session issue');
                        // Don't fail immediately, but log warning
                    }

                    console.log('[HTTP] ✅ POST response has valid title and content - continuing');
                } else {
                    // Only check for session expiry if page title is NOT valid
                    const hasLoginTitle = postTitleLower.includes('sign in') || postTitleLower.includes('login');
                    const hasLoginForm = $postPage('input[id="Login1_UserName"]').length > 0;

                    console.log(`[HTTP] 🔍 POST session check - Login title: ${hasLoginTitle}, Login form: ${hasLoginForm}`);

                    if (hasLoginTitle || hasLoginForm) {
                        console.log('[HTTP] ⚠️ DETECTED: Session expired - Login page returned after POST');
                        this.invalidateSession();
                        return { success: false, error: 'Session expired - please login again' };
                    }

                    // If title is not valid but also not login page, continue with caution
                    console.log('[HTTP] ℹ️ Unknown page state - continuing to parse results...');
                }
            }

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

            // === DEBUG: Log page content for troubleshooting ===
            console.log(`[HTTP] 📄 DEBUG - pageText (first 800 chars): ${pageText.replace(/\s+/g, ' ').trim().substring(0, 800)}...`);
            console.log(`[HTTP] 📄 DEBUG - messagesDiv: ${messageText.replace(/\s+/g, ' ').trim()}`);
            // === END DEBUG ===

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
        console.log(`[HTTP] Activating signal for card: ${cardNumber}`);

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
                    headers: this.buildPostHeaders(checkUrl)
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
                    headers: this.buildPostHeaders(checkUrl)
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
                        headers: this.buildPostHeaders(checkUrl)
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
        console.log(`[HTTP] Activating signal for card: ${cardNumber}`);

        try {
            const checkUrl = this.buildFullUrl(this.config.checkUrl);

            // Step 1: GET check page
            console.log(`[HTTP] GET ${checkUrl}`);
            const checkPageRes = await this.axios.get(checkUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            // Check for session expiry using form-based detection (AUDIT FIX 2.1)
            const sessionExpiry = this.checkForSessionExpiry(checkPageRes.data);
            if (sessionExpiry) {
                this.invalidateSession();
                return { success: false, error: sessionExpiry };
            }

            // Also check for error text patterns
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
                    headers: this.buildPostHeaders(checkUrl)
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
                    headers: this.buildPostHeaders(checkUrl)
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

    // =============================================
    // MONTHLY INSTALLMENT METHODS
    // =============================================

    /**
     * Load installment details for a card
     * 
     * Flow:
     * 1. Navigate to installment page
     * 2. Select "Smartcard: CISCO" dropdown
     * 3. Enter card number & click "Load Another"
     * 4. Enter confirm serial number & click "Load"
     * 5. Extract installment details table
     * 
     * @param cardNumber - The smart card number
     * @returns Installment details or error
     */
    async loadInstallment(cardNumber: string): Promise<import('./types').LoadInstallmentResult> {
        console.log(`[HTTP] ====== INSTALLMENT DEBUG START ======`);
        console.log(`[HTTP] STEP 1: Card received in function: "${cardNumber}" (length: ${cardNumber.length})`);
        console.log(`[HTTP] Loading installment for card: ${cardNumber}`);

        try {
            const installmentUrl = this.buildFullUrl(this.config.installmentUrl);

            // Step 1: GET installment page
            console.log(`[HTTP] GET ${installmentUrl}`);
            const pageRes = await this.axios.get(installmentUrl, {
                headers: { 'Referer': this.config.loginUrl }
            });

            // Check for session expiry
            const sessionExpiry = this.checkForSessionExpiry(pageRes.data);
            if (sessionExpiry) {
                this.invalidateSession();
                return { success: false, hasInstallment: false, error: sessionExpiry };
            }

            // Extract ViewState
            this.currentViewState = this.extractHiddenFields(pageRes.data);

            // Step 2: Select CISCO from dropdown and enter card number
            // The dropdown has: Irdeto (1), CISCO (value needs to be determined from HTML)
            const $ = cheerio.load(pageRes.data);

            // Find the dropdown and get CISCO value
            const dropdownId = 'ctl00$ContentPlaceHolder1$ddlType';
            const ciscoOption = $(`select[name="${dropdownId}"] option`).filter((_, el) => {
                const text = $(el).text().toLowerCase();
                return text.includes('cisco');
            });

            const ciscoValue = ciscoOption.attr('value') || 'CISCO';
            console.log(`[HTTP] CISCO dropdown value: "${ciscoValue}"`);

            // Get Load button value - try multiple button IDs
            // Order: btnSmtLoad1 -> btnLoad1 -> btnLoad
            let loadBtnId = 'ctl00$ContentPlaceHolder1$btnSmtLoad1';
            let loadBtnValue = this.extractButtonValue(pageRes.data, 'btnSmtLoad1', '');

            if (!loadBtnValue) {
                // Try btnLoad1
                loadBtnValue = this.extractButtonValue(pageRes.data, 'btnLoad1', '');
                if (loadBtnValue) {
                    loadBtnId = 'ctl00$ContentPlaceHolder1$btnLoad1';
                }
            }

            if (!loadBtnValue) {
                // Try btnLoad
                loadBtnValue = this.extractButtonValue(pageRes.data, 'btnLoad', '');
                if (loadBtnValue) {
                    loadBtnId = 'ctl00$ContentPlaceHolder1$btnLoad';
                }
            }

            if (!loadBtnValue) {
                loadBtnValue = 'Load';
                loadBtnId = 'ctl00$ContentPlaceHolder1$btnLoad';
                console.log('[HTTP] Using default Load button');
            } else {
                console.log(`[HTTP] Found Load button: ${loadBtnId} = "${loadBtnValue}"`);
            }

            // Extract ALL hidden fields from the page
            const allHiddenFields: Record<string, string> = {};
            $('input[type="hidden"]').each((_, el) => {
                const name = $(el).attr('name');
                const value = $(el).val() as string || '';
                if (name) {
                    allHiddenFields[name] = value;
                }
            });
            console.log(`[HTTP] Found ${Object.keys(allHiddenFields).length} hidden fields on page`);

            // For CISCO cards: the last digit shouldn't be sent
            // So for a 10-digit card like "7504620837", we send "750462083" (9 digits - remove last)
            const formattedCardNumber = cardNumber.length === 10
                ? cardNumber.slice(0, -1)  // Remove only the last digit
                : cardNumber;
            console.log(`[HTTP] Card formatting: "${cardNumber}" (${cardNumber.length} digits) -> "${formattedCardNumber}" (${formattedCardNumber.length} digits)`);

            // ====== TWO-STEP CISCO POSTBACK ======
            // ASP.NET requires a postback when changing the dropdown to load CISCO-specific form.
            // Without this, the server sees the serial field as empty → "Invalid Serial Number!"

            // POST 1: Select CISCO via __doPostBack (triggers dropdown change postback)
            const selectFormData: Record<string, string> = {
                ...allHiddenFields,
                '__EVENTTARGET': dropdownId,   // Trigger postback on dropdown change
                '__EVENTARGUMENT': '',
                [dropdownId]: ciscoValue
            };

            console.log(`[HTTP] POST 1: Selecting CISCO via __doPostBack (${dropdownId}=${ciscoValue})...`);
            const selectRes = await this.axios.post(
                installmentUrl,
                this.buildFormData(selectFormData),
                {
                    headers: this.buildPostHeaders(installmentUrl)
                }
            );

            // Check for session expiry after dropdown selection
            const selectExpiry = this.checkForSessionExpiry(selectRes.data);
            if (selectExpiry) {
                this.invalidateSession();
                return { success: false, hasInstallment: false, error: selectExpiry };
            }

            // Extract new hidden fields from the CISCO-specific page
            const $cisco = cheerio.load(selectRes.data);
            const ciscoHiddenFields: Record<string, string> = {};
            $cisco('input[type="hidden"]').each((_, el) => {
                const name = $cisco(el).attr('name');
                const value = $cisco(el).val() as string || '';
                if (name) {
                    ciscoHiddenFields[name] = value;
                }
            });
            this.currentViewState = this.extractHiddenFields(selectRes.data);
            console.log(`[HTTP] POST 1 done: Got ${Object.keys(ciscoHiddenFields).length} hidden fields from CISCO page`);

            // Re-detect Load button from the CISCO-specific page (may have different buttons)
            let ciscoLoadBtnId = 'ctl00$ContentPlaceHolder1$btnSmtLoad1';
            let ciscoLoadBtnValue = this.extractButtonValue(selectRes.data, 'btnSmtLoad1', '');

            if (!ciscoLoadBtnValue) {
                ciscoLoadBtnValue = this.extractButtonValue(selectRes.data, 'btnLoad1', '');
                if (ciscoLoadBtnValue) ciscoLoadBtnId = 'ctl00$ContentPlaceHolder1$btnLoad1';
            }
            if (!ciscoLoadBtnValue) {
                ciscoLoadBtnValue = this.extractButtonValue(selectRes.data, 'btnLoad', '');
                if (ciscoLoadBtnValue) ciscoLoadBtnId = 'ctl00$ContentPlaceHolder1$btnLoad';
            }
            if (!ciscoLoadBtnValue) {
                // Fallback to original button values
                ciscoLoadBtnId = loadBtnId;
                ciscoLoadBtnValue = loadBtnValue;
            }
            console.log(`[HTTP] CISCO Load button: ${ciscoLoadBtnId} = "${ciscoLoadBtnValue}"`);

            // POST 2: Enter card number in the CISCO-specific form and click Load
            const loadFormData: Record<string, string> = {
                ...ciscoHiddenFields,
                '__EVENTTARGET': '',
                '__EVENTARGUMENT': '',
                [dropdownId]: ciscoValue,
                'ctl00$ContentPlaceHolder1$tbSerial1': formattedCardNumber,
                [ciscoLoadBtnId]: ciscoLoadBtnValue
            };

            console.log(`[HTTP] POST 2: Entering card ${formattedCardNumber} and clicking Load...`);
            const loadRes = await this.axios.post(
                installmentUrl,
                this.buildFormData(loadFormData),
                {
                    headers: this.buildPostHeaders(installmentUrl)
                }
            );

            // Check for errors
            const loadError = this.checkForErrors(loadRes.data);
            if (loadError) {
                console.log(`[HTTP] ❌ Load error: "${loadError}"`);
                return { success: false, hasInstallment: false, error: loadError };
            }

            // Update ViewState
            this.currentViewState = this.extractHiddenFields(loadRes.data);

            // Step 4: Analyze response page
            const $load = cheerio.load(loadRes.data);

            // DEBUG: Dump the ContentPlaceHolder area to see what's there
            const contentArea = $load('#ContentPlaceHolder1_PaymentZone, [id*="ContentPlaceHolder1"]').first().html()?.trim().slice(0, 1000) || '';
            console.log(`[HTTP] DEBUG: ContentPlaceHolder raw HTML (first 1000 chars): "${contentArea.replace(/\s+/g, ' ')}"`);

            // DEBUG: Check for ASP.NET validation spans (often contain error messages)
            const validationSpans = $load('span[id*="Validator"], span[style*="color:Red"], span[style*="color:red"], .validation-error').map((_, el) => $load(el).text().trim()).get();
            if (validationSpans.length > 0) {
                console.log(`[HTTP] DEBUG: Validation messages: ${validationSpans.join(', ')}`);
            }

            // DEBUG: Check for any alert/error labels
            const lblMsg = $load('[id*="lblMsg"], [id*="Label"], .error, .alert, .warning').first().text().trim();
            if (lblMsg) {
                console.log(`[HTTP] DEBUG: Message on page: "${lblMsg.slice(0, 100)}"`);
            }

            // DEBUG: Log what elements are found on the page
            const allInputs = $load('input[type="text"]');
            console.log(`[HTTP] DEBUG: Found ${allInputs.length} text inputs on page`);
            allInputs.each((i, el) => {
                const name = $load(el).attr('name') || '';
                const id = $load(el).attr('id') || '';
                if (name.includes('Serial') || id.includes('Serial')) {
                    console.log(`[HTTP] DEBUG: Input found - name="${name}" id="${id}"`);
                }
            });

            // Check for any buttons
            const allButtons = $load('input[type="submit"]');
            console.log(`[HTTP] DEBUG: Found ${allButtons.length} submit buttons`);
            allButtons.each((i, el) => {
                const name = $load(el).attr('name') || '';
                const value = $load(el).attr('value') || '';
                console.log(`[HTTP] DEBUG: Button - name="${name}" value="${value}"`);
            });

            // Check for "Load Another" button which indicates card is already loaded
            const loadAnotherBtn = $load('input[value*="Load Another"], input[value*="Another"]');
            if (loadAnotherBtn.length > 0) {
                console.log('[HTTP] ✅ "Load Another" button found - card data is loaded!');
                this.lastInstallmentPageHtml = loadRes.data;
                return this.parseInstallmentDetails($load, cardNumber);
            }

            // Check for specific beIN installment page elements from screenshot analysis
            const installmentTable = $load('.InstallmentTable, table.InstallmentTable, [class*="InstallmentTable"]');
            const paymentZone = $load('#ContentPlaceHolder1_PaymentZone, [id*="PaymentZone"]');
            const packagesRow = $load('#ContentPlaceHolder1_PackagesRow, [id*="PackagesRow"]');
            const inputsZone = $load('#ContentPlaceHolder1_InputsZone, [id*="InputsZone"]');

            console.log(`[HTTP] DEBUG: beIN elements - InstallmentTable:${installmentTable.length}, PaymentZone:${paymentZone.length}, PackagesRow:${packagesRow.length}, InputsZone:${inputsZone.length}`);

            // Check for Contract/Package keywords
            const pageText = $load('body').text();
            const hasContractKeyword = pageText.includes('Contract');
            const hasConfirmKeyword = pageText.includes('Confirm');
            const hasPackageKeyword = pageText.includes('Package');
            const hasPayKeyword = pageText.includes('Pay');
            const hasPremiumKeyword = pageText.includes('Premium');
            const hasInstallmentKeyword = pageText.includes('Installment');
            const hasDealerPriceKeyword = pageText.includes('Dealer Price');
            const hasLoadAnotherKeyword = pageText.includes('Load Another');

            console.log(`[HTTP] DEBUG: Text check - Contract:${hasContractKeyword}, Confirm:${hasConfirmKeyword}, Package:${hasPackageKeyword}, Pay:${hasPayKeyword}, Premium:${hasPremiumKeyword}, DealerPrice:${hasDealerPriceKeyword}, LoadAnother:${hasLoadAnotherKeyword}`);

            // If key beIN elements are found, parse directly
            if (installmentTable.length > 0 || paymentZone.length > 0 || packagesRow.length > 0) {
                console.log('[HTTP] ✅ beIN installment elements found, parsing directly...');
                this.lastInstallmentPageHtml = loadRes.data;
                return this.parseInstallmentDetails($load, cardNumber);
            }

            // Check if "Confirm Serial Number" field appeared OR if Contract Info is already visible
            // Try multiple selectors for confirm serial field
            let confirmSerialField = $load('input[name="ctl00$ContentPlaceHolder1$tbSerial2"]');
            if (confirmSerialField.length === 0) {
                confirmSerialField = $load('input[id*="tbSerial2"], input[name*="Serial2"], input[id*="Serial2"]');
            }

            const contractInfoSection = $load('#ContentPlaceHolder1_pnlContractInfo, [id*="ContractInfo"], .ContractInfo');
            const payInstallmentBtn = $load('[id*="btnPayInstallment"], input[value*="Pay Installment"]');
            const packageSection = $load('[id*="Package"], [id*="package"]');

            console.log(`[HTTP] DEBUG: Selector check - confirmSerial=${confirmSerialField.length}, contractInfo=${contractInfoSection.length}, payBtn=${payInstallmentBtn.length}, package=${packageSection.length}`);

            // ENHANCED: If page text contains installment-related keywords, try to parse directly
            // This handles cases where CSS selectors don't match but data is present
            if (hasDealerPriceKeyword || hasLoadAnotherKeyword ||
                (hasPremiumKeyword && hasPackageKeyword)) {
                console.log('[HTTP] ✅ Installment keywords detected in page, parsing directly...');
                this.lastInstallmentPageHtml = loadRes.data;
                return this.parseInstallmentDetails($load, cardNumber);
            }


            // Fallback: check CSS selectors
            if (contractInfoSection.length > 0 || payInstallmentBtn.length > 0 || packageSection.length > 0) {
                console.log('[HTTP] ✅ Contract info/package visible via selectors, parsing directly...');
                this.lastInstallmentPageHtml = loadRes.data;
                return this.parseInstallmentDetails($load, cardNumber);
            }

            if (confirmSerialField.length === 0) {
                // No confirm field AND no contract info - card may not have installments
                console.log('[HTTP] ⚠️ Confirm serial field and contract info not found - card may not have installments');
                return {
                    success: true,
                    hasInstallment: false,
                    error: 'لا توجد أقساط لهذا الكارت'
                };
            }

            // Get Load button value for confirm step
            const confirmBtnValue = this.extractButtonValue(loadRes.data, 'btnLoad', 'Load');

            // POST - Confirm serial and load details
            const confirmFormData: Record<string, string> = {
                ...this.currentViewState,
                [dropdownId]: ciscoValue,
                'ctl00$ContentPlaceHolder1$tbSerial1': formattedCardNumber,
                'ctl00$ContentPlaceHolder1$tbSerial2': formattedCardNumber,
                'ctl00$ContentPlaceHolder1$btnLoad': confirmBtnValue
            };

            console.log('[HTTP] POST - Confirm serial and load details...');
            const detailsRes = await this.axios.post(
                installmentUrl,
                this.buildFormData(confirmFormData),
                {
                    headers: this.buildPostHeaders(installmentUrl)
                }
            );

            // Check for errors
            const detailsError = this.checkForErrors(detailsRes.data);
            if (detailsError) {
                console.log(`[HTTP] ❌ Details error: "${detailsError}"`);
                return { success: false, hasInstallment: false, error: detailsError };
            }

            // Update ViewState for later payment
            this.currentViewState = this.extractHiddenFields(detailsRes.data);
            this.lastInstallmentPageHtml = detailsRes.data;

            // Step 5: Extract installment details
            const $details = cheerio.load(detailsRes.data);
            return this.parseInstallmentDetails($details, cardNumber);

        } catch (error: any) {
            console.error('[HTTP] Load installment error:', error.message);
            return { success: false, hasInstallment: false, error: `Load installment failed: ${error.message}` };
        }
    }

    /**
     * Parse installment details from loaded HTML
     * Used by loadInstallment after the page is loaded
     * 
     * @param $ - Cheerio instance with loaded HTML
     * @param cardNumber - Card number for logging
     * @returns Installment details
     */
    private parseInstallmentDetails($: cheerio.CheerioAPI, cardNumber: string): import('./types').LoadInstallmentResult {
        // Check if contract information section exists using multiple strategies
        const contractSection = $('#ContentPlaceHolder1_pnlContractInfo, [id*="ContractInfo"]');
        const payBtn = $('[id*="btnPayInstallment"], input[value*="Pay Installment"]');
        const paymentZone = $('#ContentPlaceHolder1_PaymentZone, [id*="PaymentZone"]');
        const packagesRow = $('#ContentPlaceHolder1_PackagesRow, [id*="PackagesRow"]');
        const loadAnotherBtn = $('input[value*="Load Another"]');

        // Also check for Package row or any contract data via text content
        let packageRowFound = false;
        $('td').each((_, cell) => {
            const text = $(cell).text().trim();
            if (text.includes('Package') || text.includes('Contract Information') || text.includes('Dealer Price')) {
                packageRowFound = true;
                return false;
            }
        });

        const hasData = contractSection.length > 0 || payBtn.length > 0 ||
            paymentZone.length > 0 || packagesRow.length > 0 ||
            loadAnotherBtn.length > 0 || packageRowFound;

        console.log(`[HTTP] parseInstallmentDetails: contractSection=${contractSection.length}, payBtn=${payBtn.length}, paymentZone=${paymentZone.length}, packagesRow=${packagesRow.length}, loadAnother=${loadAnotherBtn.length}, packageRow=${packageRowFound}`);

        if (!hasData) {
            console.log('[HTTP] ⚠️ No installment data found on page');
            return {
                success: true,
                hasInstallment: false,
                error: 'لا توجد أقساط لهذا الكارت'
            };
        }

        // ====== EXTRACT PACKAGE ======
        let packageText = $('[id*="lblPackage"]').text().trim();
        if (!packageText) {
            // Look in the PackagesRow area first
            const packagesRowText = $('#ContentPlaceHolder1_PackagesRow, [id*="PackagesRow"]').text().trim();
            if (packagesRowText) {
                const match = packagesRowText.match(/(Premium.*?(?:Parts|Installment)[^]*?\))/i);
                if (match) packageText = match[1].trim();
            }
        }
        if (!packageText) {
            // Try finding in table cells - look for the cell AFTER "Package:" label
            $('td').each((_, cell) => {
                const text = $(cell).text().trim();
                if (text === 'Package:' || text === 'Package') {
                    const nextText = $(cell).next('td').text().trim();
                    if (nextText) { packageText = nextText; return false; }
                }
                // Also try cells that contain the full package name
                if (text.includes('Premium') && text.includes('Installment')) {
                    packageText = text;
                    return false;
                }
            });
        }
        if (!packageText) packageText = 'Premium Monthly Installment';
        console.log(`[HTTP] PARSE: Package = "${packageText}"`);

        // ====== EXTRACT MONTHS TO PAY ======
        const monthsSelect = $('select[id*="ddlMonths"], select[id*="Months"]');
        let monthsToPay = 'Pay for 1 Part';
        if (monthsSelect.length > 0) {
            monthsToPay = monthsSelect.find('option:selected').text().trim() || monthsToPay;
        }
        console.log(`[HTTP] PARSE: Months to pay = "${monthsToPay}"`);

        // ====== EXTRACT INSTALLMENT AMOUNTS ======
        let installment1 = 0;
        let installment2 = 0;

        // Strategy 1: Look for table with Installment headers
        $('table.InstallmentTable, table').each((_, table) => {
            const $table = $(table);
            const tableText = $table.text();
            if (tableText.includes('Installment 1') || tableText.includes('Installment 2')) {
                console.log(`[HTTP] PARSE: Found installment table`);
                const allValues: number[] = [];
                $table.find('td').each((_, cell) => {
                    const cellText = $(cell).text().trim();
                    // Skip empty cells or currency symbols, but DO NOT skip IRD/IEC since they are adjacent to values
                    if (cellText === '' || cellText.includes('USD')) return;

                    const val = parseFloat(cellText.replace(/[^0-9.]/g, ''));
                    // Only push if it's a valid number > 0
                    if (!isNaN(val) && val > 0) {
                        allValues.push(val);
                    }
                });
                console.log(`[HTTP] PARSE: Installment table values: ${JSON.stringify(allValues)}`);
                if (allValues.length >= 1) installment1 = allValues[0];
                if (allValues.length >= 2) installment2 = allValues[1];
            }
        });
        console.log(`[HTTP] PARSE: Installment1 = ${installment1}, Installment2 = ${installment2}`);

        // ====== EXTRACT CONTRACT DATES ======
        // Strategy 1: Use exact beIN element IDs (from page HTML inspection)
        let contractStartDate = $('input#ContentPlaceHolder1_txtContractStart, input[name*="txtContractStart"]').val()?.toString()?.trim() || '';
        let contractExpiryDate = $('input#ContentPlaceHolder1_txtContractExpiry, input[name*="txtContractExpiry"]').val()?.toString()?.trim() || '';

        // Strategy 2: Look for label elements
        if (!contractStartDate) {
            contractStartDate = $('[id*="lblStartDate"], [id*="lblContractStart"]').text().trim();
        }
        if (!contractExpiryDate) {
            contractExpiryDate = $('[id*="lblExpiryDate"], [id*="lblContractExpiry"]').text().trim();
        }

        // Strategy 3: Look for td label + next td/input value
        if (!contractStartDate || !contractExpiryDate) {
            $('td').each((_, cell) => {
                const text = $(cell).text().trim();
                if (!contractStartDate && (text.includes('Contract Start') || text === 'Contract Start Date:')) {
                    // Check next td for text or input value
                    const nextTd = $(cell).next('td');
                    contractStartDate = nextTd.find('input').val()?.toString()?.trim() || nextTd.text().trim();
                }
                if (!contractExpiryDate && (text.includes('Contract Expiry') || text === 'Contract Expiry Date:' || text.includes('Expiry Date'))) {
                    const nextTd = $(cell).next('td');
                    contractExpiryDate = nextTd.find('input').val()?.toString()?.trim() || nextTd.text().trim();
                }
            });
        }

        // Strategy 4: Extract dates from any input fields matching date pattern
        if (!contractStartDate || !contractExpiryDate) {
            const dateInputs: string[] = [];
            $('input[type="text"]').each((_, el) => {
                const val = $(el).val()?.toString()?.trim() || '';
                if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) {
                    dateInputs.push(val);
                }
            });
            console.log(`[HTTP] PARSE: Date inputs found: ${JSON.stringify(dateInputs)}`);
            if (!contractStartDate && dateInputs.length >= 1) contractStartDate = dateInputs[0];
            if (!contractExpiryDate && dateInputs.length >= 2) contractExpiryDate = dateInputs[1];
        }
        console.log(`[HTTP] PARSE: Start Date = "${contractStartDate}", Expiry Date = "${contractExpiryDate}"`);

        // ====== EXTRACT PRICES ======
        let invoicePrice = 0;
        let dealerPrice = 0;

        // Strategy 1: Use exact beIN element IDs (from page HTML inspection)
        const invoiceInput = $('input#ContentPlaceHolder1_txtInvoicePrice, input[name*="txtInvoicePrice"]').val()?.toString()?.trim();
        const dealerInput = $('input#ContentPlaceHolder1_txtDealerPrice, input[name*="txtDealerPrice"]').val()?.toString()?.trim();
        console.log(`[HTTP] PARSE: Invoice input raw = "${invoiceInput}", Dealer input raw = "${dealerInput}"`);
        if (invoiceInput) invoicePrice = parseFloat(invoiceInput.replace(/[^0-9.]/g, '')) || 0;
        if (dealerInput) dealerPrice = parseFloat(dealerInput.replace(/[^0-9.]/g, '')) || 0;

        // Strategy 2: Look for td label + next td/input with value
        if (!invoicePrice || !dealerPrice) {
            $('td').each((_, cell) => {
                const text = $(cell).text().trim();
                const nextTd = $(cell).next('td');
                const nextInputVal = nextTd.find('input').val()?.toString()?.trim() || '';
                const nextText = nextTd.text().trim();
                const valStr = nextInputVal || nextText;
                const value = parseFloat(valStr.replace(/[^0-9.]/g, '')) || 0;

                if (text.includes('Invoice Price') && value > 0) {
                    invoicePrice = value;
                } else if (text.includes('Dealer Price') && value > 0) {
                    dealerPrice = value;
                }
            });
        }
        console.log(`[HTTP] PARSE: Invoice Price = ${invoicePrice}, Dealer Price = ${dealerPrice}`);

        // ====== EXTRACT SUBSCRIBER INFO ======
        const subscriber = {
            name: $('input[id*="txtName"], input[id*="txtSubscriberName"]').val()?.toString()?.trim() ||
                $('[id*="lblName"], [id*="lblSubscriber"]').text().trim() || '',
            email: $('input[id*="txtEmail"], input[id*="txtSubscriberEmail"]').val()?.toString()?.trim() || '',
            mobile: $('input[id*="txtMobile"]').val()?.toString()?.trim() || '',
            city: $('input[id*="txtCity"]').val()?.toString()?.trim() || '',
            country: $('select[id*="ddlCountry"] option:selected').text().trim() ||
                $('input[id*="txtCountry"]').val()?.toString()?.trim() || '',
            homeTel: $('input[id*="txtHomeTel"]').val()?.toString()?.trim() || '',
            workTel: $('input[id*="txtWorkTel"]').val()?.toString()?.trim() || '',
            fax: $('input[id*="txtFax"]').val()?.toString()?.trim() || '',
            stbModel: $('input[id*="txtSTB"]').val()?.toString()?.trim() || '',
            address: $('input[id*="txtAddress"], textarea[id*="txtAddress"]').val()?.toString()?.trim() || '',
            remarks: $('textarea[id*="txtRemarks"]').val()?.toString()?.trim() || ''
        };
        console.log(`[HTTP] PARSE: Subscriber = "${subscriber.name}", Mobile = "${subscriber.mobile}", City = "${subscriber.city}"`);

        // ====== EXTRACT DEALER BALANCE ======
        const pageText = $('body').text();
        const balanceMatch = pageText.match(/Balance\s*(?:is\s*)?\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*USD/i) ||
            pageText.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)\s*USD/);
        const dealerBalance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : undefined;

        console.log(`[HTTP] ✅ Installment loaded: ${packageText}, Dealer Price: ${dealerPrice} USD`);
        console.log(`[HTTP]    Subscriber: ${subscriber.name}, Mobile: ${subscriber.mobile}`);

        return {
            success: true,
            hasInstallment: true,
            installment: {
                package: packageText,
                monthsToPay,
                installment1,
                installment2,
                contractStartDate,
                contractExpiryDate,
                invoicePrice,
                dealerPrice
            },
            subscriber,
            dealerBalance
        };
    }

    /**
     * Pay installment - clicks the Pay Installment button
     * Must be called after loadInstallment()
     * 
     * @returns Payment result
     */
    async payInstallment(): Promise<import('./types').PayInstallmentResult> {
        console.log('[HTTP] Paying installment...');

        try {
            const installmentUrl = this.buildFullUrl(this.config.installmentUrl);

            // Verify we have ViewState from previous load
            if (!this.currentViewState || !this.currentViewState.__VIEWSTATE) {
                console.log('[HTTP] ⚠️ No ViewState - need to load installment first');
                return { success: false, message: 'Please load installment details first' };
            }

            // Get current balance before payment
            const balanceBefore = await this.getCurrentBalance();
            console.log(`[HTTP] Balance before payment: $${balanceBefore}`);

            // Extract Pay Installment button value from stored page HTML
            // IMPORTANT: Do NOT re-fetch the page - that would lose the loaded card/contract context!
            let payBtnValue = 'Pay Installment';  // Default fallback
            if (this.lastInstallmentPageHtml) {
                payBtnValue = this.extractButtonValue(this.lastInstallmentPageHtml, 'btnPayInstallment', 'Pay Installment');
                console.log(`[HTTP] Pay button value from stored page: "${payBtnValue}"`);
            } else {
                console.log(`[HTTP] ⚠️ No stored page HTML, using default button value: "${payBtnValue}"`);
            }

            // POST - Click Pay Installment button
            const payFormData: Record<string, string> = {
                ...this.currentViewState,
                'ctl00$ContentPlaceHolder1$btnPayInstallment': payBtnValue
            };

            console.log('[HTTP] POST - Pay installment...');
            const payRes = await this.axios.post(
                installmentUrl,
                this.buildFormData(payFormData),
                {
                    headers: this.buildPostHeaders(installmentUrl)
                }
            );

            // Check for errors in response
            const payError = this.checkForErrors(payRes.data);

            // Check for success messages
            const responseText = payRes.data.toLowerCase();
            const hasSuccessMessage = responseText.includes('success') ||
                responseText.includes('تم الدفع') ||
                responseText.includes('payment completed') ||
                responseText.includes('تمت العملية');

            // Verify balance changed
            const balanceAfter = await this.getCurrentBalance();
            console.log(`[HTTP] Balance after payment: $${balanceAfter}`);

            const balanceDecreased = balanceBefore !== null && balanceAfter !== null &&
                balanceAfter < balanceBefore;

            if (balanceDecreased || hasSuccessMessage) {
                console.log('[HTTP] ✅ Installment payment successful');
                return {
                    success: true,
                    message: 'تم دفع القسط بنجاح',
                    newBalance: balanceAfter || undefined
                };
            } else if (payError) {
                console.log(`[HTTP] ❌ Payment error: ${payError}`);
                return { success: false, message: payError };
            } else {
                console.log('[HTTP] ⚠️ Payment status unclear - balance did not change');
                return {
                    success: false,
                    message: 'لم يتم تأكيد الدفع - يرجى التحقق من الرصيد'
                };
            }

        } catch (error: any) {
            console.error('[HTTP] Pay installment error:', error.message);
            return { success: false, message: `Payment failed: ${error.message}` };
        }
    }
}
