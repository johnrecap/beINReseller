# Research and Connected Impact

Date: 2026-11-03. Source baseline: `7dd89fd119ca5426494e80620426cbaf63a5eec1`. These are local source findings, not production incident attribution.

## Verified source findings

| ID | Current evidence | Consequence |
| --- | --- | --- |
| OBS-01 | `src/app/dashboard/admin/bein-accounts/page.tsx:136` global mutation guard; `:411` page fieldset disabled by mutationBusy/loading; `:207` add awaits full list refresh | One command disables unrelated account controls; this does not prove the outer sidebar is disabled |
| OBS-02 | `src/components/ui/dialog.tsx:115` PanelDialog refuses close/Escape while busy; `src/components/admin/users/AddBalanceDialog.tsx` close guard; manager equivalent | A pending modal can intentionally intercept the page until completion |
| OBS-03 | `src/hooks/usePanelRequest.ts:51` command ownership/controller/uncertainty are hook-local; `src/lib/request-deadline.ts` includes response-body deadlines | Unmount is not an acceptable owner for long command certainty |
| OBS-04 | `src/app/api/admin/bein-accounts/[id]/check-balance/route.ts:60` job submission; 60-second polling loop and per-request Queue; job removal enabled | Request lifetime is coupled to external work; 45-second client deadline can precede the server response |
| OBS-05 | `worker/src/http-queue-processor.ts:1268` balance handler catch logs without rethrow | Queue completion can hide actual failure; timestamp polling then waits for timeout |
| OBS-06 | `worker/src/lib/bein-login-tracking.ts` records only credential failures and disables at configurable threshold, default three | First failure and other terminal authentication outcomes can leave an account active |
| OBS-07 | `src/app/api/admin/bein-accounts/login-failures/route.ts` selects counter >= threshold and omits activity; provider-report/keepalive/queue wrappers filter credential failures | Monitor and callers omit categories needed by the accepted policy |
| OBS-08 | `src/lib/bein-account-recovery.ts` guards reset/activate with account ownership/revision; toggle route uses its own activation path | Reuse the stronger recovery path; do not add a second recovery implementation |
| OBS-09 | `shared/reports/bein-provider-store.ts`, provider-report API and `src/hooks/useProviderReport.ts` provide admitted asynchronous display reads | Reuse admission/run fencing patterns in an independent balance namespace |
| OBS-10 | DashboardShell/SidebarFrame have no discovered global mutation busy state; sidebar links close the mobile dialog; UserStatsDialog correction uses raw fetch | Navigation-wide freeze remains NOT_REPRODUCED; add delayed-body, overlay and shell tests before a causal claim |
| OBS-11 | `src/app/api/admin/bein-accounts/[id]/low-balance/reactivate/route.ts:30` and account `[id]/route.ts:144` PUT also set isActive directly | Recovery coverage must include these routes, not just toggle/reset; combined edits need atomic recovery |
| OBS-12 | `worker/src/http-queue-processor.ts:2446` currently calls markAccountFailed for insufficient dealer balance, not login transport; implementation is `worker/src/pool/account-pool-manager.ts:377` | Preserve unrelated general failure policy; audit login fallthrough without inventing an existing transport caller |

## Decisions

- **D01 — Dashboard command ownership.** Decision: persist control state across routes with safe same-tab tombstones. Rationale: local refs die with dialogs/routes. Alternative rejected: only removing disabled attributes would allow duplicates and lose uncertainty.
- **D02 — Hide pending work.** Decision: keep pre-submit modality, allow pending hide and nonblocking status. Rationale: preserve confirmation/keyboard semantics while restoring independent use. Rejected: forced global pointer-events overrides and making all dialogs permanently nonmodal.
- **D03 — Async balance requests.** Decision: Redis request records plus existing operations queue/leases. Rationale: attribution survives job removal. Rejected: longer HTTP timeouts and DB timestamp comparison. Use five-minute queue wait, sixty-second execution and five-minute terminal retention, as explicit new balance defaults inspired by existing report bounds.
- **D04 — First terminal login quarantine.** Decision: accepted first-failure policy supersedes the 027 threshold only when this feature is implemented. Rationale: make unusable accounts visible immediately. Preserve transport classification and manual recovery from 027. Rejected: treating every login exception as a wrong password or disabling on normal session expiry.
- **D05 — Existing data fields.** Decision: safe typed reason codes in the current reason string, with legacy string decoding. Credential counter remains credential-only. Rationale: avoids speculative schema changes/backfill; status is derived with isActive and timestamps.
- **D06 — Evidence boundaries.** Decision: current plan proves documentation scope only. Source inspection and old tests do not prove navigation smoothness, production deployment or provider correctness. The missing `specs/027-bein-connection-mode/evidence/plan-guard.json` remains a historical evidence gap; it is not manufactured here.

## Complete shared-consumer inventory

Paths are repository-relative. Each row is mandatory implementation/QA coverage, not a claim that every consumer currently has the same defect. Paths ending in a directory cover the named component files inside it.

| Group | Existing consumers | Conflict identity and coverage |
| --- | --- | --- |
| C01 beIN | `src/app/dashboard/admin/bein-accounts/page.tsx` | beinAccount/id for edits, activation, reset and refresh; account-create/digest of normalized username for creation |
| C02 user money | `src/components/admin/users/AddBalanceDialog.tsx`, `src/components/manager/users/ManagerAddBalanceDialog.tsx`, `src/components/admin/users/UserStatsDialog.tsx`, `src/components/admin/users/CreditControlDialog.tsx` | user/id; correction and balance changes conflict; ordinary statistics reads do not |
| C03 user administration | `src/components/admin/users/CreateUserDialog.tsx`, `EditUserDialog.tsx`, `TransferOwnershipDialog.tsx`, `TransferToAgentDialog.tsx`; `src/components/manager/CreateUserDialog.tsx`; `src/components/users/ResetPasswordDialog.tsx` | user/id; creation normalized username; transfer also locks destination agent/manager resource |
| C04 agents/credit | `src/components/admin/agents/AdminAgentsClient.tsx`, `src/components/agent/AgentDashboardClient.tsx`, `src/components/admin/credit-requests/AdminCreditRequestsClient.tsx`, `src/components/credit-requests/RequestCreditForm.tsx` | affected user/agent plus creditRequest/id; funding source resource included for money transfers |
| C05 financial/operations | `src/components/admin/financial-review/FinancialReviewClient.tsx`, `src/components/renewal/InstallmentPaymentFlow.tsx`, `src/app/dashboard/operations/active/page.tsx` | operation/id; preserve durable server idempotency/confirmation and review proof |
| C06 configuration/proxies | `src/components/admin/permissions/AdminPermissionsClient.tsx`, `src/app/dashboard/admin/proxies/page.tsx` | edited user/role or proxy/id; bulk operations acquire their full affected set in one claim |
| C07 reward/dialog shell | `src/components/eid-rewards/EidRewardPopup.tsx`, `src/components/layout/SidebarFrame.tsx`, `src/components/layout/DashboardShell.tsx`, `src/components/ui/dialog.tsx` | reward/actor/campaign; sidebar is navigation state, never a command-wide lock |

T001 reruns call-site discovery before code changes to catch newly added consumers. All shared consumers receive coverage; first verify C01 then propagate in C02–C07. A global configuration save may legitimately lock its configuration scope, but not navigation or unrelated data.

## External and historical limits

- No authenticated browser reproduction, provider operation, production DB query or server resource measurement was performed for this documentation delivery.
- Previously reported anonymous HTTP timings and 32 login fixture tests are historical exploratory context; they are not current acceptance evidence for the new behavior.
- The 027/036 production parity, provider observations and historical evidence contracts remain separate open obligations. No old task is rechecked or accepted here.
- No unresolved product choice remains. Unknown deployed state is a release verification prerequisite. A future discovery that changes the contract requires a spec amendment and rerun of analyze before implementation continues.
