# Research: Operation beIN Account Card Search

## Decision 1: Use the Existing Operation and Spend Ledger Model

**Decision**: Use the existing operation-to-beIN account relationship for live operation linkage and the existing confirmed spend ledger for confirmed financial evidence.

**Rationale**: The schema already has `Operation.beinAccountId`, `Operation.cardNumber`, and `BeinAccountSpendLedger.operationId`. Creating another mapping table would duplicate state and increase conflict risk. The ledger is already unique per operation and captures snapshots needed for audit.

**Alternatives considered**:
- New `OperationBeinAccountLink` table: rejected because it duplicates `Operation.beinAccountId` without adding useful history for the current requirement.
- Only use ledger rows: rejected because not every operation has confirmed spend; history search must find failed, cancelled, expired, and review operations.

## Decision 2: Treat Confirmed Spend as Evidence, Not Just a Report Row

**Decision**: Keep confirmed spend rows separate and immutable for financial reporting. If the operation account and ledger account conflict, move the operation into review instead of silently rewriting history.

**Rationale**: This preserves audit integrity and prevents a report from hiding cases where the worker changed accounts or a retry produced inconsistent evidence.

**Alternatives considered**:
- Always overwrite `Operation.beinAccountId` from the ledger: rejected because it can hide a real workflow conflict.
- Ignore conflicts: rejected because the report is financial evidence.

## Decision 3: Normalize Card Search to Digits

**Decision**: Normalize card search input by removing non-digit characters and filtering using the normalized value.

**Rationale**: Operators often paste card numbers with spaces, separators, or copied formatting. Normalization improves search without adding fuzzy matching that could return surprising rows.

**Alternatives considered**:
- Exact raw string matching only: rejected because it fails on common input formatting.
- Fuzzy matching: rejected because it risks returning unrelated cards in financial audit flows.

## Decision 4: Add Ledger Card Search Index

**Decision**: Add an index for confirmed spend card-number lookup, optimized for card and date filters.

**Rationale**: `Operation.cardNumber` already has indexes, but confirmed spend report queries filter the ledger table. As ledger volume grows, searching `cardNumberSnapshot` without an index will degrade.

**Alternatives considered**:
- Join ledger to operations and use `Operation.cardNumber`: rejected because ledger already stores a card snapshot and report totals should be based on immutable evidence snapshots.
- No index: rejected because this report is an admin audit tool likely to grow over time.

## Decision 5: Keep User History Authorization Scoped to the Current User

**Decision**: Add card-number filtering to the existing user operation history endpoint while preserving current-user ownership.

**Rationale**: Users should search their own history. Global card investigation belongs in admin reports and financial review, not a user-facing endpoint.

**Alternatives considered**:
- Make `/api/operations` global for admins: deferred because it changes the endpoint semantics and is not required for the user-facing history search.

## Decision 6: Add Tests Around Filters and Link Consistency

**Decision**: Add focused tests for parsing/normalization, ledger filter behavior, operation history filter behavior, and account-link conflict behavior.

**Rationale**: The risky behavior is data filtering and audit consistency, not visual layout. Tests should protect the source-of-truth logic first, then build verification should catch integration issues.

**Alternatives considered**:
- Manual testing only: rejected because financial report filters are easy to regress.
- Broad end-to-end tests only: rejected because the project already has smaller unit/integration tests and the feature can be validated at service/API boundaries.
