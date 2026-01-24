import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyConfig, ProxyType } from '../types/proxy';

// Re-export for convenience
export { ProxyConfig, ProxyType };

// Legacy interface for SuperProxy (kept for backward compatibility)
export interface LegacyProxyConfig {
    host: string;
    port: number;
    username: string;
    password: string;
}

export class ProxyManager {
    private legacyConfig: LegacyProxyConfig;

    constructor() {
        // Legacy config from environment (SuperProxy)
        this.legacyConfig = {
            host: process.env.PROXY_HOST || 'brd.superproxy.io',
            port: parseInt(process.env.PROXY_PORT || '33335'),
            username: process.env.PROXY_USERNAME || '',
            password: process.env.PROXY_PASSWORD || ''
        };
    }

    /**
     * Check if legacy proxy is enabled (from .env)
     * @deprecated Use manual proxy config from database instead
     */
    isEnabled(): boolean {
        return process.env.PROXY_ENABLED === 'true' &&
            !!this.legacyConfig.username &&
            !!this.legacyConfig.password;
    }

    // =============================================
    // NEW METHODS - Manual Proxy Config
    // =============================================

    /**
     * Build proxy URL from manual config (host/port/auth)
     * Supports both HTTP and SOCKS5 proxies
     * @param config - ProxyConfig from database
     */
    buildProxyUrlFromConfig(config: ProxyConfig): string {
        const { host, port, username, password, proxyType = 'socks5' } = config;
        const protocol = proxyType === 'socks5' ? 'socks5' : 'http';

        if (username && password) {
            return `${protocol}://${username}:${password}@${host}:${port}`;
        }
        return `${protocol}://${host}:${port}`;
    }

    /**
     * Get proxy agent from manual config
     * Returns SocksProxyAgent for SOCKS5 or HttpsProxyAgent for HTTP
     * @param config - ProxyConfig from database
     */
    getProxyAgentFromConfig(config: ProxyConfig): SocksProxyAgent | HttpsProxyAgent<string> {
        const proxyUrl = this.buildProxyUrlFromConfig(config);
        const proxyType = config.proxyType || 'socks5'; // Default to SOCKS5

        if (proxyType === 'socks5') {
            return new SocksProxyAgent(proxyUrl);
        }
        return new HttpsProxyAgent(proxyUrl);
    }

    /**
     * Get masked proxy URL for logging (manual config)
     * @param config - ProxyConfig from database
     */
    getMaskedProxyUrlFromConfig(config: ProxyConfig): string {
        const { host, port, username, proxyType = 'socks5' } = config;
        const protocol = proxyType === 'socks5' ? 'socks5' : 'http';
        if (username) {
            return `${protocol}://${username}:****@${host}:${port}`;
        }
        return `${protocol}://${host}:${port}`;
    }

    // =============================================
    // LEGACY METHODS - SuperProxy with sessionId
    // @deprecated Will be removed after migration
    // =============================================

    /**
     * Build proxy URL with session for sticky IP
     * @deprecated Use buildProxyUrlFromConfig instead
     */
    buildProxyUrl(sessionId: string): string {
        const { host, port, username, password } = this.legacyConfig;
        const sanitizedSessionId = sessionId.replace(/-/g, '_');
        const sessionUsername = `${username}-session-${sanitizedSessionId}`;
        return `http://${sessionUsername}:${password}@${host}:${port}`;
    }

    /**
     * Get HttpsProxyAgent for axios/node requests
     * @deprecated Use getProxyAgentFromConfig instead
     */
    getProxyAgent(sessionId: string): HttpsProxyAgent<string> {
        const proxyUrl = this.buildProxyUrl(sessionId);
        return new HttpsProxyAgent(proxyUrl);
    }

    /**
     * Get proxy URL for logging (masked password)
     * @deprecated Use getMaskedProxyUrlFromConfig instead
     */
    getMaskedProxyUrl(sessionId: string): string {
        const { host, port, username } = this.legacyConfig;
        const sanitizedSessionId = sessionId.replace(/-/g, '_');
        const sessionUsername = `${username}-session-${sanitizedSessionId}`;
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

