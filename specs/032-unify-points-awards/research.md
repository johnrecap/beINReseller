# Research: Unified Operation Spend Points

## Decision: Use one shared pure award policy

**Rationale**: Current web and worker code have separate recipient-routing logic. That is the root cause of inconsistent admin-owned behavior. A pure shared policy gives both sides the same eligibility and recipient decisions while keeping database access local to each runtime.

**Alternatives considered**:

- Keep duplicated web and worker logic and update both. Rejected because future changes can drift again.
- Move all awarding into a web API called by worker. Rejected because it couples worker reliability to a live web request and adds operational failure modes.
- Put shared code under the worker and import it from web. Rejected because the web app currently excludes worker code.

## Decision: Admin-owned direct users receive normal user points

**Rationale**: User decision is explicit: the user under admin receives points, not the admin. The normal-user rate is the clearest existing rate bucket for that behavior.

**Alternatives considered**:

- Admin receives manager-rate points for direct users. Rejected by user decision.
- Create a new admin-owned-user rate bucket. Rejected for first release because the user asked to fix the logic, not introduce another rate field.

## Decision: Unowned users receive no points

**Rationale**: Awarding unowned users is risky because it can hide dirty ownership data. A legacy admin-created fallback is allowed only when there is no current owner evidence and the creator is an active admin.

**Alternatives considered**:

- Award every active normal user even with no owner. Rejected because it can grant points to records with broken ownership.
- Block legacy admin-created users. Rejected because existing production data may still represent admin ownership by creator only.

## Decision: Manager ownership keeps precedence over agent assignment

**Rationale**: Existing web and worker code already prioritize manager ownership when present. Keeping this precedence avoids changing manager-owned behavior while transfer cleanup work handles dirty ownership separately.

**Alternatives considered**:

- Agent assignment wins over manager ownership. Rejected because it would change current manager-owned behavior and could surprise admins.
- Award all detected owners in dirty data. Rejected because it can double-award.

## Decision: Manual charged financial review should award points

**Rationale**: If admin confirms that a completed operation was charged and should be closed as completed, it should not be excluded from operation-spend points. The same idempotent award process prevents duplicates.

**Alternatives considered**:

- Keep manual financial-review closure excluded. Rejected because it creates a completed-operation path with missing points.
- Require manual points adjustment by admin. Rejected because it is error-prone and not consistent with automatic completion paths.

## Decision: No historical automatic rewrite

**Rationale**: Historical point entries are financial-adjacent records. Rewriting them without a separate audit would be risky.

**Alternatives considered**:

- Automatically backfill old completed operations. Rejected because it can create unexpected balance-equivalent rewards.
- Delete old wrong admin entries. Rejected because historical corrections need a separate reviewed plan.
