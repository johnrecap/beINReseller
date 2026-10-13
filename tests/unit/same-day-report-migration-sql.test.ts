import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('same-day report enum values commit before constraints use them', async () => {
    const db = new PGlite()
    try {
        await db.exec(`
            CREATE TYPE "FulfillmentAuthority" AS ENUM ('NONE');
            CREATE TYPE "FulfillmentProofKind" AS ENUM ('LEGACY_CONTRACT_ONLY');
            CREATE TYPE "ProviderInvoiceClaimKind" AS ENUM ('LEGACY_PROOF');
            CREATE TABLE operations (id text PRIMARY KEY);
            CREATE TABLE operation_fulfillment_proofs (
                id text PRIMARY KEY,
                proof_kind "FulfillmentProofKind" NOT NULL,
                baseline_id text,
                baseline_captured_at timestamp,
                session_generation text,
                contract_observed_at timestamp,
                contract_status text NOT NULL,
                contract_package_name text,
                contract_type text,
                report_observed_at timestamp,
                report_row_fingerprint text,
                provider_amount decimal(18,2),
                currency text,
                report_package_name text,
                report_item_type text,
                dealer_context_hash text
            );
            INSERT INTO operation_fulfillment_proofs (id, proof_kind, contract_status)
            VALUES ('legacy', 'LEGACY_CONTRACT_ONLY', 'Active');
        `)

        const enumSql = readFileSync('prisma/migrations/20261013115959_same_day_report_enum_values/migration.sql', 'utf8')
        const constraintSql = readFileSync('prisma/migrations/20261013120000_same_day_report_renewal/migration.sql', 'utf8')
        await assert.rejects(db.exec(`BEGIN; ${constraintSql} COMMIT;`), /unsafe use of new value/i)
        await db.exec('ROLLBACK;')
        await db.exec(`BEGIN; ${enumSql} COMMIT;`)
        await db.exec(`BEGIN; ${constraintSql} COMMIT;`)

        await db.query(`INSERT INTO operation_fulfillment_proofs (
            id, proof_kind, report_date, provider_submitted_at, report_observed_at,
            report_row_fingerprint, provider_amount, currency, report_package_name,
            report_item_type, dealer_context_hash, customer_charged_amount
        ) VALUES (
            'same-day', 'SOLD_REPORT_SAME_DAY', DATE '2026-10-13', now(), now(),
            repeat('a', 64), 40, 'USD', 'Premium 3 Months', 'Package', repeat('b', 64), 40
        )`)
        const rows = await db.query<{ renewal_flow_version: number }>(
            `INSERT INTO operations(id, renewal_flow_version) VALUES ('new', 2)
             RETURNING renewal_flow_version`)
        assert.equal(rows.rows[0].renewal_flow_version, 2)
        await assert.rejects(db.query(`INSERT INTO operations(id, renewal_flow_version) VALUES ('bad', 3)`))
        await assert.rejects(db.query(`INSERT INTO operation_fulfillment_proofs (id, proof_kind)
            VALUES ('incomplete', 'SOLD_REPORT_SAME_DAY')`))
    } finally { await db.close() }
})
