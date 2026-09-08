function panelWorkerCount(value = process.env.PANEL_WORKER_COUNT) {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 32) {
        throw new Error('PANEL_WORKER_COUNT_REQUIRED: set the reviewed process count (1..32) before loading PM2')
    }
    return Number(value)
}

function createPanelWorkers(cwd) {
    return Array.from({ length: panelWorkerCount() }, (_, index) => {
        const id = `worker-${index + 1}`
        return { name: `bein-${id}`, script: 'dist/index.js', cwd, instances: 1, exec_mode: 'fork',
            max_memory_restart: '350M', merge_logs: true, time: true, watch: false, autorestart: true,
            max_restarts: 10, restart_delay: 5000,
            env: { USE_HTTP_CLIENT: 'true', NODE_ENV: 'production', WORKER_CONCURRENCY: '8',
                WORKER_RATE_LIMIT: '50', BROWSER_IDLE_TIMEOUT: '300000', SESSION_CLEANUP_INTERVAL: '600000', WORKER_ID: id },
            error_file: `./logs/${id}-error.log`, out_file: `./logs/${id}-out.log` }
    })
}
module.exports = { panelWorkerCount, createPanelWorkers }
