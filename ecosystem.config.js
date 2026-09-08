// eslint-disable-next-line @typescript-eslint/no-require-imports -- PM2 loads this ecosystem as CommonJS.
const { createPanelWorkers } = require('./deployment/panel-workers.cjs');

module.exports = {
    apps: [
        // ----------------------------
        // 🌍 WEB APPLICATION (Next.js)
        // ----------------------------
        {
            name: 'bein-web',
            script: 'npm',
            args: 'start',
            cwd: './', // Root directory
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            max_memory_restart: '1G',
        },

        // ----------------------------
        // 🔥 KEEP-ALIVE SERVICE
        // ----------------------------
        {
            name: 'bein-keepalive',
            script: 'dist/keepalive.js',
            cwd: './worker',
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '200M',
            autorestart: true,
            merge_logs: true,
            time: true,
            env: {
                NODE_ENV: 'production',
            },
            error_file: './logs/keepalive-error.log',
            out_file: './logs/keepalive-out.log',
        },

        // ----------------------------
        // OPERATION MAINTENANCE
        // ----------------------------
        {
            name: 'bein-maintenance',
            // Allow an active bounded batch to drain before forced termination.
            kill_timeout: 300000,
            script: 'node_modules/.bin/tsx',
            args: 'src/scripts/operation-maintenance.ts',
            cwd: './',
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '200M',
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            merge_logs: true,
            time: true,
            env: {
                NODE_ENV: 'production',
            },
            error_file: './logs/maintenance-error.log',
            out_file: './logs/maintenance-out.log',
        },

        // ----------------------------
        // ⚙️ WORKER PROCESSES
        // ----------------------------
        ...createPanelWorkers('./worker')
    ],
};
