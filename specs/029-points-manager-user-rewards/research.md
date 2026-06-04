# Research: Points Settings Save And Manager-Owned User Points

## Decision 1: Current setting field names are canonical

**Decision**: The admin settings route accepts both current and legacy field names, but current field names win when both are present.

**Rationale**: The observed bug comes from storing legacy aliases in the client state and sending them back with current fields. The API currently prefers the legacy values, so a visible edit can be ignored while the save still succeeds.

**Alternatives considered**:

- Reject all legacy fields immediately. Rejected because older clients or stale browser bundles could fail during rollout.
- Keep legacy names preferred. Rejected because it preserves the current bug.

## Decision 2: The client only stores and sends current setting fields

**Decision**: The Points Settings client builds an explicit draft containing only current field names and sends an explicit save payload.

**Rationale**: Avoiding broad object spreads prevents hidden aliases from being re-submitted. It also makes the form state easier to reason about and test.

**Alternatives considered**:

- Continue storing the full server payload. Rejected because it caused the stale alias issue.
- Strip aliases only at submit time. Acceptable, but less robust than keeping the draft canonical from load through save.

## Decision 3: Success appears only after saved values are confirmed

**Decision**: The admin page shows success after the saved snapshot is applied or after a successful reload. If reload fails, it shows an error instead of a misleading success.

**Rationale**: The user's visible problem is "saved" without real change. Confirmation must be tied to readback, not only the write response.

**Alternatives considered**:

- Keep current success timing. Rejected because it can hide failed readback or stale values.
- Show success before reload and then warn if reload fails. Rejected because it is still confusing for admins.

## Decision 4: Manager-owned user points use a dedicated rate bucket

**Decision**: Add a separate manager-owned user points-per-1000-USD rate rather than reusing normal user-global points.

**Rationale**: The admin asked for a separate rate for users under managers. Reusing user-global would accidentally change normal users and manager-owned users together.

**Alternatives considered**:

- Use normal user-global rate. Rejected because it cannot be controlled independently.
- Use a percentage of the manager's points. Rejected because the existing system is points per 1000 USD, not percentage-based commissions.
- Add per-manager overrides now. Deferred because the request only requires one admin-defined rate.

## Decision 5: The new manager-owned user behavior is off by default

**Decision**: Default `managerOwnedUserPointsEnabled` is false.

**Rationale**: Existing production behavior is manager-only for manager-owned users. Defaulting off avoids surprise point balance changes after migration.

**Alternatives considered**:

- Enable automatically after deploy. Rejected because it changes payouts without explicit admin action.
- Infer enabled when the new rate is positive. Rejected because a stored positive rate should not silently activate behavior.

## Decision 6: Web and worker logic must be changed together

**Decision**: Update both the web-side point award path and `worker/src/lib/points.ts`.

**Rationale**: The repository has duplicated point award logic. If only one path changes, operations can award different points depending on the completion path.

**Alternatives considered**:

- Update only the web app. Rejected because worker-completed operations would stay on old behavior.
- Refactor both paths into one shared package in this feature. Deferred because it is a broader structural refactor; the immediate need is consistent behavior with minimal edits.
