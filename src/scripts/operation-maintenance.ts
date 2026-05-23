import 'dotenv/config'
import { startOperationMaintenanceRunner } from '@/lib/maintenance/operation-maintenance-runner'

function requireEnv(name: string) {
    if (!process.env[name]) {
        throw new Error(`${name} is required for operation maintenance`)
    }
}

async function main() {
    requireEnv('DATABASE_URL')
    requireEnv('REDIS_URL')

    await startOperationMaintenanceRunner()
}

main().catch((error) => {
    console.error('[Maintenance] Startup failed:', error)
    process.exit(1)
})
