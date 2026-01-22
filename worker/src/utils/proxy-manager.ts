import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ProxyConfig {
    host: string;
    port: number;
    username: string;
    password: string;
}

export class ProxyManager {
    private config: ProxyConfig;

    constructor() {
        this.config = {
            host: process.env.PROXY_HOST || 'brd.superproxy.io',
            port: parseInt(process.env.PROXY_PORT || '33335'),
            username: process.env.PROXY_USERNAME || '',
            password: process.env.PROXY_PASSWORD || ''
        };
    }

    /**
     * Check if proxy is enabled and configured
     */
    isEnabled(): boolean {
        return process.env.PROXY_ENABLED === 'true' &&
            !!this.config.username &&
            !!this.config.password;
    }

    /**
     * Build proxy URL with session for sticky IP
     * @param sessionId - Unique session identifier for sticky IP
     */
    buildProxyUrl(sessionId: string): string {
        const { host, port, username, password } = this.config;
        // Format: username-session-sessionId:password@host:port
        const sessionUsername = `${username}-session-${sessionId}`;
        return `http://${sessionUsername}:${password}@${host}:${port}`;
    }

    /**
     * Get HttpsProxyAgent for axios/node requests
     * @param sessionId - Unique session identifier for sticky IP
     */
    getProxyAgent(sessionId: string): HttpsProxyAgent<string> {
        const proxyUrl = this.buildProxyUrl(sessionId);
        return new HttpsProxyAgent(proxyUrl);
    }

    /**
     * Get proxy URL for logging (masked password)
     */
    getMaskedProxyUrl(sessionId: string): string {
        const { host, port, username } = this.config;
        const sessionUsername = `${username}-session-${sessionId}`;
        return `http://${sessionUsername}:****@${host}:${port}`;
    }
}

// Singleton instance
let proxyManager: ProxyManager | null = null;

export function getProxyManager(): ProxyManager {
    if (!proxyManager) {
        proxyManager = new ProxyManager();
    }
    return proxyManager;
}
