/**
 * HTTP Client Types for beIN Automation
 */

export interface HiddenFields {
    __VIEWSTATE: string;
    __VIEWSTATEGENERATOR: string;
    __EVENTVALIDATION: string;
    __EVENTTARGET?: string;
    __EVENTARGUMENT?: string;
}

export interface BeINHttpConfig {
    // Captcha
    captchaApiKey: string;
    captchaEnabled: boolean;
    selCaptchaImg: string; // CAPTCHA image selector from database

    // URLs
    loginUrl: string;
    renewUrl: string;
    checkUrl: string;
    signalUrl: string;

    // Session
    sessionTimeout: number;
    maxRetries: number;
}

export interface LoginResult {
    success: boolean;
    requiresCaptcha?: boolean;
    captchaImage?: string; // Base64
    error?: string;
}

export interface CheckCardResult {
    success: boolean;
    stbNumber?: string;
    cardInfo?: string;
    error?: string;
}

export interface AvailablePackage {
    index: number;
    name: string;
    price: number;
    checkboxValue: string; // The actual form value to submit
}

export interface LoadPackagesResult {
    success: boolean;
    packages: AvailablePackage[];
    stbNumber?: string;
    dealerBalance?: number;  // Dealer's current credit balance for verification
    error?: string;
}

export interface PurchaseResult {
    success: boolean;
    message: string;
    awaitingConfirm?: boolean;
}

export interface SessionData {
    cookies: string; // JSON serialized cookies
    viewState?: HiddenFields;
    lastLoginTime?: string;
}

export interface SignalRefreshResult {
    success: boolean;
    cardStatus?: {
        isPremium: boolean;
        smartCardSerial: string;
        stbNumber: string;
        expiryDate: string;
        walletBalance: number;
        activateCount: { current: number; max: number }; // e.g., { current: 1, max: 20 }
    };
    activated?: boolean;
    message?: string;
    error?: string;
}
