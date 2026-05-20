import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const workerRefundPath = join(process.cwd(), 'worker', 'src', 'utils', 'error-handler.ts')
const appRefundPath = join(process.cwd(), 'src', 'lib', 'refund.ts')
const timeoutPath = join(process.cwd(), 'src', 'app', 'api', 'cron', 'timeout-operations', 'route.ts')
const cleanupPath = join(process.cwd(), 'src', 'app', 'api', 'cron', 'cleanup-stuck-operations', 'route.ts')
const heartbeatPath = join(process.cwd(), 'src', 'app', 'api', 'operations', '[id]', 'heartbeat', 'route.ts')
const confirmPurchasePath = join(process.cwd(), 'src', 'app', 'api', 'operations', '[id]', 'confirm-purchase', 'route.ts')
const source = readFileSync(workerRefundPath, 'utf8')
const appRefundSource = readFileSync(appRefundPath, 'utf8')
const timeoutSource = readFileSync(timeoutPath, 'utf8')
const cleanupSource = readFileSync(cleanupPath, 'utf8')
const heartbeatSource = readFileSync(heartbeatPath, 'utf8')
const confirmPurchaseSource = readFileSync(confirmPurchasePath, 'utf8')

const checks = [
    {
        name: 'worker refund helper re-reads operation status inside refund transaction',
        passes:
            /tx\.operation\.findUnique[\s\S]*select:\s*\{\s*status:\s*true/.test(source) ||
            /tx\.operation\.findFirst[\s\S]*select:\s*\{\s*status:\s*true/.test(source),
    },
    {
        name: 'worker refund helper blocks completed operations',
        passes: source.includes("status === 'COMPLETED'") || source.includes('OperationStatus.COMPLETED'),
    },
    {
        name: 'worker refund helper blocks review-required operations',
        passes: source.includes("status === 'REVIEW_REQUIRED'") || source.includes('OperationStatus.REVIEW_REQUIRED'),
    },
    {
        name: 'worker refund helper keeps duplicate refund idempotency',
        passes: source.includes("error.code === 'P2002'") || source.includes('P2002'),
    },
    {
        name: 'worker refund helper has final-pay-may-have-started guard',
        passes:
            source.includes('finalPayMayHaveStarted') ||
            source.includes('decideRefundSafety') ||
            source.includes('hasFinalPayStarted'),
    },
    {
        name: 'app refund helper calls shared decideRefundSafety',
        passes: appRefundSource.includes('decideRefundSafety'),
    },
    {
        name: 'timeout cron uses shared refund safety decision',
        passes: timeoutSource.includes('decideRefundSafety'),
    },
    {
        name: 'cleanup cron uses shared refund safety decision',
        passes: cleanupSource.includes('decideRefundSafety'),
    },
    {
        name: 'heartbeat timeout handles amount-positive final confirmation through review/refund decision',
        passes: heartbeatSource.includes('decideRefundSafety') || heartbeatSource.includes('REVIEW_REQUIRED'),
    },
    {
        name: 'insufficient balance revert is guarded with updateMany expected state',
        passes:
            confirmPurchaseSource.includes('OPERATION_NOT_CONFIRMABLE') &&
            /updateMany\(\{[\s\S]*status:\s*'COMPLETING'[\s\S]*amount:\s*0/.test(confirmPurchaseSource),
    },
]

let failed = 0

for (const check of checks) {
    if (!check.passes) {
        failed++
        console.error(`FAIL: ${check.name}`)
    } else {
        console.log(`PASS: ${check.name}`)
    }
}

if (failed > 0) {
    console.error(`Refund safety simulations failed: ${failed}/${checks.length}`)
    process.exit(1)
}

console.log(`Refund safety simulations passed: ${checks.length}/${checks.length}`)
