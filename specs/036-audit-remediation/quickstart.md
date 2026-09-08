# متابعة التنفيذ والتحقق

**Review repairs — 2026-09-08:** T059-T066 complete; T016/T017 reaccepted after fixing the reopened handoff, pre-sale closure and network-deadline gaps. **18/54 active tasks accepted.** 149 focused tests, 55 synthetic PostgreSQL tests, 8 Redis tests and 10 mocked-browser scenario groups pass; root/worker types pass. Phase 3/provider/migration/build/release gates remain open. [Current evidence](evidence/review-repairs.md). Earlier dated counts/results below are historical.

**Phase 4 complete:** T015-T017 accepted. 76 focused unit/worker tests and 14 synthetic PostgreSQL cases pass, zero skips; six mocked-browser scenario groups pass (360px Arabic RTL, 768px, 1280px, retry/resume and both panel confirmation consumers). [Implementation evidence](evidence/phase-4-implementation.md). Earlier red evidence remains historical.

**Active scope: panel only.** Store and phone-app modifications are excluded. Panel UI, responsive browser behavior, and the shared services/workers required by panel operations remain. **54 active tasks / 18 accepted; 25 requirements / 14 audit items.** Retired IDs are not reused. [Scope amendment](evidence/panel-only-scope-amendment.md). Existing runtime code and historical evidence are preserved.

**Current status:** 10/46 accepted (T001-T006, T011, T015-T017). Phase 4 complete within its local/synthetic scope; Phase 3 remains PARTIAL. T007 attributable installment observations and dependent T008/T012, full build/provider/release gates remain open.

القيود وحالات «مؤجل» في السجل الأصلي أدناه تاريخية. أحدث تفويض في spec.md ونتائج الأدلة يحددان المسموح والمنفذ؛ Q02/Q04 نجحا لنطاق Phase 2 فقط، ولا يمتد نجاحهما لكل المجموعات المخططة.

## ابدأ من هنا

تحديث محلي مصرح به بتاريخ 2026-09-07: تم تجهيز نسخة مرجعية من ملف المستخدم ونسخة عمل مستقلة؛ نجح تطبيق الترحيلات التسعة، وأُعيدت 3 فهارس حماية مفقودة على نسخة العمل فقط. هذا استثناء محدود من منع DB والترحيلات في نطاق الكتابة السابق؛ لا يشمل تشغيل التطبيق أو الاختبارات أو قبول Q04/Q09. التفاصيل في [تجهيز قاعدة البيانات](evidence/local-database-preparation.md).

1. اقرأ [README.md](README.md)، ثم [audit-register.md](audit-register.md) و[spec.md](spec.md).
2. راجع [plan.md](plan.md) والعقود ونموذج البيانات، ثم اختر المهمة التالية من [tasks.md](tasks.md) بحسب اعتمادياتها.
3. Phase 4 مكتملة محليًا؛ تابع اعتماديات tasks.md. T007 يحتاج بيانات HTTP أصلية منزوعة الأسرار، وتبدأ مهام البانل التالية بعد T017 حسب طلب المستخدم. لا تعتبر الأجزاء المفتوحة أو النشر مقبولة.
4. اكتب النتيجة ودليل التحقق تحت رقم المهمة. لا تغيّر checkbox بسبب وجود كود أو اختبار قديم.
5. عند تغير النطاق: عدّل المواصفات أولًا وأعد تحليل الترابط قبل استكمال الكود.

## مستويات التحقق

| الرمز | النطاق | ماذا يثبت | التنفيذ في هذه المهمة |
| --- | --- | --- | --- |
| Q01 | قراءة ووثائق فقط | Spec Kit paths، IDs، الاعتماديات، روابط الملفات، الترميز وحدود diff | مسموح؛ لا يشغّل التطبيق |
| Q02 | اختبارات وحدة مع doubles | قرارات الإثبات/السعر/الحالات/الرسائل | ناجح لنطاق Phase 4 المحدد؛ باقي المشروع منفصل |
| Q03 | عقود API/consumers/topology | الطلب والاستجابة والصلاحية وتوافق المستهلك | عقود عروض وتأكيد البانل ناجحة؛ تدقيق الصلاحيات الشامل منفصل |
| Q04 | PostgreSQL معزول صناعي | ذرية المال والقيود وسباقات التسوية | 14 حالة Phase 4 ناجحة؛ قاعدة الاختبار خالية بعدها |
| Q05 | Redis/queue معزول | lease، تكرار التسليم، الاستعادة والتأخر | مؤجل |
| Q06 | أنواع وlint وبناء | صلاحية الحزمة المجمعة والاعتماديات | أنواع النطاق والـworker ناجحة؛ 4 أخطاء types خارج النطاق والبناء الكامل مفتوح |
| Q07 | متصفح على تطبيق معزول | الحالات، keyboard، RTL و360/768/1280px | 6 مجموعات صناعية على صفحات React الفعلية ناجحة؛ لم يتم الاتصال بخدمات المشروع |
| Q08 | انحدار الوظائف المشتركة | نقاط/عمولات/مديونيات/تحويلات/تقارير/signals/bulk | مؤجل |
| Q09 | ترحيل وتجربة نشر معزولة | توافق البيانات القديمة وحدود التراجع | مؤجل |
| Q10 | beIN قراءة فقط بتصريح منفصل | تطابق الإثبات الحقيقي وصلاحيته للإصدار | غير مصرح حاليًا |
| Q11 | قراءة تشغيلية/مصدر موبايل خارجي بتصريح | نسخة الإنتاج والترحيلات والخدمات والمستهلك الحقيقي | غير مصرح حاليًا |
| Q12 | قرار إصدار ونشر | قبول الحزمة ثم تشغيلها ومراقبتها | غير مصرح حاليًا |

## Q01 — فحص وثائق الخطة

أوامر Spec Kit التالية تخص الوثائق ولا تتصل بخدمات التطبيق:

```powershell
specify version --features --json
specify integration status --json
& '.specify/scripts/powershell/check-prerequisites.ps1' -Json -RequireTasks -IncludeTasks
```

الفحص الدلالي يراجع AUD/FR/SC/US/T، الاعتماديات، تفاصيل المهام وروابط المسارات. في Phase 2 يقارن SHA-256 التغييرات بنطاق الملفات المصرح به ويحفظ SQL السابق. تحليل صياغة TypeScript لا يشغّل الملفات ولا يثبت الأنواع أو نجاح الاختبارات.

## Q02–Q05 — أوامر مستقبلية بعد تفويض التنفيذ المناسب

كل مهمة اختبار تسمي الملف المحدد. النمط المستخدم من المشروع، مثال بعد إنشاء الملف:

```text
node --import tsx --test worker/tests/installment-settlement.test.ts
node --import tsx --test tests/unit/promo-dispatch-revision.test.ts
node --import tsx --test tests/integration/promo-dispatch-revision-db.test.ts
```

هذه الملفات أمثلة مخططة وليست موجودة أو منفذة الآن. استدعِ أسماء الملفات الصريحة في المهمة، ولا تجمع كل integration عشوائيًا إذا لم تُراجع حدودها.

لـQ04 يلزم مورد disposable مستقل وعناوينه المحلية المعروفة، مع RUN_DB_INTEGRATION واشتراطات helper الحالي. وجود CONFIRM_DISPOSABLE_RENEWAL_FULFILLMENT_DB وحده لا يثبت أن العنوان آمن؛ يجب توثيق هوية المورد المعزول وعدم استخدام بيانات/عناوين الإنتاج. لا تُنسخ قيم .env إلى التقارير.

لـQ05 يلزم Redis معزول وTEST_REDIS_URL وRUN_REDIS_INTEGRATION وفق الاختبارات. جميع اتصالات beIN/Stripe في هذه المجموعات تكون doubles. أي skip في مجموعة مطلوبة يظل فجوة إصدار.

## Q06 — أوامر البناء المعتمدة حاليًا، للتنفيذ لاحقًا فقط

```text
npm run check:schema-sync
npx prisma generate
npx tsc --noEmit --pretty false
npm run lint
npm run build
npm run worker:build
```

تحقق من scripts الفعلية قبل التنفيذ لاحقًا. build قد يستدعي prebuild/generate ويكتب artifacts؛ يُشغّل في checkout معزول، ولا يُشغّل داخل .next المستخدمة بواسطة bein-web. نجاح npm run ci لا يعوض مجموعات DB المستبعدة حتى تُصلح T048.

## Q07/Q08 — قبول المستخدم والانحدار

- رحلات: اختيار باقة جديد؛ عرض بطيء/ثانٍ؛ سعر قديم؛ دفع مرفوض/مجهول؛ مراجعة؛ استرداد جزئي/مكتمل؛ إعادة تحميل؛ صلاحية ملغاة.
- عرض العربية والإنجليزية والبنغالية، keyboard/focus/aria-live، والأبعاد المذكورة في عقد المستهلك.
- نتائج مالية مترابطة: الخصم والرد مرة واحدة؛ snapshots النقاط والعمولات ثابتة؛ إجماليات الدين والتحويلات والتقارير لا تحتسب سجلًا مرتين؛ إشارات وبالك لا تتعطل بسبب فلتر حسابات غير مقصود.
- استخرج أسماء اختبارات الوظائف الحالية من قائمة T002/T049 بدل افتراض تغطية من أسماء الملفات.

## Q09–Q12 — بوابات إصدار منفصلة

ترتيب Q09: بيانات صناعية قديمة/حديثة -> الترحيلات الأمامية -> تحقق القيود/الحجز/السجلات -> تجربة توقف/استئناف -> توثيق حدود rollback. لا SQL حي في هذه المهمة.

Q10 يستخدم adapter الذي ستنشئه T038 مع تفويض قراءة حقيقية، دون Pay/renew/refund. سجل منقح يؤكد التطابق والإصدار والتوقيت فقط.

Q11 يجمع بقراءة مصرح بها commit الإنتاج، الترحيلات المطبقة، مجموعات الحسابات، الطوابير والعمال/cron، العمليات الجارية، ونسخة/عقد العميل الخارجي. لا تُفترض الأسماء أو الأعداد من docs وحدها.

Q12 لا يبدأ قبل نجاح T056 واعتماد إجراء النشر المحدد. لا commit/push/pull/migrate/restart/deploy تلقائي في هذه الخطة.

## سجل الأدلة المقترح

لكل مهمة: التاريخ، رقم المهمة/AUD/FR، commit أو hash، الملفات، نوع البيئة، الأمر/السيناريو، PASS/FAIL/SKIPPED/NOT_RUN، ملخص آمن، والقيود المتبقية. مسار الأدلة: `specs/036-audit-remediation/evidence/`؛ يحتوي على أدلة Phase 1 وPhase 2 مع الفصل بين الفحص المصدري والاختبارات غير المنفذة.

## نتيجة مرحلة التخطيط

المقبول مهمتا Setup فقط (2/58). كُتبت ملفات T003–T005 بدليل [Phase 2](evidence/phase-2-verification.md)، وتبقى المهام مفتوحة حتى قبول Q02/Q04. جميع فحوص Q02–Q12 ما زالت NOT_RUN؛ لم تُطبّق ترحيلات أو تُشغّل خدمات أو يُنفذ نشر.

**Panel release boundary:** Acceptance covers this active panel scope only. Existing shared migrations and excluded consumer compatibility still constrain a safe combined deployment; retain their guards and report conflicts without adding store/app modifications or claiming those consumers verified.
