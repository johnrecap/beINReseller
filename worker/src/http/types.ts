/**
 * HTTP Client Types for beIN Automation
 */

export interface HiddenFields {
    __VIEWSTATE: string;
    __VIEWSTATEGENERATOR: string;
    __EVENTVALIDATION: string;
    __EVENTTARGET?: string;
    __EVENTARGUMENT?: string;
    __LASTFOCUS?: string;
}

export interface BeINHttpConfig {
    // Captcha
    captchaApiKey: string;
    captchaEnabled: boolean;
    selCaptchaImg: string; // CAPTCHA image selector from database
    selCaptchaSolution: string; // AUDIT FIX 1.2: CAPTCHA solution input field name

    // URLs
    loginUrl: string;
    renewUrl: string;
    checkUrl: string;
    signalUrl: string;
    installmentUrl: string;

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
    newBalance?: number;  // Balance after purchase for verification
}

export interface SessionData {
    cookies: string; // JSON serialized cookies
    viewState?: HiddenFields;
    lastLoginTime?: string;

    // Enhanced session tracking for cross-worker sharing
    loginTimestamp?: number;   // Unix timestamp (ms) when login occurred
    expiresAt?: number;        // Unix timestamp (ms) when session expires
    accountId?: string;        // Account ID for validation
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

/**
 * Result for checking card status WITHOUT activating
 * Used in two-step signal refresh flow
 */
export interface Contract {
    type: string;        // Purchase, PayInstallment, AddonEvent, Package
    status: string;      // Active, Canceled, Expired
    package: string;     // Package name
    startDate: string;   // Start date
    expiryDate: string;  // Expiry date
    invoiceNo: string;   // Invoice number
}

export interface CheckCardForSignalResult {
    success: boolean;
    cardStatus?: {
        isPremium: boolean;
        smartCardSerial: string;
        stbNumber: string;
        expiryDate: string;
        walletBalance: number;
        activateCount: { current: number; max: number };
        canActivate: boolean; // true if not at limit
    };
    contracts?: Contract[]; // Subscription history
    error?: string;
}

// =============================================
// MONTHLY INSTALLMENT TYPES
// =============================================

/**
 * Installment information from beIN frmPayMonthlyInstallment page
 * Installments always have exactly 2 parts
 */
export interface InstallmentInfo {
    package: string;            // e.g., "Premium Monthly Installment 2 Parts (2 Parts)"
    monthsToPay: string;        // e.g., "Pay for 1 Part"
    installment1: number;       // First installment amount (USD)
    installment2: number;       // Second installment amount (USD)
    contractStartDate: string;  // Format: DD/MM/YYYY
    contractExpiryDate: string; // Format: DD/MM/YYYY
    invoicePrice: number;       // Invoice Price (USD)
    dealerPrice: number;        // Dealer Price (USD)
}

/**
 * Subscriber information from installment page
 */
export interface SubscriberInfo {
    name: string;
    email: string;
    mobile: string;
    city: string;
    country: string;
    homeTel: string;
    workTel: string;
    fax: string;
    stbModel: string;
    address: string;
    remarks: string;
}

/**
 * Result of loading installment details
 */
export interface LoadInstallmentResult {
    success: boolean;
    installment?: InstallmentInfo;
    subscriber?: SubscriberInfo;
    dealerBalance?: number;
    hasInstallment: boolean;    // true if card has pending installment
    error?: string;
}

/**
 * Result of paying installment
 */
export interface PayInstallmentResult {
    success: boolean;
    message: string;
    newBalance?: number;
}
