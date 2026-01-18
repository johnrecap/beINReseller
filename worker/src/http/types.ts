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
