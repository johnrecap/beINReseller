import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const profile = require('../../deployment/panel-workers.cjs') as { panelWorkerCount(value?: string): number; createPanelWorkers(cwd: string): Array<{ name: string; env: { WORKER_ID: string } }> }

test('T041 both PM2 entry points use one explicit reviewed panel process count', () => {
    const previous = process.env.PANEL_WORKER_COUNT
    try {
        for (const count of [8, 10]) {
            process.env.PANEL_WORKER_COUNT = String(count)
            for (const file of ['../../ecosystem.config.js', '../../worker/ecosystem.config.js']) {
                delete require.cache[require.resolve(file)]
                const config = require(file) as { apps: Array<{ name: string; env?: { WORKER_ID?: string } }> }
                const workers = config.apps.filter(app => /^bein-worker-\d+$/.test(app.name))
                assert.equal(workers.length, count)
                assert.equal(new Set(workers.map(app => app.env?.WORKER_ID)).size, count)
            }
        }
    } finally { if (previous === undefined) delete process.env.PANEL_WORKER_COUNT; else process.env.PANEL_WORKER_COUNT = previous }
})
test('T041 topology never guesses the production process count', () => {
    for (const value of ['', '0', 'abc', '1.5', '33', '-1']) assert.throws(() => profile.panelWorkerCount(value), /PANEL_WORKER_COUNT_REQUIRED/)
})
