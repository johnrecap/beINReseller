/**
 * Automation Client Factory
 * 
 * Returns either HttpClientService (fast) or BeINAutomation (Playwright)
 * based on USE_HTTP_CLIENT environment variable.
 * 
 * This provides a rollback mechanism - if HTTP fails, set USE_HTTP_CLIENT=false
 */

import { BeINAutomation } from './automation/bein-automation';
import { HttpClientService } from './http';

export type AutomationClient = BeINAutomation | HttpClientService;

/**
 * Check if HTTP client mode is enabled
 */
export function isHttpClientEnabled(): boolean {
    return process.env.USE_HTTP_CLIENT === 'true';
}

/**
 * Create the appropriate automation client based on feature flag
 */
export async function createAutomationClient(): Promise<AutomationClient> {
    if (isHttpClientEnabled()) {
        console.log('🚀 Using HTTP Client (fast mode)');
        const client = new HttpClientService();
        await client.initialize();
        return client;
    } else {
        console.log('🎭 Using Playwright (browser mode)');
        const automation = new BeINAutomation();
        await automation.initialize();
        return automation;
    }
}

/**
 * Type guard to check if client is HttpClientService
 */
export function isHttpClient(client: AutomationClient): client is HttpClientService {
    return client instanceof HttpClientService;
}

/**
 * Type guard to check if client is BeINAutomation
 */
export function isPlaywrightClient(client: AutomationClient): client is BeINAutomation {
    return client instanceof BeINAutomation;
}
