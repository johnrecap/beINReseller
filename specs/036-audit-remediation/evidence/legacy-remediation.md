# Local legacy compatibility — 2026-09-08

T039/T040 local implementation is accepted; live data correction and full migration rehearsal are not. The default `scripts/preflight-audit-remediation.ts` reads local sources only and returns BLOCKED with concrete migration/topology/release reasons. Its optional `--database --confirm-read-only` selects bounded aggregate inspection; it has no apply mode. No invocation targeted the restored, interactive or production database.

`inspectPanelReviewCompatibility` uses ordered IDs, a cursor, default 50 rows/20 pages and caps of 200 rows/100 pages. It returns category counts, completion/nextCursor and evidence-review action; it does not return cards, credentials, receipts or guessed balances. A caller can resume using the returned cursor. Reaching a page boundary leaves `complete=false` until a subsequent read establishes the end.

| Existing data | Local classification/action |
| --- | --- |
| Historical completion without proof/manual receipt | HISTORICAL_COMPLETION_EVIDENCE_HOLD; no effect/points backfill. |
| Legacy review, alias/empty selected package | Legacy classification; completion still needs matching attributable receipt and valid selected context. No automatic alias merge. |
| Negative/nonfinite amount, missing/wrong/duplicate canonical deduction | Conflict/hold; no clamping, fabricated deduction or financial correction. |
| Affirmative unsent operation | Revalidate all submission/dispatch/refund vetoes before the existing canonical pre-mutation closure. |
| Installment or uncertain post-attempt legacy refund | Evidence hold; deferred provider evidence is not synthesized. |
| Old dispatch insert | Revision remains zero; new due-time default and indexes work without rewriting its immutable identity. |

Seven synthetic compatibility DB cases, the historical completion/cursor regression, finite-money cases and foundation constraints pass. Test fixtures were cleaned; all 71 business tables were empty at final inspection. This establishes local model/guard behavior, not historical production data quality.

Migration prerequisites remain: empty `prisma/migrations/0_init/migration.sql` and missing `prisma/migrations/20260616120000_unique_refund_transaction_per_operation/migration.sql`. Obtain authoritative provenance and rehearse the reviewed baseline/upgrade under T052; historical files were not rewritten here. The added scheduling migration was applied only to the existing isolated audit schema.
