/**
 * PM2 Ecosystem Configuration - VPS 20 Optimized
 * 
 * Server: 6 vCPU, 12 GB RAM
 * Panel workers: explicitly declared PANEL_WORKER_COUNT × 8 concurrency.
 * 
 * Optimizations Applied:
 * - HTTP Client mode (fast, no browser overhead)
 * - Shared Redis connection
 * - Increased concurrency per worker
 * - Optimized memory limits
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 monit
 *   pm2 logs
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports -- PM2 loads this ecosystem as CommonJS.
const { createPanelWorkers } = require('../deployment/panel-workers.cjs');

const COMMON_ENV = {
    USE_HTTP_CLIENT: 'true',
    NODE_ENV: 'production',
    WORKER_CONCURRENCY: '8',
    WORKER_RATE_LIMIT: '50',
    BROWSER_IDLE_TIMEOUT: '300000',
    SESSION_CLEANUP_INTERVAL: '600000',
};

module.exports = {
    apps: [
        ...createPanelWorkers(__dirname),
        // Session Keep-Alive Worker - Keeps beIN sessions warm
        {
            name: 'bein-keepalive',
            script: 'dist/keepalive.js',
            cwd: __dirname,
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '256M',
            merge_logs: true,
            time: true,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 10000,
            env: {
                NODE_ENV: 'production',
            },
            error_file: './logs/keepalive-error.log',
            out_file: './logs/keepalive-out.log',
        },
        // Customer Operations Worker - For mobile app customers
        // Processes customer-operations queue (isolated from reseller operations)
        {
            name: 'bein-customer',
            script: 'dist/customer-index.js',
            cwd: __dirname,
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '350M',
            merge_logs: true,
            time: true,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            env: {
                ...COMMON_ENV,
                WORKER_ID: 'customer-1',
                WORKER_CONCURRENCY: '4',  // Lower concurrency for customers
            },
            error_file: './logs/customer-error.log',
            out_file: './logs/customer-out.log',
        },
    ],
}
