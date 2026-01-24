/**
 * Proxy Configuration Types
 * 
 * Used for manual proxy setup with direct host/port/auth.
 */

export type ProxyType = 'http' | 'socks5';

export interface ProxyConfig {
    host: string;
    port: number;
    username?: string | null;
    password?: string | null;
    proxyType?: ProxyType; // Default: 'socks5' for CherryProxy compatibility
}
