# Research: Renewal Confirmation Session Safety

## Decision: Treat `responseData` as unknown input everywhere

**Rationale**: Prisma JSON fields can return an object while older code expected a string. The production failure came from `JSON.parse(operation.responseData as string)` receiving an object and producing `"[object Object]" is not valid JSON`.

**Alternatives considered**:

- Convert all database writes back to strings: rejected because it preserves the fragile pattern and conflicts with Prisma JSON usage.
- Keep local try/catch around string parses: rejected because restore still fails before using Redis and future call sites can repeat the bug.

## Decision: Restore operation-scoped Redis session before legacy response-data fallback

**Rationale**: Final confirmation needs cookies and ViewState from the prepared package flow. Redis is already the intended server-side source for that operation-specific data.

**Alternatives considered**:

- Store full ViewState in database `responseData`: rejected because it increases row size and was already moved away from the database.
- Reload packages on confirm every time: rejected because it can select a different account/session and changes the final confirmation path.

## Decision: API records confirmation requested, not final Pay submitted

**Rationale**: The user clicking confirm only queues a worker job. The worker may still fail before beIN final Pay. Marking final Pay early blocks safe refunds and makes Review Required too broad.

**Alternatives considered**:

- Keep conservative Review Required for all COMPLETING operations: rejected because it traps pre-final-payment failures that can be handled safely.
- Move all charge logic to worker after final Pay: rejected for this change because it is broader and risks changing current balance timing.

## Decision: Worker sets final Pay evidence at the closest safe point

**Rationale**: Once the worker calls the beIN final payment path, unknown outcomes should go to review. Before that point, the system should not assume the owner was charged.

**Alternatives considered**:

- Set evidence only after result returns: safer for refunds but misses crashes/timeouts after the Pay request has left the process.
- Set evidence in the API: too early and caused the current ambiguity.

## Decision: Logs distinguish prepared versus completed

**Rationale**: COMPLETE_PURCHASE only prepares the package and pauses for user confirmation. It must not say the purchase completed successfully.

**Alternatives considered**:

- Leave logs as-is: rejected because production incident review depends on these logs.
