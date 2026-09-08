# سجل نتائج المراجعة وخريطة الإصلاح

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
