# Panel UI repairs — 2026-09-08

Scope: web panel on desktop and responsive browsers. Preserve the existing logo, palette and design. Native app/store implementation, production, restored databases, provider traffic and subagents are excluded. The previous Spec Kit 036 release gates remain separate and open.

## Rollback and work location

Before fixes, commit `bd42692c1259ec5428ad8c4fc4cfb2adf2870e8c` was pushed to the maintainer-confirmed `johnrecap/beINReseller` repository on `034-web-project-memory`; the remote hash matched. It preserves prior changes, including historical excluded-consumer code. It is not a release approval. Repairs are local on `codex/panel-ui-repairs`, not pushed or deployed.

## Accepted repair checklist

All fourteen implementation items below are locally complete within their bounded scope. Verification limitations follow.

| ID | Delivered behavior | Source |
| --- | --- | --- |
| UI-01 | Login checks the current account on the server. Valid sessions redirect; revoked cookies use official sign-out once before the form; lookup outages show recovery. Edge middleware no longer redirects login from JWT presence alone. | `src/app/login/page.tsx`, `src/components/auth/LoginPageClient.tsx`, `src/lib/auth.config.ts` |
| UI-02 | Transactions/notifications refresh existing web identity before owner-scoped access. Revoked web sessions cannot fall through to bearer auth. Existing bearer branch preserved. | Both API routes; `src/lib/auth-utils.ts` |
| UI-03 | Login callback accepts only same-origin dashboard destinations; navigation requires a successful AuthJS result. | `src/lib/auth/safe-panel-redirect.ts`, `LoginForm.tsx` |
| UI-04 | Atomic Redis Lua and synchronous memory failure increments; three failures trigger 120 seconds, repeated attempts do not extend cooldown. Status reads cannot delete a concurrently replaced window. | `src/lib/auth/login-attempts.ts` |
| UI-05 | Configuration errors remain service errors; only credential/cooldown failures fetch guidance, with a five-second deadline. Password toggle, autocomplete and feedback accessibility repaired. | `LoginForm.tsx`, `loginFeedback.ts`, opt-in `FloatingInput.tsx` |
| UI-06 | Fifteen-second list deadline, cancellation, latest-response protection, loading/error/empty distinction and explicit 401/403 states. Applied to history, transactions, admin/manager users, notifications and beIN accounts. Admin counts have separate loading/error handling. | `src/hooks/usePanelRequest.ts`, `src/components/ui/PanelLoadError.tsx`, list callers |
| UI-07 | Encoded user search, manager page reset, page clamping after removal, deleted-user filtering before server pagination/count. | User tables and `src/app/api/manager/users/route.ts` |
| UI-08 | Web sorting/limits validated server-side; stable ID tie-breaker, page reset on sort, actual API total in pagination. Existing bearer ordering preserved. | `src/lib/panel-list-query.ts`, operations/transactions routes, `PanelTableControls.tsx` |
| UI-09 | History shows projected settlement/messages/next actions, maps compound status keys and does not equate accepted cancellation with a recorded refund. | `OperationsTable.tsx`, `HistoryPageClient.tsx`, `HistoryFilters.tsx` |
| UI-10 | Notification popup stays within the viewport in each direction. HTTP failures retain unread state; mutations block duplicate clicks and invalidate old polling. Escape closes the popup. | `src/components/NotificationBell.tsx` |
| UI-11 | beIN mobile header wraps; panel dialogs have viewport bounds and internal scroll. Edit-user dialog uses Radix and theme colors. Opt-in also applied to proxies, ownership transfer, manager creation and password reset. | `ui/dialog.tsx` and panel dialog callers |
| UI-12 | Mobile sidebar uses Radix focus containment, Escape, scroll lock and focus return; closed mobile links are absent. Desktop layout preserved. | `SidebarFrame.tsx`, `Sidebar.tsx`, `Header.tsx` |
| UI-13 | Operations/transactions reuse existing Table primitives, panel tokens, accessible sort headers and pagination. Default shared primitive styles are preserved. | `ui/table.tsx`, `PanelTableControls.tsx`, `src/styles/tokens.css` |
| UI-14 | Matching ar/en/bn keys; localized login/history/transactions headings and sidebar sections; logical alignment. Provider text is preserved. | Translation catalogs and affected panel components |

## Verification

- Final complete unit suite: **826 passed, zero failed/skipped**, including all **18 repair cases**. The earlier 819-case run is superseded by this complete rerun.
- Isolated Redis: **1 passing test**, including 30 concurrent failures, non-extending TTL and counter removal. A new loopback process uses an ephemeral port, then is stopped and its temporary directory removed. Sandbox startup attempts failed; authorized execution outside that process sandbox passed. Interactive Redis/DB was not used.
- Browser: **33 passing scenario groups**, no page errors. Actual components and current generated CSS; explicit dependency doubles and intercepted networking. Checks include ar/en/bn at 360/390/768/1280/1440, 640px-tall dialogs, 200% zoom, keyboard focus, login errors/deadline/redirect/revocation, server sorting/actual totals, encoded search/page reset, permission errors, stale response rejection, notification mutation failure and panel-token/default-style isolation. Screenshots reviewed for login, edit dialog and beIN dialog.
- Root TypeScript passed. Scoped lint: **46 files, zero errors/warnings**; the final seven-file recheck, including the browser harness and final edits, also passed. Diff/UTF-8/BOM checks passed for all 50 changed/new paths; excluded implementation and schema/worker/package files are unchanged.
- Isolated Next/Turbopack production build **passed compilation, TypeScript and page generation** in `E:/work/panel_bien_sport/panel-ui-build-20260908`. No environment files copied. Placeholder endpoints and a Node socket guard blocked services/provider traffic; expected blocked-Redis logs occurred. The fixture needed a wider Turbopack filesystem root and root/worker dependency junctions. Source build config and serving `.next` were untouched.
- Existing middleware-convention and stale Browserslist warnings remain. No package/lockfile/schema/migration/worker/native-app/store implementation changes.

Reproduce:
- `node --import tsx --test tests/unit/panel-ui-repairs.test.ts tests/unit/login-attempt-guidance.test.ts tests/unit/login-form-feedback.test.ts`
- `node tests/browser/panel-ui-repairs.cjs` with headless Chrome and Playwright available; set `PLAYWRIGHT_MODULE` for the desktop runtime and optionally `PANEL_QA_OUTPUT`. Default artifacts: ignored `output/panel-ui`.
- Select a local Redis-compatible binary in `PANEL_TEST_REDIS_BINARY`, then `node --import tsx --test tests/integration/panel-login-redis.test.ts`. Explicitly skipped without that binary selection.

## Token coverage and limits

There are **9 shared Table instances in 9 panel files**, and **35 native HTML table instances in 23 files**. Three shared instances opt into the new panel table variables: operations, transactions and beIN accounts. This is not whole-panel tokenization.

Remaining native groups: active operations; inactive users/logs; admin agents/credit/permissions; activity/analytics/balance/credit/integrity/points reports; beIN spend; deleted users/admin users/user statistics; agent dashboard; credit-request form; manager deleted/users; renewal export/contracts/installment flow. Export/provider-layout tables need their own visual contract rather than mechanical conversion.

The unchanged seven original shared-table consumers retain the primitive's default contract except beIN's explicit opt-in; browser tests verify default-versus-panel isolation, not every interaction in all seven screens. Edit/beIN dialogs were exercised visually; the other bounded opt-in dialog call sites were checked statically/types, not every form action.

These results do not prove a real authenticated production HTTP exchange, provider renewal/payment/refund correctness, migration compatibility or release readiness. Memory fallback is per process, not distributed rate limiting during Redis outages. Existing release gates, other legacy table layouts, excluded surfaces and unrelated old copy remain separate work.
