# Research: Points Analysis Report

## Decision 1: Use the existing point ledger as the only source of truth

**Decision**: Build the report from `point_ledger_entries` and related read-only joins.

**Rationale**: The ledger already records owner, source type, source id, status, points, amount snapshot, rate snapshot, release data, and notes. Recalculating points from operations or Eid claims would risk mismatches and would not explain manual or reversal entries.

**Alternatives considered**:

- Recalculate from operations and Eid claims: rejected because it misses conversions, reversals, and legacy/manual entries.
- Add a new analytics table: rejected for v1 because it introduces sync risk and backfill work.

## Decision 2: Put the screen inside the Reports Center

**Decision**: Add a `points-analysis` tab to the existing Reports Center instead of creating another sidebar page.

**Rationale**: The user already noted the sidebar is crowded. Points Analysis is a report, not a settings screen.

**Alternatives considered**:

- Add a new sidebar item: rejected because it increases navigation clutter.
- Add it to Points Settings: rejected because settings answer "how points are configured", while analysis answers "what happened".

## Decision 3: Keep aggregation logic in a pure library

**Decision**: Create `src/lib/points/analysis.ts` for source labels, filters, summaries, and row view-model shaping.

**Rationale**: Unit tests can validate financial-adjacent logic without rendering React or hitting live APIs.

**Alternatives considered**:

- Put all mapping in the API route: rejected because it becomes hard to test and reuse for owner detail.
- Put mapping in the React panel: rejected because the frontend must not become the source of truth.

## Decision 4: Display all times in Africa/Cairo

**Decision**: Use existing `src/lib/egypt-time.ts` helpers for timestamps and date input conversion.

**Rationale**: The site recently standardized time display around Egypt time, and point audit screens must match the rest of the panel.

**Alternatives considered**:

- Browser local timezone: rejected because admin machines can vary.
- Raw UTC: rejected because it confused previous admin settings flows.

## Decision 5: Add indexes only if query review needs them

**Decision**: Start with existing indexes and add a migration only if date/source pagination queries show a real gap.

**Rationale**: Production has a live database. Avoid migrations that are not required, but do not ship an unbounded slow report.

**Alternatives considered**:

- Always add `created_at` indexes now: acceptable if query review requires it, but not assumed before implementation.
- No query review: rejected because the ledger can grow.
