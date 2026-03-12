/**
 * beIN Session Keep-Alive Worker
 * 
 * Separate PM2 process that keeps beIN sessions warm in Redis.
 * This eliminates login wait times for users by proactively refreshing sessions.
 * 
 * Features:
 * - Runs every N minutes (configurable via keepalive_interval_minutes setting)
 * - Automatically solves CAPTCHA using 2Captcha
 * - Staggered refresh (10 sec between accounts) to avoid rate limiting
 * - Skips accounts that are in use (locked by operations)
 * - Stores metrics in Redis for admin panel
 * 
 * Usage:
 *   pm2 start ecosystem.config.js --only bein-keepalive
 *   pm2 logs bein-keepalive
 */

// IMPORTANT: Skip TLS verification for Bright Data proxy (self-signed certs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import 'dotenv/config';
import { SessionKeepAliveService, closeAllKeepAliveClients } from './lib/session-keepalive';
import { closeRedisConnection } from './lib/redis';
import { prisma } from './lib/prisma';

// Default interval (can be overridden by database setting)
const DEFAULT_INTERVAL_MINUTES = 10;

async function getIntervalFromSettings(): Promise<number> {
    try {
        const setting = await prisma.setting.findUnique({
            where: { key: 'keepalive_interval_minutes' }
        });
        if (setting?.value) {
            const minutes = parseInt(setting.value);
            if (minutes > 0 && minutes <= 60) {
                return minutes;
            }
        }
    } catch (error) {
        console.error('[KeepAlive] Failed to load interval from settings:', error);
    }
    return DEFAULT_INTERVAL_MINUTES;
}

async function main() {
    console.log('========================================');
    console.log('🔥 beIN Session Keep-Alive Worker');
    console.log('========================================');
    console.log(`📅 Started at: ${new Date().toISOString()}`);

    // Load interval from database
    const intervalMinutes = await getIntervalFromSettings();
    console.log(`⏰ Refresh interval: ${intervalMinutes} minutes`);
    console.log(`⏱️ Stagger delay: 10 seconds between accounts`);

    // Create keep-alive service
    const keepAlive = new SessionKeepAliveService(intervalMinutes, 10000);

    // Run initial refresh on startup
    console.log('\n🚀 Running initial session refresh...');
    const initialResult = await keepAlive.refreshAllSessions();
    
    console.log('\n📊 Initial Refresh Results:');
    console.log(`   Total accounts: ${initialResult.total}`);
    console.log(`   ✅ Success: ${initialResult.success}`);
    console.log(`   ❌ Failed: ${initialResult.failed}`);
    console.log(`   ⏭️ Skipped: ${initialResult.skipped}`);
    console.log(`   ⏱️ Duration: ${(initialResult.durationMs / 1000).toFixed(1)}s`);

    // Log individual results
    if (initialResult.results.length > 0) {
        console.log('\n📋 Account Details:');
        for (const r of initialResult.results) {
            const icon = r.status === 'failed' ? '❌' : 
                        r.status.startsWith('skipped') ? '⏭️' : '✅';
            const extra = r.captchaSolved ? ' (CAPTCHA solved)' : '';
            const error = r.error ? ` - ${r.error}` : '';
            console.log(`   ${icon} ${r.username}: ${r.status}${extra}${error}`);
        }
    }

    // Start periodic refresh
    keepAlive.start();
    console.log(`\n👷 Keep-alive service running (refreshing every ${intervalMinutes} min)...`);
    console.log('   Press Ctrl+C to stop\n');

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\n🛑 Shutting down keep-alive service...');
        keepAlive.stop();
        closeAllKeepAliveClients();
        await closeRedisConnection();
        await prisma.$disconnect();
        console.log('👋 Keep-alive stopped');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive
    process.stdin.resume();
}

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
