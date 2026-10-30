# Requirements Quality Checklist: Login and proxy recovery
**Purpose**: Pre-implementation requirement quality, not proof of implemented behavior.
**Created**: 2026-10-30
**Feature**: [spec.md](../spec.md)

- [x] CHK001 Scope includes every login consumer and both deferred read versions; plan connected map identifies owners (FR-021–024).
- [x] CHK002 Exception applies only to deferred reads; purchases, account identity and evidence remain pinned (FR-008/010/021).
- [x] CHK003 Failure classes, GET-before-POST rejection, positive session evidence and retry bounds are explicit (FR-022/023).
- [x] CHK004 True credential counting, atomic disable and stale-writer protection are specified (FR-024/025).
- [x] CHK005 Recovery is manual ADMIN-only, distinguishes activation, conflicts on ownership and preserves rate/financial state (FR-025/027).
- [x] CHK006 Session route/account identity, legacy cache and operation ViewState constraints are explicit (FR-011–013/021).
- [x] CHK007 API compatibility, unknown-history semantics, ar/en/bn and loading/error/empty/RTL acceptance are defined (FR-026).
- [x] CHK008 Redaction, no migration/backfill, no Pay replay or financial proof weakening are explicit (FR-027).
- [x] CHK009 Every amendment requirement maps to acceptance, tasks and planned checks; tests-first and first-unit review are retained (analysis.md).
- [x] CHK010 Release drain/parity, two live KeepAlive cycles, rollback and local-vs-live evidence are distinct (FR-028).

## Notes
Reviewed against the accepted user plan, existing constitution and connected source. No blocking requirement ambiguity. Historical 036 evidence gaps are preserved, not waived. This checklist proves requirement quality only; implementation evidence is separate in evidence/verification.md, and live release acceptance remains pending.
