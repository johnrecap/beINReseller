/**
 * PM2 Ecosystem Configuration
 * 
 * Configures multiple workers for the beIN automation system.
 * Each worker runs independently with its own ID.
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
                WORKER_CONCURRENCY: '3',
                WORKER_RATE_LIMIT: '30',
                NODE_ENV: 'production',
            },
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '500M',
            error_file: './logs/worker-1-error.log',
            out_file: './logs/worker-1-out.log',
            merge_logs: true,
            time: true,
        },
        {
            name: 'bein-worker-2',
            script: 'dist/index.js',
            cwd: __dirname,
            env: {
                WORKER_ID: 'worker-2',
                WORKER_CONCURRENCY: '3',
                WORKER_RATE_LIMIT: '30',
                NODE_ENV: 'production',
            },
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '500M',
            error_file: './logs/worker-2-error.log',
            out_file: './logs/worker-2-out.log',
            merge_logs: true,
            time: true,
        },
        {
            name: 'bein-worker-3',
            script: 'dist/index.js',
            cwd: __dirname,
            env: {
                WORKER_ID: 'worker-3',
                WORKER_CONCURRENCY: '3',
                WORKER_RATE_LIMIT: '30',
                NODE_ENV: 'production',
            },
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '500M',
            error_file: './logs/worker-3-error.log',
            out_file: './logs/worker-3-out.log',
            merge_logs: true,
            time: true,
        },
    ],
}
