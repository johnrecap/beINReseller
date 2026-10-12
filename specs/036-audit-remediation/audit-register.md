# سجل نتائج المراجعة وخريطة الإصلاح

## Supplemental provider report browser — 2026-10-12

Authorized: admin Reports tab reads the selected beIN account's Sold Packages Details through existing HTTP workers; seven-day default, maximum 31-day range, localized en/ar/bn. Local synthetic verification only; no provider purchases, deployment or subagents. Existing identity/cooldown work is preserved.

| Obligation / source | Implementation and verification | Evidence / state |
| --- | --- | --- |
| Approved UI plan; localization/accessibility skills | Account picker, dates, paging/search, stale-response isolation, all three languages and narrow-screen QA | VERIFIED locally — 19 mocked-browser scenarios plus separate visual review |
| Approved HTTP plan; API/auth skills | ADMIN on every endpoint, minimal account DTO, queued read-only job and temporary Redis results | VERIFIED locally — 9 API cases and 3 native Redis/BullMQ/HTTP cases |
| Approved account/session safeguards | Exact account, lock ownership/heartbeat, reservation/keepalive exclusion, deadline cancellation; no financial writes | VERIFIED locally — reader/HTTP negatives, cancellation and source tracing; no live-state claim |
| Approved report criteria | Optional date/All controls, stable dealer and full scan; unchanged financial defaults | VERIFIED locally — complete Worker regression gate, including identity/cart/promo/Reports proof |
| Acceptance and handoff | Representative flow before wider tests; parser/identity regressions, types/build/browser, guide and ledger | VERIFIED locally — 855 root / 306 Worker cases, types/schema/scoped lint/isolated builds; temporary environment cleaned up |
| Live-provider and production acceptance | Outside this local-only execution; no claim from mocks | NOT_VERIFIED — intentionally not exercised |

Completed local implementation 2026-10-13. Detailed current evidence, separate semantic judgment and cleanup: [provider report browser](evidence/provider-report-browser-20261013.md). Existing release/financial/capacity obligations remain unchanged. No migration, live provider access, purchase, payment, deployment or subagents in this supplement.

## Supplemental localization and capacity — 2026-10-12

Authorized plan: localize the complete renewal surface using the selected ar/en/bn language; prepare 20 panel workers at concurrency 4 and DB pool 2 with graceful shutdown; compare against 10 workers at concurrency 8 using 200 synthetic users, 40 provider accounts and only 10 eligible accounts. No subagents, live provider/production actions, deployment or schema changes for this supplement. Temporary load tooling/data must live outside the repository and be removed after presenting aggregate results; retain only sanitized outcomes in the existing handoff.

- VERIFIED locally: complete renewal surface and signal/installment feedback use en/ar/bn tokens, including pending review/settlement headings. Twenty-nine mocked renewal browser scenarios, forty installment cases and fifteen provider-export comparisons pass; screenshots separately confirm mobile fit/direction and preserved provider names. English is the initial document language; persisted locale and live switching are tested.
- VERIFIED configuration: 20 unique worker names/IDs, concurrency 4, DB pool 2, five-minute PM2 drain, unchanged queue/provider limits, and nominal 70-connection core-service budget plus required headroom. `deployment/panel-workers.env.example` is explicit; PM2/Linux drain and actual production pool/process counts remain NOT_VERIFIED.
- VERIFIED local runtime: disposable native PostgreSQL/Memurai, real Next/AuthJS/BullMQ/Workers/maintenance and simulated provider HTTP, with 200 synthetic users, forty accounts/ten eligible. One full promo/cart/Reports/contract renewal passes before scaling. Node egress is restricted to four loopback ports; all service listeners are loopback. Full OS outbound isolation for the native binaries remains NOT_VERIFIED because no Administrator token was available; no service or firewall policy was installed.
- VERIFIED measurement / NOT MET capacity acceptance: both full twelve-minute mixed runs and two 200-renewal bursts per profile are measured. Twenty workers do not improve verified renewal throughput or queue wait; worker memory roughly doubles. Burst start p95 exceeds two seconds in both profiles; 20 workers repeat nine HTTP 500 transaction-acquisition errors (4.5% of starts). Censored operations, expected rejection, timeout, pending review and completed work are reported separately. This does not authorize production adoption.
- VERIFIED focused safeguards: reordered row/control identity with promo, wrong-cart stop before Pay, one admission from twenty same-card requests, delayed Reports held without repurchase, unchanged cooldown after rejected clicks, and interrupted-worker recovery to review with one synthetic Pay. Isolated session expiry stops before Pay. With two accounts unavailable on a fresh fixture, eight checks complete and four fail after about 127 seconds; disabled accounts are not used and requests do not overlap on an account.
- VERIFIED regression: 844 root cases/105 files and 293 Worker cases pass with no skips/failures; fourteen focused native PostgreSQL cases pass. Root/Worker types, schema parity, scoped lint, isolated builds and source-copy hashes pass. These do not establish the complete DB gate, historical migration provisioning, whole-project CI or live provider compatibility.
- VERIFIED cleanup: owned Node/PG/Memurai processes stopped, four test ports closed, both dependency junctions detached with their repository targets preserved, and both temporary roots absent. Load tools, downloaded binaries, synthetic data/database/queue/cookies and raw logs were deleted after presenting results. Only sanitized findings and source regression tests remain. Final encoding/diff and synchronized ledger checks cover the saved source/documents.

Current evidence and semantic interpretation: [localization and capacity comparison](evidence/localization-capacity-20261012.md). No subagents, live provider purchase, business-data mutation or deployment occurred. Mechanical passes, observed capacity failure, visual judgment and production/author acceptance are separate.

## Supplemental card cooldown — 2026-10-12

User authorization: implement a five-minute card cooldown from the end of each renewal attempt, successful or failed, with a remaining-time display. Rejected clicks, page reloads and follow-up verification must not extend it; only a different ended attempt starts another window. Local work only, no subagents/provider execution/deployment. This supplements the existing register without activating Spec Kit.

- VERIFIED locally — Immutable deadline: `prisma/migrations/20261012120000_renewal_card_cooldown/migration.sql` and both Prisma schemas add a write-once per-operation deadline. `tests/unit/renewal-card-cooldown-sql.test.ts` executes the actual migration in PGlite: COMPLETED/FAILED/CANCELLED/EXPIRED/REVIEW_REQUIRED all start five minutes; UTC remains correct under Africa/Cairo; later response/status/deadline writes cannot extend or erase it; rollback undoes it. Pending operations, checks, signals and installments do not start it. No historical backfill guesses an old end time from updated_at.
- VERIFIED locally — Admission and privacy: `src/lib/operations/renewal-creation-guard.ts` reads the deadline under the existing card lifecycle transaction lock before creation/reservation, and before continuation. `tests/unit/renewal-card-cooldown.test.ts` verifies repeated/different-user requests cannot write during cooldown, another card and expiry are allowed, and unresolved financial review wins. The existing authenticated GET route exposes only a card/deadline/server-time snapshot, with permission, input validation and rate limiting; 401/403/429 cause no database read. Installment creation keeps its existing safety guards but bypasses this package-renewal cooldown.
- VERIFIED locally — Countdown: `src/hooks/useRenewalCardCooldown.ts`, `src/components/renewal/CardCooldownNotice.tsx` and the renewal page consume the same server deadline, handle clock skew, fence stale requests and accept a server-side 409. `tests/browser/renewal-card-cooldown.cjs` passes ten fully mocked scenarios covering ar/en/bn at 360/1280 widths, reload continuity, card change, expiry and a newly discovered 409 hold. Zero browser errors, external requests or real operations. Arabic screenshots at both widths were visually inspected in `output/playwright/card-cooldown/`; the notice fits, isolates the card number and disables Start. Timer expiry enables deliberate retry only, without automatic purchase.
- VERIFIED locally — Regression: 843 root cases across 105 files, zero skips/failures; includes 14 focused cooldown cases. Worker suite: 287 passes, five Redis-dependent skips, zero failures. Root/Worker TypeScript, schema parity and focused lint pass. The initial full-unit failure was Python discovery in the existing project-memory test; setting the installed Python path passed the full gate. PGlite prints Windows path diagnostics during startup but all SQL assertions pass. These are bounded local tests, not complete CI/release acceptance.
- VERIFIED — Deployment and handoff: `docs/PROJECT_GUIDE.md`, `docs/deployment/audit-remediation-release.md` and `PROJECT_MEMORY.md` describe trigger-required migration deploy, both generated clients, synchronized process versions, prospective-only timestamps and rollback limits. Encoding checks covered all 38 changed source/document files without introduced BOM or mojibake; diff and ledger structure/source validation pass. The final ledger fingerprint is synchronized after these saved changes.
- NOT_VERIFIED — Native multi-connection PostgreSQL races, full deployed-schema migration rehearsal, running Worker versions and production behavior. The existing advisory lock/unique-reservation design is retained; mocks and single-engine SQL do not prove multi-worker acceptance. No provider call, live database migration, money change, deployment or subagent was used.

Semantic review: the clock is anchored to the first end state rather than a mutable update/heartbeat time. A later success after REVIEW_REQUIRED preserves that deadline, while financial-review clearance remains a separate decision. A denied start creates no operation and therefore no new clock. State and countdown are card-bound, independent of the initiating user. This source review and screenshot inspection are distinct from the mechanical test counts; neither grants production or author acceptance.

**Current extended quality — 2026-09-08:** **45/57 active tasks accepted.** T067-T069 complete; T051 quality improved and T052 history analyzed. 802 distinct unit and 221 distinct worker cases pass; four additional mocked-browser scenarios and isolated web/worker builds pass. In-scope lint has zero errors; full lint retains seven errors in excluded mobile/customer files. Database baseline, provider evidence and release gates remain open. [Current verification](evidence/extended-quality-verification.md). Earlier counts below are historical.

**Historical local backlog — 2026-09-08:** **42/54 active tasks accepted.** T012, T024-T036, T039-T045 and T048-T050 completed locally without subagents. 790 unit and 218 worker tests pass; the integration matrix has 178 distinct passing cases including final follow-ups; 22 mocked-browser groups pass. Isolated builds/types and focused lint pass. Full lint/CI, attributable installment/final-cart evidence, migration provenance and live release gates remain open. [Current verification](evidence/local-backlog-verification.md). Earlier dated counts below are historical.

## Repair status — 2026-09-08

- AUD-005: current-user guard integrated and locally tested under T062; complete hierarchy/database acceptance stays with T027-T029.
- AUD-006: locally accepted again under T016/T017 after T059-T061/T064 fixed worker handoff, safe pre-sale closure and unresolved network waits. Final provider cart/live compatibility remains T038/T053.
- AUD-008: required/optional note and API validation fixed and tested under T064; other review/translation work stays open.
- AUD-014: all-type watchdog selection, revision-aware exhaustion and unsupported CHECK_BALANCE rejection fixed under T063; broader recovery/effects acceptance stays open.
- AUD-019: missing integration suites are now explicitly listed in CI under T065; clean migration provisioning and full CI/build execution are still unaccepted.
- AUD-002 and provider/migration/operational risks remain open. Detailed scenarios, remaining owners and verification counts: [review repairs](evidence/review-repairs.md). The original table below retains the complete acceptance criteria; a component repair is not automatic closure of every linked task.

**Review repairs — 2026-09-08:** T059-T066 complete; T016/T017 reaccepted after fixing the reopened handoff, pre-sale closure and network-deadline gaps. **18/54 active tasks accepted.** 149 focused tests, 55 synthetic PostgreSQL tests, 8 Redis tests and 10 mocked-browser scenario groups pass; root/worker types pass. Phase 3/provider/migration/build/release gates remain open. [Current evidence](evidence/review-repairs.md). Earlier dated counts/results below are historical.

**Active scope: panel only.** Store and phone-app modifications are excluded. Panel UI, responsive browser behavior, and the shared services/workers required by panel operations remain. **54 active tasks / 18 accepted; 25 requirements / 14 audit items.** Retired IDs are not reused. [Scope amendment](evidence/panel-only-scope-amendment.md). Existing runtime code and historical evidence are preserved.

**Phase 3 update:** PARTIAL. AUD-002/AUD-003/AUD-007 have component fixes and focused test evidence; T007 observation wiring still blocks story closure. All original findings remain open pending their complete acceptance. [Evidence](evidence/phase-3-verification.md).

**التاريخ:** 2026-09-07. **الحالة:** Phase 1 وPhase 2 مقبولتان ضمن نطاقهما (T001–T005)، والبنود الأربعة عشر ضمن النطاق الحالي تظل مفتوحة حتى قبول مساراتها الكاملة؛ البنود المستبعدة لم تُعتبر محلولة. [اختبارات الأساس](evidence/phase-2-runtime-verification.md).

تم تثبيت نسخة المصدر في [دليل T001](evidence/baseline.md) و[سجل البصمات](evidence/baseline-sources.json). لم يظهر تغير في ملفات التطبيق عند بداية Phase 1؛ الزيادة وقتها من 188 إلى 201 تخص ملفات خطة 036. تغييرات الأساس اللاحقة موثقة في [دليل Phase 2](evidence/phase-2-verification.md)، ولا يغلق وجودها أي خلل قبل قبول اختبارات المسار الكامل.

مصدر الحصر: مراجعة الكود في المحادثة السابقة ومقارنة الشجرة المحلية بالـHEAD `7457b7028811759736faa799a8b06b43691b1218`، مع 83 ملفًا معدلًا و105 غير متتبعين قبل بدء التخطيط. مراجع السطور تخص هذه النسخة وقد تتحرك أثناء التنفيذ؛ يُثبت موضعها الجديد في دليل المهمة.

الجدول يجمع 9 مشكلات أساسية و11 خطرًا/فجوة/تحسينًا وردت في التقرير. «مثبت» يصف علاقة الكود بالسيناريو، ولا يثبت حدوثه على السيرفر. الأولوية P1 تعني ضرورة الحسم قبل إصدار هذه الحزمة؛ P2 تعني إصلاحًا مهمًا أو تحسين اعتمادية. البنود المشروطة لا تُعامل كفساد مثبت في البيانات.

| الرقم | الأولوية والتصنيف | المطلوب إصلاحه | المتطلبات / المسار | المهام | معيار القبول |
| --- | --- | --- | --- | --- | --- |
| AUD-002 | P1 — جديد — خطأ مثبت | فشل القسط قد ينتهي دون رد الخصم | US1 / FR-002, FR-003 | T006, T007, T008 | إثبات خاص للقسط ورد الخصم والحالة والحجوزات ذريًا؛ لا تجاوز بالحقل القديم. |
| AUD-005 | P1 — قديم ومستمر — خطأ مثبت | بعض مسارات العمليات تتجاوز إبطال الجلسة والدور الحالي | US4 / FR-013, FR-014 | T002, T027, T028, T029 | رفض الجلسة القديمة قبل أي أثر مع الحفاظ على الملكية وحدود توكن العميل. |
| AUD-006 | P2 — جديد — خطأ مثبت | تغيير العرض يتعارض مع سجل إرسال واحد | US2 / FR-007, FR-016 | T015, T016, T017 | محاولة جديدة للعرض وإعادة آمنة لنفس الطلب؛ الدفع النهائي بهوية ثابتة. |
| AUD-007 | P2 — جديد — خطأ مثبت في تسلسل حالات | حالة تحقق قديمة تمنع نتيجة سلبية نهائية صحيحة | US1 / FR-005, FR-003 | T011, T012 | التحقق من هوية آخر محاولة وbaseline تحت القفل دون إسقاط حقائق إيجابية سابقة. |
| AUD-008 | P2 — جديد — تعارض واجهة/سيرفر | الملاحظة اختيارية في النموذج وإلزامية بالسيرفر | US3/US7 / FR-012, FR-024 | T024, T026, T045 | نفس إلزامية وحدود الملاحظة في النموذج والـAPI ورسالة مترجمة قبل الإرسال. |
| AUD-010 | P1 — خطر نشر مشروط بالحسابات | automationExclusive الافتراضي يستبعد الحسابات القديمة | US6 / FR-018 | T035, T036, T055 | جاهزية حسب مجموعة الحسابات قبل الخصم؛ تفعيل صريح مبني على الحقيقة. |
| AUD-011 | P1 — جزء ناقص مثبت + جاهزية خارجية غير معلومة | أداة التحقق الحي ناقصة وENFORCE يحتاج إثباتًا حديثًا | US6 / FR-019, FR-028 | T037, T038, T053 | adapter للقراءة فقط وإثبات حقيقي منقح له إصدار وانتهاء؛ لا اعتماد fixture كإثبات حي. |
| AUD-012 | P1 — تعارض توافق؛ عدد الحالات القديمة غير معلوم | شروط المراجعة الجديدة تمنع إغلاق بعض الحالات القديمة والأقساط | US3 / FR-011, FR-020 | T024, T025, T026, T040, T052 | تصنيف كل عائلة بأدلتها؛ تسوية مسموحة أو احتجاز بسبب محدد؛ لا اختلاق توقيت دفع. |
| AUD-013 | P1 — خطر بيانات وترحيل مشروط | تكرار حسابات beIN أو خصم بانل قديم بلا سجل يوقف التوافق | US6 / FR-020, FR-026 | T003, T004, T005, T039, T040, T052, T055 | تصنيف وتجربة ترحيل صناعية قبل أي تصحيح حي؛ لا إعادة كتابة تاريخ المال. |
| AUD-014 | P1 — فجوة ربط؛ الأثر مشروط بجدولة السيرفر | الصيانة تعيد إرسال نوع واحد رغم تعدد المهام | US5 / FR-015, FR-016, FR-029 | T002, T030, T031, T034 | كل نوع مدعوم له مستهلك وإعادة محدودة وحالة استنفاد دون إعادة دفع. |
| AUD-016 | P1 — اختلاف تجهيز؛ حالة السيرفر غير معلومة | تعريف عمال البانل وعددهم وجدولة الصيانة غير موحد | US6 / FR-021 | T002, T041, T042, T055 | ملف نشر محدد ومستهلك لكل طابور مفعل؛ لا افتراض عدد العمال الحي. |
| AUD-018 | P2 — تحسين اعتمادية لحالة تعطل العامل | قد تضيع بعض الآثار بعد حفظ الإكمال | US5 / FR-017, FR-027 | T032, T033, T034 | إشعار وعداد مرة واحدة بعد التعافي؛ الحفاظ على إصلاح النقاط الحالي. |
| AUD-019 | P1 — فجوة تحقق مثبتة | Panel financial regression suites need explicit CI selection | US8 / FR-025, FR-027, FR-031 | T048, T049, T050, T051 | تشغيل فعلي معزول لكل المجموعة المطلوبة لاحقًا؛ الاختبار المتخطى ليس نجاحًا. |
| AUD-020 | P1 — شرط إصدار ومتابعة | حزمة الملفات الجديدة وترتيب النشر ودليل القبول غير مكتملة | US8 / FR-001, FR-026, FR-030, FR-031 | T001, T002, T042, T050, T051, T052, T053, T054, T055, T056, T057, T058 | بيان إصدار كامل ونتائج فعلية وصلاحية نشر مستقلة؛ لا سحب جزئي أو بناء فوق .next الحية. |

## أدلة المصدر

### AUD-002 — فشل القسط قد ينتهي دون رد الخصم

- المواضع: `worker/src/utils/error-handler.ts:97`; `worker/src/http-queue-processor.ts:6011`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: إثبات خاص للقسط ورد الخصم والحالة والحجوزات ذريًا؛ لا تجاوز بالحقل القديم.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-005 — بعض مسارات العمليات تتجاوز إبطال الجلسة والدور الحالي

- المواضع: `src/app/api/operations/start-renewal/route.ts:21`; `src/lib/auth-utils.ts:38`; `src/lib/auth-utils.ts:343`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: رفض الجلسة القديمة قبل أي أثر مع الحفاظ على الملكية وحدود توكن العميل.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-006 — تغيير العرض يتعارض مع سجل إرسال واحد

- تم إصلاح PRM-01–PRM-05 ضمن T016/T017: هوية محاولة العرض، انتظار النتيجة، فصل مسودة الكود، التحقق من النسخة قبل الخصم، وحفظ نوع الكارت وإيقاف تغيّر الاسم/السعر للمراجعة. [نتائج التنفيذ والاختبارات](evidence/phase-4-implementation.md).

- المواضع: `src/lib/operation-dispatch.ts`; `src/app/api/operations/[id]/apply-promo/route.ts`; `shared/operations/package-quote.ts`; `worker/src/lib/promo-quote.ts`.
- الحالة الحالية: IMPLEMENTED / LOCAL_VERIFIED. مهام Phase 4 مقبولة؛ النشر والتحقق من beIN الحقيقي لم ينفذا.
- النتيجة المطلوبة: محاولة جديدة للعرض وإعادة آمنة لنفس الطلب؛ الدفع النهائي بهوية ثابتة.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-007 — حالة تحقق قديمة تمنع نتيجة سلبية نهائية صحيحة

- المواضع: `worker/src/http-queue-processor.ts:3343`; `worker/src/lib/renewal-no-charge-finalization.ts:105`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: التحقق من هوية آخر محاولة وbaseline تحت القفل دون إسقاط حقائق إيجابية سابقة.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-008 — الملاحظة اختيارية في النموذج وإلزامية بالسيرفر

- المواضع: `src/components/admin/financial-review/FinancialReviewClient.tsx:815`; `src/lib/operations/manual-fulfillment-finalization.ts:137`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: نفس إلزامية وحدود الملاحظة في النموذج والـAPI ورسالة مترجمة قبل الإرسال.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-010 — automationExclusive الافتراضي يستبعد الحسابات القديمة

- المواضع: `prisma/migrations/20260824130000_sold_report_fulfillment_correlation/migration.sql:37`; `worker/src/pool/account-pool-manager.ts:99`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: جاهزية حسب مجموعة الحسابات قبل الخصم؛ تفعيل صريح مبني على الحقيقة.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-011 — أداة التحقق الحي ناقصة وENFORCE يحتاج إثباتًا حديثًا

- المواضع: `scripts/verify-sold-report-contract-correlation.ts:249`; `shared/operations/renewal-fulfillment-config.ts:7`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: adapter للقراءة فقط وإثبات حقيقي منقح له إصدار وانتهاء؛ لا اعتماد fixture كإثبات حي.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-012 — شروط المراجعة الجديدة تمنع إغلاق بعض الحالات القديمة والأقساط

- المواضع: `src/lib/operations/manual-fulfillment-finalization.ts:200`; `src/lib/operations/financial-review-refund-finalization.ts:175`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: تصنيف كل عائلة بأدلتها؛ تسوية مسموحة أو احتجاز بسبب محدد؛ لا اختلاق توقيت دفع.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-013 — تكرار حسابات beIN أو خصم بانل قديم بلا سجل يوقف التوافق

- المواضع: `prisma/migrations/20260824150000_canonical_bein_account_identity/migration.sql:5`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: تصنيف وتجربة ترحيل صناعية قبل أي تصحيح حي؛ لا إعادة كتابة تاريخ المال.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-014 — الصيانة تعيد إرسال نوع واحد رغم تعدد المهام

- المواضع: `src/lib/operation-dispatch.ts:271`; `src/lib/maintenance/operation-maintenance-runner.ts:155`; `src/app/api/cron/dispatch-operation-jobs/route.ts:24`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: كل نوع مدعوم له مستهلك وإعادة محدودة وحالة استنفاد دون إعادة دفع.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-016 — تعريف عمال البانل وعددهم وجدولة الصيانة غير موحد

- المواضع: `ecosystem.config.js:70`; `worker/ecosystem.config.js`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: ملف نشر محدد ومستهلك لكل طابور مفعل؛ لا افتراض عدد العمال الحي.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-018 — قد تضيع بعض الآثار بعد حفظ الإكمال

- المواضع: `worker/src/lib/fulfillment-finalization.ts:693`; `worker/src/http-queue-processor.ts:4124`; `worker/src/lib/activity-tracker.ts:22`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: إشعار وعداد مرة واحدة بعد التعافي؛ الحفاظ على إصلاح النقاط الحالي.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-019 - Panel financial regression suites need explicit CI selection

- المواضع: `.github/workflows/ci.yml:85`; `tests/integration/renewal-payment-refund-finalization-db.test.ts`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: تشغيل فعلي معزول لكل المجموعة المطلوبة لاحقًا؛ الاختبار المتخطى ليس نجاحًا.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

### AUD-020 — حزمة الملفات الجديدة وترتيب النشر ودليل القبول غير مكتملة

- دليل إضافي محلي: ترحيل 0_init فارغ وفشل تجهيز قاعدة فارغة بسبب غياب OperationStatus. قبول Phase 2 استخدم مخطط النسخة المرجعية فقط دون بيانات أعمال، ولا يثبت جاهزية الإنشاء من الصفر. المعالجة وتجربة النشر تظلان ضمن T040/T052، دون إعادة كتابة التاريخ.

- المواضع: `AGENTS.md`; `package.json`; `ecosystem.config.js`; `specs/036-audit-remediation/spec.md`.
- الحالة الحالية: OPEN / PLANNED. التنفيذ والتحقق والنشر لم يتموا.
- النتيجة المطلوبة: بيان إصدار كامل ونتائج فعلية وصلاحية نشر مستقلة؛ لا سحب جزئي أو بناء فوق .next الحية.
- المالك: منفذ المهام المحددة، ومراجع الدمج في المهمة الحالية؛ الأدلة الخارجية لدى مسؤول التشغيل بعد تصريح مناسب.

## ما نحافظ عليه

عدم إعادة طلب الدفع بعد غموض النتيجة؛ الفصل بين الخصم وإثبات التجديد؛ ملكية الأقفال وحجوزات الكروت والحسابات؛ تفرد الفاتورة؛ الاعتماد على الخصم الأصلي للاسترداد؛ حدود حسابات البانل والعملاء؛ وسجلات النقاط التاريخية. لا تُغلق ملاحظة بتعطيل أي ضمان من هذه الضمانات.

## التغطية غير المحسومة

نسخة الإنتاج، الترحيلات المطبقة، الأرصدة والبيانات القديمة، جلسات beIN وتنسيق التقارير الحي، العمليات الجارية، PM2/cron الفعلي، ونسخة تطبيق الموبايل الخارجي لم تُفحص. T052–T055 تحدد الأدلة المطلوبة. نجاح التخطيط لا يزيل هذه الحدود.

## Package identity repair — 2026-10-11

### Authorized continuation — 2026-10-12

Implement the observed package/cart/report contracts locally, with no provider calls, purchases, deployment or subagents. Preserve the existing financial review, reservation and idempotency rules. This is ordinary implementation of the accepted plan, not activation of Spec Kit.

| Requirement / source | Action / current verification obligation | Status / evidence |
| --- | --- | --- |
| User: actual cart and Reports, including promo | Replace synthetic cart assumptions; bind full/provider serial and type; accept exactly one commercial line and matching totals; carry quote/promo evidence into new-invoice correlation. | VERIFIED locally — observed-shape parser plus actual verification-worker harness; current evidence section |
| Observed report controls and continuation rows | Parse cboDealer, ddlType and date widget names; inherit cells only through explicit valid rowspan; preserve criteria/count/stability checks. | VERIFIED locally — four representative red cases then green; malformed rows/criteria/currency and stable complete-scan tests |
| User: promo and exact identity | Reject unchanged/unbound promo responses, drift, extra lines, ambiguous matches and missing evidence; separate commercial offer from same-invoice entitlement; compare report/contract dates. | VERIFIED locally — 70 dedicated cases within 287 Worker passes; real promo outcomes NOT_VERIFIED |
| Always-on / TDD / connected-impact / cart / API / financial / promo guards | First failing real-shape unit, then connected suites/types/build/lint; no new API/schema/error vocabulary; document unobserved stages separately. | VERIFIED for local scope — 826 root passes, affected 14-case rerun, types/emission/schema/lint; no independent review or release claim |
| User: local only, no subagents | Mock all HTTP, retain unknown-stage fail-closed behavior and existing review policy. No live operation or balance changes. | VERIFIED for this continuation; five Redis skips and unavailable real-service race gates remain NOT_VERIFIED. Later confirmation compatibility and incident/server attribution INCOMPLETE |

Historical initial implementation below (2026-10-11); the authorized continuation above and the current evidence section supersede its parser assumptions and test counts. This supplement does not activate Spec Kit or close historical audit items. Single-agent work, no live purchases, refunds, deployment or schema changes.

| Obligation / source | Action and verification | Evidence / status |
| --- | --- | --- |
| User plan 1–2: immutable quote and current page selection | Bind full name (including duration/offer), price, currency, revision and promo; parse only the dedicated package grid; reject missing/duplicate matches and stale controls. | VERIFIED locally — quote tests and current-page identity tests; see linked evidence |
| User plan 3: pre-mutation cart identity | Validate Add/Sell/STB responses and the final payment summary without navigation; bind prepared evidence to the saved session and accepted quote; unreadable/ambiguous data blocks OK/Pay. | VERIFIED for the synthetic semantic contract; NOT_VERIFIED for original provider HTML, so live compatibility remains INCOMPLETE |
| User plan 4–5: fulfillment and money | Remove legacy fuzzy matching; retain invoice/report/contract correlation, reservations, final-mutation fences and existing review/refund policy. Expected price is not observed spend. | VERIFIED locally — correlation, legacy, review/finalization and fenced-session regressions; real service races remain NOT_VERIFIED |
| User plan acceptance cases | Different price/name/duration/currency, reordered rows, promo/session/account drift, extra/ambiguous cart, replay/concurrency and matching synthetic flow. | VERIFIED in 37 dedicated identity tests plus existing quote/cache/correlation suites; Redis/PostgreSQL-backed race acceptance NOT_VERIFIED |
| Skills: always-on discipline, connected impact, API/financial guards, TDD, clean code, localization, project docs/memory | Test a representative failure before implementing; reuse existing errors and API; preserve encoding; update existing handoff and run applicable checks. | VERIFIED for scoped source/test review and guide/ledger synchronization; no independent review, author acceptance, live compatibility or native hook claim |
| User plan production check | Compare source and running artifacts for every PM2 worker, then correlate both incident operations with selection/payment logs. Prevent mixed worker releases. | NOT_VERIFIED — no server connection or original cart responses available; no production acceptance claimed |
| User live-inspection continuation: distinguish Check, Reports, package creation and Customer Promo; no purchase/subscription | Read Reports and package grids; inspect then remove one temporary cart item; compare real fields with HTTP and promo code paths. Stop all additional cart/purchase actions after the user's reminder. Keep new runtime edits outside this planning continuation. | VERIFIED for report control mismatch, actual cart structure, empty-cart/stale-total countercheck and offline incompatibility reproductions. Later confirmation stages, live promo outcomes and incident attribution NOT_VERIFIED. Existing handoff contains the revised plan; no Sell/OK/Pay was submitted. |

Scope excludes UI redesign, new endpoints, database migrations, real provider transactions and automatic financial corrections. Native hook enforcement and independent agent review are not claimed.

Current evidence: [package identity repair](evidence/package-identity-repair.md). `node scripts/run-audit-gates.cjs unit` passed 826 tests / 103 files, zero skips (the project-memory test used the bundled Python and permission to create its disposable Git fixture). `node --import tsx --test worker/tests/*.test.ts` passed 254 of 259, with five explicitly skipped Redis integrations and no failures. Root and worker TypeScript, isolated worker emission, schema sync and changed-file ESLint passed; seven unchanged warnings remain. Original provider markup, live server inspection, incident attribution and real-service financial race gates remain NOT_VERIFIED. The user reports no known SSH connection. Overall production acceptance stays INCOMPLETE.
