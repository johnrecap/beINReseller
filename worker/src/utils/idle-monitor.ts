/**
 * Idle Monitor - Automatically closes browser after inactivity
 * 
 * Features:
 * - Periodically checks if browser should be closed due to idle
 * - Cleans up idle sessions to free memory
 * - Lightweight monitoring with configurable intervals
 */

import { BeINAutomation } from '../automation/bein-automation'

export class IdleMonitor {
    private checkInterval: NodeJS.Timeout | null = null
    private sessionCleanupInterval: NodeJS.Timeout | null = null
    private isRunning: boolean = false

    constructor(
        private automation: BeINAutomation,
        private checkIntervalMs: number = 60000,  // Check browser idle every 1 min
        private sessionCleanupMs: number = 300000 // Cleanup sessions every 5 min
    ) { }

    /**
     * Start the idle monitoring
     */
    start(): void {
        if (this.isRunning) {
            console.log('👁️ IdleMonitor already running')
            return
        }

        // Check browser idle every minute
        this.checkInterval = setInterval(async () => {
            try {
                const closed = await this.automation.closeBrowserIfIdle()
                if (closed) {
                    console.log('👁️ IdleMonitor: Browser closed due to inactivity')
                }
            } catch (error) {
                console.error('IdleMonitor browser check error:', error)
            }
        }, this.checkIntervalMs)

        // Cleanup idle sessions every 5 minutes
        this.sessionCleanupInterval = setInterval(async () => {
            try {
                const count = await this.automation.cleanupIdleSessions()
                if (count > 0) {
                    console.log(`🧹 IdleMonitor: Cleaned up ${count} idle sessions`)
                }
            } catch (error) {
                console.error('IdleMonitor session cleanup error:', error)
            }
        }, this.sessionCleanupMs)

        this.isRunning = true
        console.log(`👁️ IdleMonitor started (browser check: ${this.checkIntervalMs / 1000}s, session cleanup: ${this.sessionCleanupMs / 1000}s)`)
    }

    /**
     * Stop the idle monitoring
     */
    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
        }
        if (this.sessionCleanupInterval) {
            clearInterval(this.sessionCleanupInterval)
            this.sessionCleanupInterval = null
        }
        this.isRunning = false
        console.log('👁️ IdleMonitor stopped')
    }

    /**
     * Check if monitor is currently running
     */
    isActive(): boolean {
        return this.isRunning
    }

    /**
     * Get monitoring status
     */
    getStatus(): { running: boolean; automationStats: ReturnType<BeINAutomation['getStats']> } {
        return {
            running: this.isRunning,
            automationStats: this.automation.getStats()
        }
    }
}
