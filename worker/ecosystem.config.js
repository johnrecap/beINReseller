/**
 * PM2 Ecosystem Configuration
 * 
 * Configures multiple workers for the beIN automation system.
 * Each worker runs independently with its own ID.
 * 
 * Optimizations Applied:
 * - Lazy browser loading (browser launches on-demand)
 * - Shared Redis connection
 * - Idle timeout for auto-cleanup
 * - Increased concurrency per worker
 * - Reduced memory limits
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 monit
 *   pm2 logs
 */

module.exports = {
    apps: [
        {
            name: 'bein-worker-1',
            script: 'dist/index.js',
            cwd: __dirname,
            env: {
                WORKER_ID: 'worker-1',
                USE_HTTP_CLIENT: 'true',        // Enable fast HTTP mode
                WORKER_CONCURRENCY: '5',        // Increased from 3
                WORKER_RATE_LIMIT: '30',
                NODE_ENV: 'production',
                // Browser idle timeout (5 minutes)
                BROWSER_IDLE_TIMEOUT: '300000',
                // Session cleanup interval (10 minutes)
                SESSION_CLEANUP_INTERVAL: '600000',
            },
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '400M',         // Reduced from 500M
            error_file: './logs/worker-1-error.log',
            out_file: './logs/worker-1-out.log',
            merge_logs: true,
            time: true,
            // Auto restart settings
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
        },
        {
            name: 'bein-worker-2',
            script: 'dist/index.js',
            cwd: __dirname,
            env: {
                WORKER_ID: 'worker-2',
                USE_HTTP_CLIENT: 'true',        // Enable fast HTTP mode
                WORKER_CONCURRENCY: '5',        // Increased from 3
                WORKER_RATE_LIMIT: '30',
                NODE_ENV: 'production',
                BROWSER_IDLE_TIMEOUT: '300000',
                SESSION_CLEANUP_INTERVAL: '600000',
            },
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '400M',         // Reduced from 500M
            error_file: './logs/worker-2-error.log',
            out_file: './logs/worker-2-out.log',
            merge_logs: true,
            time: true,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
        },
        {
            name: 'bein-worker-3',
            script: 'dist/index.js',
            cwd: __dirname,
            env: {
                WORKER_ID: 'worker-3',
                USE_HTTP_CLIENT: 'true',        // Enable fast HTTP mode
                WORKER_CONCURRENCY: '5',        // Increased from 3
                WORKER_RATE_LIMIT: '30',
                NODE_ENV: 'production',
                BROWSER_IDLE_TIMEOUT: '300000',
                SESSION_CLEANUP_INTERVAL: '600000',
            },
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '400M',         // Reduced from 500M
            error_file: './logs/worker-3-error.log',
            out_file: './logs/worker-3-out.log',
            merge_logs: true,
            time: true,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
        },
    ],
}
