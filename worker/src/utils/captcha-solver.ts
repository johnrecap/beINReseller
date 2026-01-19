/**
 * CAPTCHA Solver - 2Captcha Integration
 * 
 * Sends CAPTCHA images to 2Captcha API for solving.
 * Cost: ~$3 per 1000 CAPTCHAs
 */

interface CaptchaResponse {
    status: number;
    request: string;
}

export class CaptchaSolver {
    private apiKey: string
    private readonly API_URL = 'http://2captcha.com'

    constructor(apiKey: string) {
        this.apiKey = apiKey
    }

    /**
     * Detect image format from base64 magic bytes
     */
    private detectImageFormat(base64: string): string {
        // Get first few bytes to check magic number
        const bytes = Buffer.from(base64.substring(0, 20), 'base64');

        // Check magic bytes
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
            return 'PNG';
        }
        if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
            return 'JPEG';
        }
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
            return 'GIF';
        }
        if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
            return 'BMP';
        }

        // Unknown - log first bytes for debugging
        const hexBytes = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`[2Captcha] Unknown image format, first bytes: ${hexBytes}`);
        return 'UNKNOWN';
    }

    /**
     * Solve an image-based CAPTCHA
     * @param imageBase64 - Base64 encoded image
     * @returns The solved CAPTCHA text
     */
    async solve(imageBase64: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('2Captcha API key not configured')
        }

        // Detect and log image format
        const format = this.detectImageFormat(imageBase64);
        console.log(`[2Captcha] Image format detected: ${format}, size: ${imageBase64.length} chars`);

        // Step 1: Submit CAPTCHA
        const submitResponse = await fetch(`${this.API_URL}/in.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                key: this.apiKey,
                method: 'base64',
                body: imageBase64,
                json: '1'
            })
        })

        const submitResult = await submitResponse.json() as CaptchaResponse

        if (submitResult.status !== 1) {
            throw new Error(`CAPTCHA submission failed: ${submitResult.request}`)
        }

        const requestId = submitResult.request
        console.log(`🧩 CAPTCHA submitted, ID: ${requestId}`)

        // Step 2: Poll for result (with timeout)
        const maxAttempts = 30 // 30 * 2 = 60 seconds max
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await this.delay(2000) // Wait 2 seconds between polls

            const resultResponse = await fetch(
                `${this.API_URL}/res.php?key=${this.apiKey}&action=get&id=${requestId}&json=1`
            )
            const resultData = await resultResponse.json() as CaptchaResponse

            if (resultData.status === 1) {
                console.log(`✅ CAPTCHA solved: ${resultData.request}`)
                return resultData.request
            }

            if (resultData.request !== 'CAPCHA_NOT_READY') {
                throw new Error(`CAPTCHA solving failed: ${resultData.request}`)
            }
        }

        throw new Error('CAPTCHA solving timeout')
    }

    /**
     * Report incorrect CAPTCHA (for refund)
     * @param captchaId - The CAPTCHA request ID
     */
    async reportBad(captchaId: string): Promise<void> {
        await fetch(
            `${this.API_URL}/res.php?key=${this.apiKey}&action=reportbad&id=${captchaId}&json=1`
        )
    }

    /**
     * Get account balance
     * @returns Balance in USD
     */
    async getBalance(): Promise<number> {
        const response = await fetch(
            `${this.API_URL}/res.php?key=${this.apiKey}&action=getbalance&json=1`
        )
        const data = await response.json() as CaptchaResponse
        return parseFloat(data.request)
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
