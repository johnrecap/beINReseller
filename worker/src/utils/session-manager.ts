/**
 * Session Manager - Handles browser session persistence
 * 
 * Saves and restores Playwright browser sessions to avoid
 * repeated logins within the session timeout window.
 */

import { prisma } from '../lib/prisma'

interface SavedSession {
    storageState: any
    createdAt: string
}

export class SessionManager {
    private readonly SESSION_KEY = 'worker_browser_session'

    /**
     * Load saved session from database
     * @returns Session data or null if not found/expired
     */
    async loadSession(): Promise<SavedSession | null> {
        try {
            const setting = await prisma.setting.findUnique({
                where: { key: this.SESSION_KEY }
            })

            if (!setting) return null

            const session: SavedSession = JSON.parse(setting.value)

            // Check if session is expired (25 minutes)
            const createdAt = new Date(session.createdAt)
            const elapsed = Date.now() - createdAt.getTime()
            const maxAge = 25 * 60 * 1000 // 25 minutes

            if (elapsed > maxAge) {
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
     * Save current session to database
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
     * Clear saved session
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
     * Check if we have a valid session
     */
    async hasValidSession(): Promise<boolean> {
        const session = await this.loadSession()
        return session !== null
    }
}
