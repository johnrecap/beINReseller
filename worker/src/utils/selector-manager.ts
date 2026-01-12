/**
 * Selector Manager - Dynamic CSS Selector Loading
 * 
 * Loads CSS selectors from the database so admins can update them
 * without needing to redeploy the worker.
 */

import 'dotenv/config'
import { PrismaClient } from '../../node_modules/@prisma/client'

const prisma = new PrismaClient()

export class SelectorManager {
    private selectors: Map<string, string> = new Map()
    private loaded = false

    /**
     * Load all bein_selector_* settings from database
     */
    async loadFromDB(): Promise<void> {
        try {
            const settings = await prisma.setting.findMany({
                where: {
                    key: {
                        startsWith: 'bein_'
                    }
                }
            })

            settings.forEach((s: any) => {
                // Remove the 'bein_' prefix for easier access
                const key = s.key.replace('bein_', '')
                this.selectors.set(key, s.value)
            })

            this.loaded = true
            console.log(`📋 Loaded ${settings.length} selectors from database`)

        } catch (error) {
            console.error('Failed to load selectors:', error)
        }
    }

    /**
     * Get a selector value
     * @param key - Selector key (without bein_ prefix)
     * @param fallback - Default value if not found
     */
    get(key: string, fallback: string): string {
        return this.selectors.get(key) || fallback
    }

    /**
     * Reload selectors from database
     */
    async reload(): Promise<void> {
        this.selectors.clear()
        await this.loadFromDB()
    }

    /**
     * Check if selectors are loaded
     */
    isLoaded(): boolean {
        return this.loaded
    }

    /**
     * Get all loaded selectors (for debugging)
     */
    getAll(): Record<string, string> {
        return Object.fromEntries(this.selectors)
    }
}
