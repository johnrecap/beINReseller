// Read-only preflight before resolving the failed production migration.

const failedName = '20261013120000_same_day_report_renewal'
const newColumns = {
  operations: ['renewal_flow_version', 'provider_pay_requested_at'],
  operation_fulfillment_proofs: [
    'report_date', 'provider_submitted_at', 'promo_code_snapshot',
    'customer_charged_amount',
  ],
}
const newConstraints = [
  'operations_renewal_flow_version_valid',
  'operation_fulfillment_proofs_legacy_contract_status',
  'operation_fulfillment_proofs_same_day_complete',
]

async function main() {
  await import('dotenv/config')
  const { Client } = (await import('pg')).default
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
  await db.connect()
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const history = await db.query(`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE (finished_at IS NULL AND rolled_back_at IS NULL)
         OR migration_name = $1
      ORDER BY started_at
    `, [failedName])
    const unresolved = history.rows.filter(row => !row.finished_at && !row.rolled_back_at)
    if (unresolved.length !== 1 || unresolved[0].migration_name !== failedName) {
      throw new Error(`Expected only ${failedName} to be unresolved; found ${unresolved.map(row => row.migration_name).join(', ') || 'none'}`)
    }
    if (history.rows.some(row => row.migration_name === failedName && row.finished_at)) {
      throw new Error(`${failedName} also has a completed record`)
    }

    const columns = await db.query(`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name IN ('operations', 'operation_fulfillment_proofs')
    `)
    for (const [table, names] of Object.entries(newColumns)) {
      for (const name of names) {
        if (columns.rows.some(row => row.table_name === table && row.column_name === name)) {
          throw new Error(`Partial schema: ${table}.${name} already exists`)
        }
      }
    }
    const legacyContract = columns.rows.find(row =>
      row.table_name === 'operation_fulfillment_proofs' && row.column_name === 'contract_status')
    if (!legacyContract || legacyContract.is_nullable !== 'NO') {
      throw new Error('Partial or unexpected schema: contract_status is not NOT NULL')
    }
    const constraints = await db.query(`
      SELECT conname FROM pg_constraint
      WHERE connamespace = current_schema()::regnamespace
        AND conname = ANY($1::text[])
    `, [newConstraints])
    if (constraints.rows.length) {
      throw new Error(`Partial schema: constraint ${constraints.rows.map(row => row.conname).join(', ')} exists`)
    }
    console.log(`READY_TO_RESOLVE_ROLLED_BACK: ${failedName}; no new columns or constraints found`)
  } finally {
    try { await db.query('ROLLBACK') } finally { await db.end() }
  }
}

main().catch(error => {
  console.error(`RECOVERY_PREFLIGHT_FAILED: ${error.message}`)
  process.exitCode = 1
})
