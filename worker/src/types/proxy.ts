/**
 * Proxy Configuration Types
 * 
 * Used for manual proxy setup with direct host/port/auth.
 */

export interface ProxyConfig {
    host: string;
    port: number;
    username?: string | null;
    password?: string | null;
}
