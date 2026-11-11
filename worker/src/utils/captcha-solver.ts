/**
 * CAPTCHA Solver - 2Captcha Integration
 * 
 * Sends CAPTCHA images to 2Captcha API for solving.
 * Cost: ~$3 per 1000 CAPTCHAs
 */

import { setTimeout as wait } from 'node:timers/promises';

interface CaptchaResponse {
    status: number;
    request: string;
}

const SOLVER_FAILURE_CODES = new Set(['ERROR_WRONG_USER_KEY', 'ERROR_KEY_DOES_NOT_EXIST', 'ERROR_ZERO_BALANCE',
    'ERROR_NO_SLOT_AVAILABLE', 'ERROR_CAPTCHA_UNSOLVABLE', 'ERROR_IP_NOT_ALLOWED', 'ERROR_IP_BLOCKED',
    'ERROR_ZERO_CAPTCHA_FILESIZE', 'ERROR_TOO_BIG_CAPTCHA_FILESIZE', 'ERROR_WRONG_FILE_EXTENSION', 'ERROR_IMAGE_TYPE_NOT_SUPPORTED']);

export class CaptchaSolverError extends Error {
    constructor(readonly code: string) { super(code); }
}

function solverFailure(code: string): CaptchaSolverError {
    return new CaptchaSolverError(SOLVER_FAILURE_CODES.has(code) ? code : 'CAPTCHA_SOLVER_REJECTED');
}

export class CaptchaSolver {
    private apiKey: string
    private readonly API_URL = 'https://2captcha.com'

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

        return 'UNKNOWN';
    }

    /**
     * Solve an image-based CAPTCHA
     * @param imageBase64 - Base64 encoded image
     * @returns The solved CAPTCHA text
     */
    async solve(imageBase64: string): Promise<string> {
        if (!this.apiKey) throw new CaptchaSolverError('CAPTCHA_SOLVER_NOT_CONFIGURED');
        const signal = AbortSignal.timeout(60_000);
        const deadline = Date.now() + 60_000;
        const format = this.detectImageFormat(imageBase64);
        console.log(`[2Captcha] Image format=${format} size=${imageBase64.length}`);
        const submitted = await this.request(`${this.API_URL}/in.php`, {
            method: 'POST', signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ key: this.apiKey, method: 'base64', body: imageBase64, json: '1' }),
        });
        if (submitted.status !== 1) throw solverFailure(submitted.request);
        while (Date.now() < deadline) {
            try { await wait(5000, undefined, { signal }); }
            catch { throw new CaptchaSolverError('CAPTCHA_SOLVER_TIMEOUT'); }
            const solved = await this.request(
                `${this.API_URL}/res.php?key=${encodeURIComponent(this.apiKey)}&action=get&id=${encodeURIComponent(submitted.request)}&json=1`,
                { signal });
            if (solved.status === 1) {
                const solution = solved.request.trim();
                if (!solution) throw new CaptchaSolverError('CAPTCHA_SOLVER_INVALID_RESPONSE');
                return solution;
            }
            if (solved.request !== 'CAPCHA_NOT_READY') throw solverFailure(solved.request);
        }
        throw new CaptchaSolverError('CAPTCHA_SOLVER_TIMEOUT');
    }

    private async request(url: string, options: RequestInit): Promise<CaptchaResponse> {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new CaptchaSolverError(response.status === 429 ? 'CAPTCHA_SOLVER_RATE_LIMITED' : 'CAPTCHA_SOLVER_UNAVAILABLE');
            const payload: unknown = await response.json();
            if (!payload || typeof payload !== 'object' || !('status' in payload) || !('request' in payload) ||
                ![0, 1].includes(payload.status as number) || typeof payload.request !== 'string')
                throw new CaptchaSolverError('CAPTCHA_SOLVER_INVALID_RESPONSE');
            return payload as CaptchaResponse;
        } catch (error) {
            if (error instanceof CaptchaSolverError) throw error;
            throw new CaptchaSolverError(options.signal?.aborted ? 'CAPTCHA_SOLVER_TIMEOUT' : 'CAPTCHA_SOLVER_UNAVAILABLE');
        }
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

}
