# Research: Spend-Based Points and Cash Redemptions

## Decision: Award points only when operation status is COMPLETED

**Rationale**: The user explicitly chose completed-only earning. This avoids premature point visibility and reduces reversal complexity for operations that fail, expire, or are cancelled before completion.

**Alternatives considered**:

- Award at balance deduction and reverse later. Rejected because it exposes points before successful subscription spend.
- Award pending points at deduction and release at completion. Rejected because the user wants points to appear only after actual spend.

## Decision: Use `operation.amount` as the point source amount

**Rationale**: The user chose the amount deducted from the user's balance. This aligns point earning with the visible panel accounting value and avoids mixing dealer cost or margin logic into rewards.

**Alternatives considered**:

- Dealer/beIN cost. Rejected because it can differ from the user's charged amount.
- Profit/margin only. Rejected because the requested model rewards spend, not profit.

## Decision: No historical spend backfill

**Rationale**: The user explicitly requested earning from the feature start forward only. Admin-controlled `pointsEnabled` and `pointsStartAt` provide a clear operational boundary.

**Alternatives considered**:

- Backfill from migration date. Rejected because deployment time is not a business-controlled start.
- Backfill all completed operations. Rejected because it would apply points to old spend.

## Decision: Manager-owned users award manager only

**Rationale**: The user explicitly said users under a manager do not receive points; the manager receives points for their users' spend.

**Alternatives considered**:

- Award user and manager. Rejected because it contradicts the requested manager model.
- Award user only. Rejected because manager incentives are required.

## Decision: Agent-owned users award both user and agent

**Rationale**: The user explicitly said the agent and the user under the agent both earn points based on admin-defined values.

**Alternatives considered**:

- Award agent only. Rejected because user earning is required for agent-owned users.
- Award user only. Rejected because agent earning is required.

## Decision: Convert points to balance immediately

**Rationale**: The user chose immediate conversion without admin approval. This turns points into real balance at any time when enough points are available and settings are valid.

**Alternatives considered**:

- Approval workflow. Rejected because it conflicts with "at any time".
- Immediate conversion with daily/monthly caps. Rejected for v1 because not requested.

## Decision: Fix zero override semantics

**Rationale**: Existing rate lookup treats override rate `0` as missing and falls back to default. Admin-configured values must be exact, including zero, so an owner can be intentionally excluded from earning.

**Alternatives considered**:

- Keep fallback for zero. Rejected because it makes zero overrides unusable.

## Decision: Keep legacy rewards catalog separate from cash conversion

**Rationale**: Existing reward catalog/redemption flow does not credit balance and requires admin decision. Cash conversion is a new immediate financial path. Keeping them separate reduces risk and preserves old audit history.

**Alternatives considered**:

- Reuse reward redemptions for cash conversion. Rejected because it overloads catalog semantics and approval states.

## Existing point creation removal targets

The old premature point creation paths found during implementation were:

- `src/app/api/admin/credit-requests/[id]/decision/route.ts`: approval previously created pending user and agent point ledger entries with `CREDIT_REQUEST`.
- `src/app/api/manager/users/[id]/balance/route.ts`: manager deposit previously created pending manager point ledger entries with `MANAGER_TOPUP`.
- `src/app/api/admin/credit-requests/route.ts`: admin list preview still calculates legacy request point estimates for display only; it does not create ledger rows.
- `src/app/api/admin/points/release/route.ts`: legacy admin release remains for historical pending entries and is not part of new spend earning.
- `src/app/api/admin/rewards/redemptions/[id]/decision/route.ts`: legacy catalog redemption remains separate from immediate cash conversion.

Implementation verification command used to find creation targets:

```powershell
rg "pointLedgerEntry.create|calculatePoints|getManagerTopupRate|getUserCreditRequestRate|getAgentCreditRequestRate" src worker tests
```
