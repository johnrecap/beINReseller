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
     * Solve an image-based CAPTCHA
     * @param imageBase64 - Base64 encoded image
     * @returns The solved CAPTCHA text
     */
    async solve(imageBase64: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('2Captcha API key not configured')
        }

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
