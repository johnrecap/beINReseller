# Planned Login Health and Recovery Contract

FR-013–FR-020. NOT_IMPLEMENTED. Extends 027 classification/recovery while superseding its configurable disable threshold prospectively.

## Shared outcome policy

Extend the existing shared LoginFailure/LoginResult contracts with attempt context (revision, whether authentication HTTP actually started, and whether the existing recovery procedure is exhausted). Keep existing categories transport/rate_limit/captcha/credentials/unknown and safe failure codes. Terminal context is established by the orchestrator after existing recovery, not guessed from an isolated challenge page.

| Final outcome | Activity | Credential counter | Monitor |
| --- | --- | --- | --- |
| Explicit rejected credentials | false immediately | increment once for current attempt | credentials; password update |
| Exhausted CAPTCHA after actual attempt | false immediately | unchanged | captcha; login review |
| Invalid/unknown unauthenticated outcome after actual attempt | false immediately | unchanged | unknown; login review |
| Transport/proxy failure including 402/407/5xx | unchanged | unchanged | transport warning |
| 429/rate limit | unchanged | unchanged | rate_limit warning |
| Missing local solver configuration/revision before authentication starts | unchanged | unchanged | system warning; no false provider failure |
| Positive authenticated success for current active revision | true remains true | zero | clear current failure |
| Expired session or nonterminal challenge | unchanged | unchanged | continue existing bounded login/recovery |

No automatic activation; success while already disabled cannot clear quarantine. No retry-count/cadence changes. Missing CAPTCHA configuration after an actual challenge exhausts that attempt and follows the CAPTCHA row; missing configuration discovered before authentication follows the system row. Database unavailability is a persistence/system error, never a credential rejection. On missing revision, stop the attempt instead of sending untrackable authentication work.

## Persistence and caller coverage

Reuse existing fields. Persist allowlisted reason strings prefixed `LOGIN_HEALTH_V1:` with CREDENTIALS_REJECTED, CAPTCHA_EXHAUSTED, AUTH_REVIEW_REQUIRED, CONNECTION_FAILED, RATE_LIMITED or SYSTEM_ERROR. Derive category and recommended action from these codes. Decode old explicit rejection strings as credentials and other historical text as unknown without exposing it. Only terminal authentication reasons require login review; transport/system warnings do not suggest a password change.

Capture account revision before HTTP, write with atomic current-revision/isActive checks and advance updatedAt monotonically; one revision can count/disable only once. Never refetch revision and retry a stale failure write. Record warning timestamps/reasons without changing activity/counter. If no revision can be read or persistence fails, expose safe diagnostics and fail the current provider job; do not return healthy completion. Old concurrent results cannot overwrite manual recovery.

Mandatory caller matrix: `HttpClientService` result creation; queue processor login/reLogin wrappers and all operation/balance callers; `session-keepalive.ts` fresh/expired/CAPTCHA/no-key exits; `provider-report-reader.ts`; account-pool generic failure handling. Replace credential-only caller filters with the shared terminal policy. A transport outcome must not fall through into another generic counter that disables the account. Preserve the pool's unrelated genuine operational failure policy. Inspect all callers again with rg before implementation.

Positive authentication needs the existing positive session/control evidence. HTTP 200, a generic form or a page title alone never establishes success. Session/cache writes retain ownership and revision fencing. Disabled account blocks new assignment; in-flight uncertain purchases keep their existing evidence, reservations and settlement route. No financial compensation or reassignment is introduced here.

## ADMIN interfaces and recovery

GET `/api/admin/bein-accounts/login-failures` selects records with current failure/warning evidence independent of counter threshold. Preserve existing fields and add isActive, failureCode and failureCategory (including system for local warnings), plus explicit recovery guidance. Derive requiresLoginReview from terminal authentication category, not count; needsPasswordUpdate is credentials only. Keep threshold:1 as deprecated compatibility metadata and add policy:'first_terminal_failure'; the stored setting is not mutated.

The account list and LoginMonitorPanel display activity separately from category; current warning means lastLoginFailureAt is later than lastSuccessfulLoginAt or no success exists. Manual disablement without a login reason is not fabricated into an authentication failure. Handle no records and unreadable status explicitly.

Remove the editable threshold control/claims from SettingsForm, replacing them with localized first-terminal-failure policy text. Setting persistence/legacy reads remain compatible but cannot alter enforcement. No migration or mass reinterpretation disables old active rows.

Reset-and-activate remains ADMIN-only and uses existing `bein-account-recovery.ts` ownership checks. All activation entry points delegate to it: POST toggle-to-active, POST low-balance/reactivate, and PUT account edits that request inactive-to-active. Counter-only reset remains nonactivating. For combined edit/activation, narrowly extend the helper to accept the route's validated patch and existing attestation audit inside the same owned transaction; failed/busy recovery leaves all edited fields unchanged. Busy/reserved account conflicts return 409 without clearing someone else's locks, operation sessions or financial snapshots. Explicit recovery clears only the selected account's shared sessions/health and advances revision; stale workers cannot undo it. Creation of a new account retains existing behavior; this policy acts on subsequent login outcomes, not a fabricated initial login.
