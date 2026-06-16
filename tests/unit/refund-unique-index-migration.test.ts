import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

test('refund transactions are protected by the existing partial unique index per operation', () => {
    const migration = readFileSync(
        join(process.cwd(), 'prisma', 'migrations', '20260216193000_add_review_required_and_financial_guards', 'migration.sql'),
        'utf8'
    )

    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "uq_transactions_refund_once"/)
    assert.match(migration, /ON "transactions" \("operation_id"\)/)
    assert.match(migration, /WHERE "operation_id" IS NOT NULL AND "type" = 'REFUND'/)
    assert.equal(
        existsSync(join(process.cwd(), 'prisma', 'migrations', '20260616120000_unique_refund_transaction_per_operation', 'migration.sql')),
        false
    )
})
