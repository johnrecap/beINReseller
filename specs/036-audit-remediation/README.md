# خطة إصلاح نتائج المراجعة — Spec Kit 036

**Current extended quality — 2026-09-08:** **45/57 active tasks accepted.** T067-T069 complete; T051 quality improved and T052 history analyzed. 802 distinct unit and 221 distinct worker cases pass; four additional mocked-browser scenarios and isolated web/worker builds pass. In-scope lint has zero errors; full lint retains seven errors in excluded mobile/customer files. Database baseline, provider evidence and release gates remain open. [Current verification](evidence/extended-quality-verification.md). Earlier counts below are historical.

**Historical local backlog — 2026-09-08:** **42/54 active tasks accepted.** T012, T024-T036, T039-T045 and T048-T050 completed locally without subagents. 790 unit and 218 worker tests pass; the integration matrix has 178 distinct passing cases including final follow-ups; 22 mocked-browser groups pass. Isolated builds/types and focused lint pass. Full lint/CI, attributable installment/final-cart evidence, migration provenance and live release gates remain open. [Current verification](evidence/local-backlog-verification.md). Earlier dated counts below are historical.

**Review repairs — 2026-09-08:** T059-T066 complete; T016/T017 reaccepted after fixing the reopened handoff, pre-sale closure and network-deadline gaps. **18/54 active tasks accepted.** 149 focused tests, 55 synthetic PostgreSQL tests, 8 Redis tests and 10 mocked-browser scenario groups pass; root/worker types pass. Phase 3/provider/migration/build/release gates remain open. [Current evidence](evidence/review-repairs.md). Earlier dated counts/results below are historical.

**Phase 4 complete:** T015-T017 accepted. 76 focused unit/worker tests and 14 synthetic PostgreSQL cases pass, zero skips; six mocked-browser scenario groups pass (360px Arabic RTL, 768px, 1280px, retry/resume and both panel confirmation consumers). [Implementation evidence](evidence/phase-4-implementation.md). Earlier red evidence remains historical.

**Active scope: panel only.** Store and phone-app modifications are excluded. Panel UI, responsive browser behavior, and the shared services/workers required by panel operations remain. **54 active tasks / 18 accepted; 25 requirements / 14 audit items.** Retired IDs are not reused. [Scope amendment](evidence/panel-only-scope-amendment.md). Existing runtime code and historical evidence are preserved.

**Current status:** 10/46 accepted (T001-T006, T011, T015-T017). Phase 4 complete within its local/synthetic scope; Phase 3 remains PARTIAL. T007 attributable installment observations and dependent T008/T012, full build/provider/release gates remain open.

Active scope: 14 audit items, 25 requirements, 8 user stories and 54 tasks; 18 accepted. The original 46 panel tasks are retained and review tasks T059-T066 refine their contracts. Retired IDs remain outside active progress.

**التجربة المحلية:** النسخة المرجعية محفوظة، ونسخة العمل المحدثة مستخدمة في البانل المحلي مع عزل beIN وتوقف الـWorkers. إصلاح خطأ الأقفال مسجل بصورة منفصلة باسم LOCAL-001. اختبارات Phase 2 استخدمت قاعدة صناعية أخرى ولم تغيّر بيانات نسخة العمل. [دليل التشغيل المحلي](evidence/local-database-preparation.md).

## ملفات المتابعة

| الملف | استخدامه |
| --- | --- |
| [tasks.md](tasks.md) | قائمة العمل الأساسية: ما سيتغير بالضبط وفي أي ملف، وما الذي يسبقه، وكيف يُقبل |
| [audit-register.md](audit-register.md) | كل ملاحظة AUD-001…AUD-020 وتصنيفها ودليل الكود ومهام علاجها |
| [دليل Phase 1](evidence/phase-1-verification.md) | نتيجة T001/T002 وحدود الفحص؛ منه تصل إلى البصمات وخريطة المستهلكين |
| [دليل Phase 2](evidence/phase-2-runtime-verification.md) | الفشل قبل الترحيلات، الإصلاحات، الاختبارات العشرون الناجحة وحدود القبول |
| [spec.md](spec.md) | السلوك المطلوب، الحدود، السيناريوهات ومعايير النجاح |
| [plan.md](plan.md) | قرارات التنفيذ والمكونات الحالية التي سنوسعها وترتيب المراحل |
| [data-model.md](data-model.md) | تغييرات البيانات المقترحة، الأقفال، القيود والتوافق مع القديم |
| [contracts/financial-lifecycle.md](contracts/financial-lifecycle.md) | قواعد الدفع والاسترداد والمراجعة، بما فيها الحالات القديمة |
| [contracts/consumer-api.md](contracts/consumer-api.md) | Panel API, permissions, UI states and localization |
| [contracts/jobs-and-release.md](contracts/jobs-and-release.md) | الطوابير والجاهزية وإثبات beIN وتسلسل الإصدار |
| [research.md](research.md) | سبب اختيار كل حل والبدائل المرفوضة |
| [quickstart.md](quickstart.md) | كيفية متابعة المهمة وتسجيل أدلتها وحدود كل نوع تحقق |
| [checklists/requirements.md](checklists/requirements.md) و[safety-and-coverage.md](checklists/safety-and-coverage.md) | جودة المتطلبات المكتوبة؛ علاماتها لا تعني نجاح التطبيق |

## ترتيب العمل

| المرحلة | المهام | الهدف | المنجز |
| --- | --- | --- | --- |
| تثبيت النطاق — Phase 1 | T001–T002 | خط أساس وبصمات وخريطة المستهلكين والصلاحيات والطوابير والأقفال | 2 / 2 |
| الأساس المشترك — Phase 2 | T003–T005 | نماذج التوافق ومواضع الاختبار والبيانات الصناعية | 3 / 3 |
| التسوية المالية | T006-T008, T011-T012 | الأقساط وآخر محاولة تحقق | 2 / 5 (PARTIAL) |
| اختيار الباقة والعروض — Phase 4 | T015-T017 | عروض البانل والسعر المعتمد والتأكيد | 3 / 3 (local/synthetic accepted) |
| مراجعات البانل | T024-T026 | مراجعة الأدلة والاسترداد المحلي والحالات القديمة | 0 / 3 |
| الصلاحيات | T027–T029 | إبطال الجلسات والدور الحالي والملكية | 0 / 3 |
| الاعتمادية | T030–T034 | استعادة الطوابير وآثار الإكمال ومؤشرات التأخر | 0 / 5 |
| جاهزية النشر | T035–T042 | الحسابات، إثبات التحقق، توافق البيانات والخدمات وإجراء النشر | 0 / 8 |
| Panel interfaces | T043-T045 | States, review form, localization and responsive web | 0 / 3 |
| التحقق والإصدار والإغلاق | T048–T058 | CI، الانحدار، الاختبارات المعزولة، الأدلة الخارجية، الإصدار | 0 / 11 |

**Next step:** Finish T007 with attributable installment HTTP fixtures and a tested parser; then close its verified dependent components. Full provider/release gates remain open.

## طريقة وضع علامة الإنجاز

- حالة المهمة تبدأ PLANNED. عند العمل عليها تضاف IN_PROGRESS دون وضع علامة الإنجاز.
- تُغلق مهمة الكود بعد تنفيذها ونجاح قبولها المحدد. تُسجل الفحوص النهائية المؤجلة في مهامها المنفصلة، ولا تُنسب للمهمة المبكرة كنجاح لم يحدث.
- لا توضع [x] على اختبار متخطى أو تحقق لم يُشغّل. مهمة كتابة الاختبار تقبل بعد إثبات الحالة الفاشلة المقصودة؛ إصلاحها مهمة لاحقة.
- كل إنجاز له رقم المهمة، التاريخ، الملفات/commit، نتيجة الفحص ومسار دليل منقح.
- عند وجود مانع: تبقى [ ] ويُكتب السبب والمالك والخطوة المطلوبة. لا تُحذف المهمة لإخفاء المانع.
- الأدلة الخارجية والنشر لها تفويض منفصل. جميع T050–T057 غير منفذة حاليًا.

## حالة مراحل Spec Kit

Historical planning had 31 requirements and 58 tasks; panel-only scope retained 25 requirements and 46 tasks. Eight review repair tasks were then appended (54 total). T009 remains historically completed outside current progress.

## حدود التغيير الحالي

- الفرع الحالي والتغييرات السابقة محفوظة؛ لم يُنشأ فرع ولم يتم commit/push/fetch/pull.
- تغيرت فقط ملفات الأساس المحددة في T003–T005 وتوافق المستهلكين الضروري؛ الترحيلات الجديدة مكتوبة ولم تُطبّق، والخدمات لم تُشغّل أو تتغير.
- تم توجيه `.specify/feature.json` وعلامة Spec Kit في `AGENTS.md` إلى هذه الحزمة للمتابعة، مع تحديث مرجع المشروع.
- Feature 036 now targets the panel and required shared backend/workers only; store and phone-app modifications are excluded.
- لا يوجد تأكيد على بيانات السيرفر أو نجاح التشغيل من هذه الخطة.
