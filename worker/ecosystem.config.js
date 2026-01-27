/**
 * PM2 Ecosystem Configuration - VPS 20 Optimized
 * 
 * Server: 6 vCPU, 12 GB RAM
 * Workers: 10 × 8 Concurrency = 80 concurrent operations
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

const COMMON_ENV = {
    USE_HTTP_CLIENT: 'true',
    NODE_ENV: 'production',
    WORKER_CONCURRENCY: '8',
    WORKER_RATE_LIMIT: '50',
    BROWSER_IDLE_TIMEOUT: '300000',
    SESSION_CLEANUP_INTERVAL: '600000',
};

const COMMON_CONFIG = {
    script: 'dist/index.js',
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
};

module.exports = {
    apps: [
        {
            name: 'bein-worker-1',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-1' },
            error_file: './logs/worker-1-error.log',
            out_file: './logs/worker-1-out.log',
        },
        {
            name: 'bein-worker-2',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-2' },
            error_file: './logs/worker-2-error.log',
            out_file: './logs/worker-2-out.log',
        },
        {
            name: 'bein-worker-3',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-3' },
            error_file: './logs/worker-3-error.log',
            out_file: './logs/worker-3-out.log',
        },
        {
            name: 'bein-worker-4',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-4' },
            error_file: './logs/worker-4-error.log',
            out_file: './logs/worker-4-out.log',
        },
        {
            name: 'bein-worker-5',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-5' },
            error_file: './logs/worker-5-error.log',
            out_file: './logs/worker-5-out.log',
        },
        {
            name: 'bein-worker-6',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-6' },
            error_file: './logs/worker-6-error.log',
            out_file: './logs/worker-6-out.log',
        },
        {
            name: 'bein-worker-7',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-7' },
            error_file: './logs/worker-7-error.log',
            out_file: './logs/worker-7-out.log',
        },
        {
            name: 'bein-worker-8',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-8' },
            error_file: './logs/worker-8-error.log',
            out_file: './logs/worker-8-out.log',
        },
        {
            name: 'bein-worker-9',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-9' },
            error_file: './logs/worker-9-error.log',
            out_file: './logs/worker-9-out.log',
        },
        {
            name: 'bein-worker-10',
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: 'worker-10' },
            error_file: './logs/worker-10-error.log',
            out_file: './logs/worker-10-out.log',
        },
    ],
}
