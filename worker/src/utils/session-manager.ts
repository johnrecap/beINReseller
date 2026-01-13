/**
 * Session Manager - Handles browser session persistence
 * 
 * Saves and restores Playwright browser sessions to avoid
 * repeated logins within the session timeout window.
 * 
 * Multi-Account Support:
 * - Uses BeinAccountSession table for per-account sessions
 * - Legacy methods still use settings table for backward compatibility
 */

import { prisma } from '../lib/prisma'

interface SavedSession {
    storageState: any
    createdAt: string
}

export class SessionManager {
    private readonly SESSION_KEY = 'worker_browser_session'
    private readonly SESSION_MAX_AGE = 25 * 60 * 1000 // 25 minutes

    // ===== Multi-Account Session Methods =====

    /**
     * Load saved session for a specific account
     * Uses BeinAccountSession table
     */
    async loadSessionForAccount(accountId: string): Promise<SavedSession | null> {
        try {
            const session = await prisma.beinAccountSession.findFirst({
                where: {
                    accountId,
                    isValid: true,
                    expiresAt: { gt: new Date() }
                },
                orderBy: { createdAt: 'desc' }
            })

            if (!session) return null

            return {
                storageState: session.storageState || session.cookies,
                createdAt: session.createdAt.toISOString()
            }

        } catch (error) {
            console.error(`Failed to load session for account ${accountId}:`, error)
            return null
        }
    }

    /**
     * Save session for a specific account
     * Uses BeinAccountSession table
     */
    async saveSessionForAccount(accountId: string, storageState: any): Promise<void> {
        try {
            // Invalidate old sessions for this account
            await prisma.beinAccountSession.updateMany({
                where: { accountId },
                data: { isValid: false }
            })

            // Create new session
            await prisma.beinAccountSession.create({
                data: {
                    accountId,
                    cookies: storageState.cookies || [],
                    storageState: storageState,
                    isValid: true,
                    expiresAt: new Date(Date.now() + this.SESSION_MAX_AGE)
                }
            })

            console.log(`💾 Session saved for account ${accountId}`)

        } catch (error) {
            console.error(`Failed to save session for account ${accountId}:`, error)
        }
    }

    /**
     * Clear session for a specific account
     */
    async clearSessionForAccount(accountId: string): Promise<void> {
        try {
            await prisma.beinAccountSession.updateMany({
                where: { accountId },
                data: { isValid: false }
            })
            console.log(`🗑️ Session cleared for account ${accountId}`)
        } catch (error) {
            // Ignore errors
        }
    }

    /**
     * Check if an account has a valid session
     */
    async hasValidSessionForAccount(accountId: string): Promise<boolean> {
        const session = await this.loadSessionForAccount(accountId)
        return session !== null
    }

    // ===== Legacy Session Methods (backward compatibility) =====

    /**
     * Load saved session from database (legacy - uses settings table)
     * @returns Session data or null if not found/expired
     */
    async loadSession(): Promise<SavedSession | null> {
        try {
            const setting = await prisma.setting.findUnique({
                where: { key: this.SESSION_KEY }
            })

            if (!setting) return null

            const session: SavedSession = JSON.parse(setting.value)

            // Check if session is expired
            const createdAt = new Date(session.createdAt)
            const elapsed = Date.now() - createdAt.getTime()

            if (elapsed > this.SESSION_MAX_AGE) {
                console.log('⏰ Saved session expired, will re-login')
                await this.clearSession()
                return null
            }

            return session

        } catch (error) {
            console.error('Failed to load session:', error)
            return null
        }
    }

    /**
     * Save current session to database (legacy - uses settings table)
     * @param storageState - Playwright storage state (cookies, localStorage)
     */
    async saveSession(storageState: any): Promise<void> {
        try {
            const session: SavedSession = {
                storageState,
                createdAt: new Date().toISOString()
            }

            await prisma.setting.upsert({
                where: { key: this.SESSION_KEY },
                update: { value: JSON.stringify(session) },
                create: { key: this.SESSION_KEY, value: JSON.stringify(session) }
            })

            console.log('💾 Session saved to database')

        } catch (error) {
            console.error('Failed to save session:', error)
        }
    }

    /**
     * Clear saved session (legacy)
     */
    async clearSession(): Promise<void> {
        try {
            await prisma.setting.delete({
                where: { key: this.SESSION_KEY }
            })
        } catch (error) {
            // Ignore if not found
        }
    }

    /**
     * Check if we have a valid session (legacy)
     */
    async hasValidSession(): Promise<boolean> {
        const session = await this.loadSession()
        return session !== null
    }
}

