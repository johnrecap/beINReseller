# Research: Eid Reward Audience And Copy

## Decision: Use role audience plus per-user exceptions

**Rationale**: The admin needs broad control and precise exceptions. Role selection handles the common case with simple controls, while per-user allow/deny exceptions avoid creating new roles or changing account structure.

**Alternatives considered**:

- Only role-based visibility: too blunt when one account needs a different rule.
- Only per-user allow list: too much admin work for campaigns.
- Advanced targeting by balance, activity, or claim history: useful later, but outside this request and higher risk.

## Decision: Deny wins over allow and role rules

**Rationale**: A deny exception is the safest operator intent. If an account is denied, no broader rule should accidentally re-enable it.

**Alternatives considered**:

- Last saved rule wins: confusing and harder to audit.
- Allow wins: unsafe for blocking accounts.

## Decision: Preserve current visibility by default

**Rationale**: This feature should not change who sees Eid Rewards until the admin intentionally changes settings.

**Alternatives considered**:

- Start with nobody allowed: safe but would unexpectedly hide the campaign.
- Start with only USER allowed: breaks current all-role reward behavior.

## Decision: Enforce audience in both status and claim

**Rationale**: Hiding UI is not security. The claim path creates points that can become balance, so it must reject out-of-audience users before any records are created.

**Alternatives considered**:

- Status-only enforcement: manually calling claim could bypass visibility.
- Claim-only enforcement: users could still see confusing UI.

## Decision: Store popup copy as a structured text bundle

**Rationale**: The current settings have only `beforeText` and `afterText`, while the popup has many visible fixed strings. A structured bundle lets one admin page control all text while keeping validation centralized.

**Alternatives considered**:

- Add many separate columns: clearer database columns but too much migration churn for copy-only data.
- Keep hardcoded UI text: does not meet the request.

## Decision: Keep `beforeText` and `afterText` compatible

**Rationale**: Existing admin settings and old rows already rely on these fields. Keeping them aligned with the text bundle prevents legacy breakage.

**Alternatives considered**:

- Remove old fields immediately: higher migration risk and unnecessary for this change.
- Use only old fields: cannot cover all visible popup text.

## Decision: Validate supported placeholders server-side

**Rationale**: Admins need templates for dynamic values, but unsupported placeholders create confusing UI. Server validation keeps saved copy predictable.

**Alternatives considered**:

- Replace any unknown `{word}` with blank: hides mistakes.
- Allow all placeholders: can display broken campaign text to users.
