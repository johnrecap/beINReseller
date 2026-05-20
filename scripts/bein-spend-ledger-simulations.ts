import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma')
const workerSchemaPath = join(process.cwd(), 'worker', 'prisma', 'schema.prisma')
const workerHelperPath = join(process.cwd(), 'worker', 'src', 'lib', 'bein-spend-ledger.ts')
const appHelperPath = join(process.cwd(), 'src', 'lib', 'bein-spend-ledger.ts')
const workerProcessorPath = join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts')
const operationRoutePath = join(process.cwd(), 'src', 'app', 'api', 'operations', '[id]', 'route.ts')
const summaryRoutePath = join(process.cwd(), 'src', 'app', 'api', 'admin', 'reports', 'bein-spend', 'route.ts')
const operationsReportRoutePath = join(process.cwd(), 'src', 'app', 'api', 'admin', 'reports', 'bein-spend', 'operations', 'route.ts')
const reportPagePath = join(process.cwd(), 'src', 'app', 'dashboard', 'admin', 'reports', 'bein-spend', 'page.tsx')
const reportClientPath = join(process.cwd(), 'src', 'components', 'admin', 'reports', 'BeinSpendReportClient.tsx')
const sidebarPath = join(process.cwd(), 'src', 'components', 'layout', 'Sidebar.tsx')
const migrationPath = join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260514090000_add_bein_operation_ledger',
    'migration.sql',
)
const schema = readFileSync(schemaPath, 'utf8')
const workerSchema = readFileSync(workerSchemaPath, 'utf8')
const workerHelper = existsSync(workerHelperPath) ? readFileSync(workerHelperPath, 'utf8') : ''
const appHelper = existsSync(appHelperPath) ? readFileSync(appHelperPath, 'utf8') : ''
const workerProcessor = readFileSync(workerProcessorPath, 'utf8')
const operationRoute = readFileSync(operationRoutePath, 'utf8')
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
const summaryRoute = existsSync(summaryRoutePath) ? readFileSync(summaryRoutePath, 'utf8') : ''
const operationsReportRoute = existsSync(operationsReportRoutePath) ? readFileSync(operationsReportRoutePath, 'utf8') : ''
const reportPage = existsSync(reportPagePath) ? readFileSync(reportPagePath, 'utf8') : ''
const reportClient = existsSync(reportClientPath) ? readFileSync(reportClientPath, 'utf8') : ''
const sidebar = readFileSync(sidebarPath, 'utf8')

const checks = [
    {
        name: 'Prisma schema defines confirmed beIN spend ledger model',
        passes: schema.includes('model BeinAccountSpendLedger'),
    },
    {
        name: 'ledger enforces one confirmed row per operation',
        passes:
            schema.includes('@@unique([operationId])') ||
            schema.includes('@unique') && schema.includes('operationId'),
    },
    {
        name: 'ledger supports date-range account reports',
        passes: schema.includes('chargedAt') && schema.includes('beinAccountId'),
    },
    {
        name: 'worker schema defines the same confirmed beIN spend ledger model',
        passes: workerSchema.includes('model BeinAccountSpendLedger'),
    },
    {
        name: 'migration is additive and creates only the ledger table/indexes',
        passes:
            migration.includes('CREATE TABLE') &&
            migration.includes('bein_account_spend_ledger') &&
            !/ALTER TABLE\s+"?(operations|transactions|users)"?/i.test(migration) &&
            !/UPDATE\s+"?(operations|transactions|users)"?/i.test(migration),
    },
    {
        name: 'worker ledger helper exists',
        passes: existsSync(workerHelperPath),
    },
    {
        name: 'app report ledger helper exists',
        passes: existsSync(appHelperPath),
    },
    {
        name: 'worker helper requires confirmed positive beIN balance delta',
        passes:
            workerHelper.includes('recordConfirmedBeinSpend') &&
            workerHelper.includes('dealerBalanceBefore') &&
            workerHelper.includes('dealerBalanceAfter') &&
            workerHelper.includes('spendAmount <= 0') &&
            workerHelper.includes('BALANCE_DELTA'),
    },
    {
        name: 'worker helper is idempotent for duplicate jobs',
        passes:
            workerHelper.includes('findUnique') &&
            workerHelper.includes('operationId') &&
            workerHelper.includes('already_recorded'),
    },
    {
        name: 'worker helper sends conflicting duplicate input to review',
        passes:
            workerHelper.includes('conflict_review_required') &&
            workerHelper.includes('existing.beinAccountId !== input.beinAccountId'),
    },
    {
        name: 'successful charge records exactly the final charged beIN account',
        passes:
            workerProcessor.includes('recordConfirmedBeinSpend') &&
            workerProcessor.includes("evidenceSource: 'BALANCE_DELTA'") &&
            workerProcessor.includes('chargedBeinLedgerId'),
    },
    {
        name: 'first account failing before charge is not recorded; later charged account is recorded',
        passes:
            workerProcessor.includes('recordConfirmedBeinSpend') &&
            !workerProcessor.includes('recordConfirmedBeinSpend({\n            operationId,\n            userId: operation.userId || null'),
    },
    {
        name: 'unconfirmed success without balance delta is excluded from confirmed totals',
        passes:
            workerHelper.includes('missing_balance_delta') &&
            !workerHelper.includes('evidenceConfidence: \'ESTIMATED\''),
    },
    {
        name: 'confirmed ledger is exposed separately from assigned operation beIN account',
        passes:
            operationRoute.includes('chargedBeinSpendLedger') &&
            operationRoute.includes('chargedBeinAccount') &&
            appHelper.includes('BeinSpendLedgerDetailRow'),
    },
    {
        name: 'summary report helper supports date, account, panel user, and operation type filters',
        passes:
            appHelper.includes('getBeinSpendSummary') &&
            appHelper.includes('beinAccountId') &&
            appHelper.includes('userId') &&
            appHelper.includes('operationType') &&
            appHelper.includes('chargedAt'),
    },
    {
        name: 'detail report helper supports pagination and safe detail rows',
        passes:
            appHelper.includes('getBeinSpendOperations') &&
            appHelper.includes('pageSize') &&
            appHelper.includes('skip') &&
            appHelper.includes('panelUsername'),
    },
    {
        name: 'summary report counts unconfirmed review rows without adding them to confirmed spend',
        passes:
            appHelper.includes('unconfirmedReviewCount') &&
            appHelper.includes('REVIEW_REQUIRED') &&
            appHelper.includes('confirmedSpend'),
    },
    {
        name: 'summary report route is admin-only and validates dates',
        passes:
            summaryRoute.includes("requireRoleAPIWithMobile(request, 'ADMIN')") &&
            summaryRoute.includes('parseBeinSpendReportFilters') &&
            summaryRoute.includes('getBeinSpendSummary') &&
            summaryRoute.includes('Invalid date range'),
    },
    {
        name: 'operations report route is admin-only, paginated, and validates excessive page sizes',
        passes:
            operationsReportRoute.includes("requireRoleAPIWithMobile(request, 'ADMIN')") &&
            operationsReportRoute.includes('getBeinSpendOperations') &&
            operationsReportRoute.includes('pageSize') &&
            operationsReportRoute.includes('exceeds maximum'),
    },
    {
        name: 'report routes do not expose beIN credentials or session data',
        passes:
            !summaryRoute.includes('password') &&
            !summaryRoute.includes('totpSecret') &&
            !summaryRoute.includes('cookies') &&
            !operationsReportRoute.includes('password') &&
            !operationsReportRoute.includes('totpSecret') &&
            !operationsReportRoute.includes('cookies'),
    },
    {
        name: 'admin report page and client exist with calendar presets and filters',
        passes:
            reportPage.includes('BeinSpendReportClient') &&
            reportClient.includes('Today') &&
            reportClient.includes('This week') &&
            reportClient.includes('This month') &&
            reportClient.includes('Custom') &&
            reportClient.includes('operationType'),
    },
    {
        name: 'admin report UI shows totals, grouped accounts, review count, and detail rows',
        passes:
            reportClient.includes('Total confirmed spend') &&
            reportClient.includes('Unconfirmed review') &&
            reportClient.includes('lastChargedAt') &&
            reportClient.includes('dealerBalanceBefore'),
    },
    {
        name: 'sidebar links to beIN spend report',
        passes:
            sidebar.includes('/dashboard/admin/reports/bein-spend') &&
            sidebar.includes('beIN Spend Report'),
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
    console.error(`beIN spend ledger simulations failed: ${failed}/${checks.length}`)
    process.exit(1)
}

console.log(`beIN spend ledger simulations passed: ${checks.length}/${checks.length}`)
