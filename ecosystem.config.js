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
        // ⚙️ WORKER PROCESSES
        // ----------------------------
        ...createWorkers()
    ],
};

function createWorkers() {
    const WORKER_COUNT = 8;
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
        cwd: './worker', // Run from worker directory
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

    const workers = [];
    for (let i = 1; i <= WORKER_COUNT; i++) {
        workers.push({
            name: `bein-worker-${i}`,
            ...COMMON_CONFIG,
            env: { ...COMMON_ENV, WORKER_ID: `worker-${i}` },
            error_file: `./logs/worker-${i}-error.log`, // Relative to worker cwd
            out_file: `./logs/worker-${i}-out.log`,
        });
    }

    return workers;
}
