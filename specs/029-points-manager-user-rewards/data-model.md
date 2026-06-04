# Data Model: Points Settings Save And Manager-Owned User Points

## PointProgramSettings

**Purpose**: Stores global point program controls.

**Existing important fields**:

- `id`: singleton settings id.
- `pointsEnabled`: whether spend-based points can be awarded.
- `pointsStartAt`: earliest completion date eligible for spend points.
- `cashConversionPoints`: points needed for conversion.
- `cashConversionAmountUsd`: balance amount for conversion.

**New field**:

- `managerOwnedUserPointsEnabled`: boolean, defaults to false. Controls whether users under managers receive their own extra operation spend points.

**Validation rules**:

- When disabled, manager-owned users do not receive their own extra points even if a rate exists.
- The setting must be saved in the same admin transaction as the related point rules.

## PointRule

**Purpose**: Stores points per 1000 USD for defaults and owner overrides.

**Existing owner types**:

- `USER_GLOBAL`: normal user default rate.
- `AGENT_DEFAULT`: default agent rate.
- `AGENT_OVERRIDE`: specific agent override.
- `MANAGER_DEFAULT`: default manager/admin-style rate.
- `MANAGER_OVERRIDE`: specific manager override.

**New owner type**:

- `MANAGER_OWNED_USER_DEFAULT`: default rate for users who are under managers when the new setting is enabled.

**Validation rules**:

- `MANAGER_OWNED_USER_DEFAULT` uses `ownerUserId = null`.
- Rates are non-negative numbers.
- A zero rate is valid and means no points are produced for that rate.
- Blank override inputs do not create override rules.

## Admin Points Settings Snapshot

**Purpose**: The data the admin page loads and saves.

**Fields**:

- Program settings: points enabled, start date, conversion ratio, manager-owned user enablement.
- Defaults: normal user rate, manager-owned user rate, agent default rate, manager default rate.
- Agent overrides: list of agents with optional override rates.
- Manager overrides: list of managers with optional override rates.

**Rules**:

- The client draft contains only current field names.
- The API may accept legacy aliases but never prefers them over current fields.
- Save success is only shown after the displayed draft matches persisted values.

## Operation Point Recipient

**Purpose**: Represents one account that should receive points for a completed operation.

**Fields**:

- `ownerUserId`: recipient account id.
- `ownerRoleAtTime`: actual role stored in the point ledger.
- `rateKind`: rate bucket used to calculate points.

**Rate kinds**:

- `USER`: normal user-global rate.
- `AGENT`: agent default or override rate.
- `MANAGER`: manager default or override rate.
- `MANAGER_OWNED_USER`: dedicated manager-owned user rate.

**Routing rules**:

- Agent-owned users with no manager-winning path keep existing USER + AGENT behavior.
- Manager-owned users keep existing MANAGER award behavior.
- When enabled, manager-owned users also receive a USER ledger entry calculated from `MANAGER_OWNED_USER_DEFAULT`.
- Direct admin-owned users keep existing admin-as-manager behavior.

## PointLedgerEntry

**Purpose**: Immutable point balance evidence.

**Rules**:

- New entries include amount and rate snapshots.
- Existing rows are not updated, deleted, or recalculated by this feature.
- Historical corrections, if needed, must use a separate reviewed reversal workflow.
