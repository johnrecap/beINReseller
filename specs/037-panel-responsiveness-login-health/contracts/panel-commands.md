# Planned Panel Command Contract

Applies to FR-001–FR-007/FR-021–FR-022. NOT_IMPLEMENTED. Existing endpoints and financial evidence rules remain authoritative.

## Ownership and conflict

The dashboard-scoped provider owns the request promise/controller independently of dialogs/routes. Preserve usePanelCommand's existing caller shape where possible through an adapter; add an explicit action/resource conflict set and attempt identity to each caller. Do not reuse a single AbortController across unrelated commands. Same resource mutations serialize; reads remain independent. Transfers acquire source and destination resources together, and bulk mutations claim the complete set or reject without partial sending. Actor identity is included in every key. See C01–C07 in research for required consumers.

Claim synchronously before the first await; save a minimal tombstone before sending non-idempotent work. A failed storage write prevents that protected dispatch and exposes a localized recoverable error. The read-only refresh route instead uses its server-owned request status. Payloads are frozen for the attempt. A newer draft never changes an in-flight amount, account or action.

## Lifecycle and certainty

PENDING ends as SUCCEEDED, FAILED or UNCERTAIN. A documented pre-effect rejection is FAILED; a timeout, aborted response, malformed response or server error that cannot establish nonexecution is UNCERTAIN. Only known failure releases a mutation claim for explicit retry. No automatic retry is added.

Preserve the existing 45-second command deadline including body consumption. An HTTP abort is never server cancellation. Hiding or internal navigation does not abort the owned mutation. On same-tab reload a persisted PENDING marker becomes UNCERTAIN; never replay a payload from storage. Store only actor/action/resource/attempt/state/timestamps and optional server requestId, not names, credentials, amounts, notes or raw errors. Clear settled tombstones; uncertain financial tombstones remain until authoritative reconciliation. Do not expire them just to enable a button.

Actor change destroys memory payloads/drafts and prevents prior-actor rendering; actor-partitioned tombstones remain private to the matching actor in that tab. Logout is not proof that pending work failed. Other tabs/devices continue to rely on existing server guarantees; universal financial idempotency is outside this feature.

If an endpoint has an authoritative operation/request identity, reconcile through that existing endpoint. Where it has none, keep an actionable unresolved status and require review through the existing transaction/activity surface; an ordinary balance GET is not reconciliation. Do not add a generic retry/clear button that bypasses this rule. For refresh only, follow the balance contract's active lookup and bounded read-only retry.

## Presentation and navigation

Keep modality before submitting sensitive actions. Pending modal X/Escape/Hide removes that modal and its portal overlay, preserving command state and a compact nonmodal status in the shell; show no full-screen pending overlay. Pending form submission remains disabled, while Hide remains enabled. Restore focus to its opener if connected, otherwise to a stable shell control. A hidden form keeps its draft in memory during internal navigation; secrets are never restored from persistent storage after a reload.

Do not automatically close validation or confirmed-error forms; retain correctable values. Announce pending/completed/failed/uncertain state through existing localized status/toast patterns with restrained aria-live feedback. Multiple commands remain separately identifiable without exposing sensitive payloads. A completion after navigation updates only its keyed store/list cache; it does not reopen a modal or navigate the user back.

Use proper Radix lifecycle cleanup rather than forcing document.body pointerEvents. Route loading is confined to the main content boundary; SidebarFrame and header retain input handling. Existing true confirmation, unavailable-data and permission restrictions remain scoped and distinguishable from pending work.

## Required UI evidence

With delayed fetch and delayed response.json separately, use actual pointer clicks, elementFromPoint and focus assertions after hiding, after mobile menu dismissal and after navigation. Cover returned success, validation, uncertain 500, timeout, stale completion, double submit, same-target conflict, different-target concurrency, reload and actor change. A disabled-attribute assertion alone cannot prove the page is interactive.
### Header tracker visibility

Command ownership stays in the dashboard provider. The independent header control starts closed, opens only on user input and supports Close and Escape with focus returned to the trigger. Results and navigation never reopen a closed tracker. Expired or uncertain display reads have account-row feedback and can be reconciled without dismissing financial receipts.
