# Consumer and authorization contracts

**Active scope: panel only.** Store and phone-app modifications are excluded. Panel UI, responsive browser behavior, and the shared services/workers required by panel operations remain. **46 active tasks / 10 accepted; 25 requirements / 14 audit items.** Retired IDs are not reused. [Scope amendment](../evidence/panel-only-scope-amendment.md). Existing runtime code and historical evidence are preserved.

**Current status (2026-09-08):** Offers/quote and current-identity routing are implemented (T016/T017/T062); full role/owner matrices and progress/capability projection remain in the approved local backlog. T064 already implements decision-note validation. Reuse these changes; see [local backlog](local-backlog.md). Dated task counts above are historical.

## Panel operation auth

All protected handlers under `src/app/api/operations` use current-user panel authentication (web scope), current permission, and their existing owner/admin checks. Inventory every handler before replacing local helpers. Customer/store JWTs must not satisfy panel auth. Denials occur before writes; 401 means absent/revoked identity, 403 means authenticated but forbidden.

## Offers and queue identity

Implemented field contract for T015-T017: queue payload `actionRevision` identifies repeatable APPLY_PROMO preparation only; other financial jobs retain zero/omitted revision and reject nonzero input with INVALID_ACTION_REVISION before any write. Panel selection sends `quoteRevision`, checked against response-data quoteRevision under the operation lock. A mismatched revision or `refreshing: true` returns 409 before selection, dispatch or debit. Legacy revision-zero compatibility remains explicit; older clients must refresh to send quote consent; no implicit upgrade of an old selected snapshot.

Existing `POST /api/operations/:id/apply-promo` accepts a preparation revision/request identity. Same identity/payload replays using semantic JSON equality independent of persisted key order; a new valid revision creates a new preparation job; same identity/different payload conflicts. Response includes current revision and processing state. The renew page polls while that revision is pending and refreshes authoritative prices before payment.

### Authoritative offer and changing provider names (T016/T017, implemented; provider/live acceptance separate)

- A quote binds `quoteRevision`, `quoteState` (`PENDING`, `READY`, `FAILED`), `appliedPromoCode` (nullable), card/type context and server-derived packages. `packageKey` is opaque and unique within a quote; it is not a guessed beIN product ID. Public packages contain display name, price and currency; provider form/session material remains internal.
- `GET /api/operations/:id/packages` and apply responses project the same quote/revision/state. Existing `refreshing` is retained as a compatibility projection of PENDING. Old packages included in a pending response are not selectable. The panel checks state before array contents, ignores stale responses and polls only the current operation/revision. An explicit deadline ends ordinary polling with a retry/resume action, never false success.
- `draftPromoCode` is UI-only input. Applying, replacing or explicitly removing a code creates a new quote attempt. Apply API/dispatch payload `promoAction` is APPLY (default for legacy jobs, with a nonempty code) or REMOVE (explicitly reload an ordinary offer in the same card/type context, applied code null). Include this action in replay equality; removal is never inferred from missing selection input. Until ready, selection and both confirmation steps are disabled. A failed/unknown attempt cannot leave an earlier consent payable.
- Selection submits `quoteRevision` and `packageKey` (legacy index compatibility only inside a validated current snapshot). The server derives the applied code/name/amount from that quote; it never replaces the code from editable request text. A conflicting supplied code receives 409. Missing revision on an old in-flight flow requires an explicit refresh unless the documented revision-zero compatibility can prove the same snapshot.
- Final confirmation submits the accepted quote revision; compare quote, selected package, readiness and current operation state under lock before debit/dispatch. Do not allow the client to set price or checkbox fields.
- Provider reload drift before cart preparation produces a specific conflict, not automatic selection by old index, checkbox, fuzzy name or price alone. A fresh operation requires proven pre-sale state plus successful canonical closure/release of the old operation. Otherwise retain REVIEW_REQUIRED and its supported resolution action. Do not reset mutation evidence or repeat immutable COMPLETE_PURCHASE/final-payment jobs.
- Continue to display beIN's real package names. After payment, preserve the accepted package/proof snapshot; any broader report/contract alias support requires attributable provider fixtures and separate proof validation.

Implemented request details: apply requires integer actionRevision 1..2147483647,
promoAction APPLY/REMOVE (APPLY default) and nonempty promoCode for APPLY. REMOVE
stores explicit requested null while retaining the old applied code until its
worker result commits. Selection requires packageIndex and quoteRevision, accepts
packageKey inside that revision, and never sends the draft from the panel. Final
confirmation requires quoteRevision in both panel consumers; installment stays
on its original endpoint. Legacy selected snapshots without quote consent fail
closed. Coordinate web/worker cutover and resolve old preparation flows normally;
do not reset payment identity or force a financial close to upgrade a quote.
See [implementation evidence](../evidence/phase-4-implementation.md).

## Progress and review

Planned additive fields in safe consumer views: providerPaymentState, fulfillmentState, reviewRequired, settlementState, reasonCode, allowedActions, nextCheckAt. Expose only consumer-safe enums/codes, not account/session/evidence internals.

- Keep existing status values compatible where feasible; use reviewRequired and settlementState for older consumers, with updated first-party UI consuming both.
- REVIEW_REQUIRED must not display ordinary indefinite progress or success.
- A blocked panel refund or evidence hold is distinct from a completed canonical refund.
- Disabled actions display their reason; loading/empty/failed retry states preserve existing operation identity.

## Localization and accessibility

Reuse `src/i18n/translations/ar.ts`, `en.ts`, `bn.ts`. Existing financialReview/operations keys should be extended before adding another namespace.

Planned message concepts: decisionNoteRequired, reviewEvidenceMissing, settlementPending, settlementConflict, staleSelection, dispatchExhausted, accountNotReady, enforcementUnavailable. Final exact keys must avoid duplicates after catalog inventory.

Forms share server limits, distinguish decisionNote/evidenceNote, announce async errors with aria-live, focus invalid fields, retain keyboard use, and fit 360px/768px/1280px viewports with RTL. No new UI library or broad visual redesign.
