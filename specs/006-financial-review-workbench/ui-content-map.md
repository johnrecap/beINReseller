# UI Content Map: Financial Review Workbench

**Purpose**: This file is the implementation source of truth for visible UI structure, labels, fields, buttons, empty states, warnings, and dialog copy. Do not invent alternative labels during implementation unless this file is updated first.

**Primary Language**: Arabic admin-facing text, with short English technical names only in code/component names.

**Tone Rules**:

- Use simple business language first.
- Do not show raw technical issue codes in primary text.
- Use "قيد المراجعة" instead of raw `REVIEW_REQUIRED`.
- Use "فحص الكارت" instead of "verification".
- Use "بين" in visible Arabic labels instead of `beIN` unless the existing dashboard style requires the brand spelling.
- Keep uncertain outcomes honest. Never say "تم التجديد" unless evidence is strong.

## Navigation

### Sidebar Item

Component: `Sidebar`

- Label: `مراجعة العمليات`
- Icon intent: warning/clipboard/checklist style.
- Placement: Admin reports/monitoring group, near Integrity Reports.
- Active route: `/dashboard/admin/financial-review`
- Tooltip if collapsed: `مراجعة العمليات`

### Integrity Reports Callout

Component: existing Integrity Reports page callout.

- Title: `فيه عمليات محتاجة مراجعة`
- Body: `العمليات اللي محتاجة قرار مالي اتنقلت لصفحة مراجعة العمليات عشان تبقى أوضح وأسهل.`
- Primary button: `افتح مراجعة العمليات`
- Secondary text link: `كمل في تقارير المطابقة`
- Count label: `قيد المراجعة`

## Page: Financial Review

Route: `/dashboard/admin/financial-review`

Primary component tree:

```text
FinancialReviewPage
|-- FinancialReviewClient
    |-- ReviewHeader
    |-- ReviewSummaryCards
    |-- ReviewFilters
    |-- ReviewQueueTabs
    |-- ReviewOperationCard[]
    |   |-- ReviewReasonText
    |   |-- ReviewEvidencePanel
    |   |-- CardVerificationPanel
    |   `-- ReviewDecisionDialog
    `-- ReviewEmptyState / ReviewErrorState / ReviewLoadingState
```

### ReviewHeader

Visible copy:

- Page title: `مراجعة العمليات`
- Subtitle: `راجع بس العمليات المشكوك فيها أو غير المكتملة اللي اتخصم فيها رصيد ومحتاجين نتأكد هل التجديد تم ولا لا.`
- Last refresh label: `آخر تحديث`
- Refresh button: `تحديث`
- Refresh loading text: `جاري التحديث...`

Header actions:

- `تحديث`: reloads current filters.
- `تصدير CSV`: optional later action; hide if not implemented in first version.

### ReviewSummaryCards

Show four cards in this order:

1. Title: `محتاج قرار`
   - Value: count of pending `NEEDS_DECISION`.
   - Helper: `عمليات لسه محتاجة رد أو تأكيد`

2. Title: `متابعة لاحقا`
   - Value: count of `FOLLOW_UP`.
   - Helper: `عمليات متساب لها ملاحظة ومحتاجة رجوع`

3. Title: `تم رد الفلوس`
   - Value: count of `REFUNDED`.
   - Helper: `عمليات اتعملها Refund مربوط بالطلب`

4. Title: `تم التأكيد بدون رد`
   - Value: count of `BEIN_EXECUTED`.
   - Helper: `عمليات اتأكد إنها تمت على بين`

### ReviewQueueTabs

Tabs:

- `محتاج قرار`
- `متابعة لاحقا`
- `تم رد الفلوس`
- `تم التأكيد بدون رد`
- `الكل`

Each tab displays count badge when count is greater than zero. `الكل` means all review-eligible cases only, not all system operations.

### ReviewFilters

Fields:

- Search input
  - Label: `بحث`
  - Placeholder: `ابحث برقم العملية، الكارت، اسم العميل، أو حساب بين`

- State select
  - Label: `الحالة`
  - Options:
    - `كل الحالات`
    - `محتاج قرار`
    - `متابعة لاحقا`
    - `تم رد الفلوس`
    - `تم التأكيد بدون رد`

- Date range select
  - Label: `الفترة`
  - Options:
    - `آخر 7 أيام`
    - `آخر 30 يوم`
    - `آخر 90 يوم`
    - `كل الفترة`

- Evidence select
  - Label: `الدليل`
  - Options:
    - `كل الأدلة`
    - `الدليل مكتمل`
    - `الدليل ناقص`
    - `فيه خصم من بين`
    - `مفيش خصم واضح من بين`

- Refund select
  - Label: `رد الفلوس`
  - Options:
    - `كل الحالات`
    - `ممكن الرد`
    - `تم الرد قبل كده`
    - `الرد ممنوع`

- Card check select
  - Label: `فحص الكارت`
  - Options:
    - `كل النتائج`
    - `الكارت غالبا اتجدد`
    - `التجديد مش مؤكد`
    - `فشل الفحص`
    - `لسه متفحصش`

Filter buttons:

- Primary: `تطبيق الفلاتر`
- Secondary: `مسح الفلاتر`

### ReviewOperationCard

Card header fields:

- `رقم العملية`: short operation id, with copy button.
- `العميل`: username/customer name.
- `رقم الكارت`: masked or full card number per existing dashboard rules.
- `المبلغ`: requested amount and currency.
- `الباقة`: selected package name.
- `حساب بين`: label and username if admin-only.
- `تاريخ العملية`: created/updated timestamp.
- `الحالة`: friendly state label.

Header badges:

- `محتاج قرار`
- `متابعة`
- `تم الرد`
- `تم التأكيد`
- `رد موجود`
- `الدليل ناقص`
- `فحص الكارت مطلوب`

Card primary buttons:

- `فحص الكارت الآن`
- `تم التجديد - بدون رد فلوس`
- `رد فلوس للعميل`
- `متابعة لاحقا`

Card secondary buttons:

- `عرض التفاصيل`
- `إخفاء التفاصيل`
- `نسخ رقم العملية`
- `فتح العملية الأصلية` if route exists; otherwise omit.

Disable rules:

- Disable `رد فلوس للعميل` when refund already exists.
- Disable final decision buttons while a decision submit is in progress.
- Disable `فحص الكارت الآن` while a card check is running.

### ReviewReasonText

Primary reason title options:

- `غالبا التجديد تم`
- `التجديد غير مؤكد`
- `غالبا محتاج رد فلوس`
- `الدليل ناقص`
- `تم رد الفلوس قبل كده`
- `محتاج متابعة يدوية`

Reason body templates:

- `العميل اتخصم منه، ورصيد بين قل بنفس قيمة العملية تقريبا.`
- `العميل اتخصم منه، لكن مفيش دليل واضح إن بين خصمت قيمة التجديد.`
- `فحص الكارت بيقول إن الباقة أو تاريخ الانتهاء مناسبين للعملية.`
- `فحص الكارت مقدرش يأكد التجديد. راجع التفاصيل قبل أي قرار.`
- `في Refund موجود بالفعل للعملية دي، مينفعش نعمل رد فلوس تاني.`
- `البيانات ناقصة أو متعارضة. الأفضل تعمل فحص للكارت أو تسيبها متابعة لاحقا.`

Recommendation labels:

- `الأفضل: تأكيد بدون رد فلوس`
- `الأفضل: فحص الكارت الأول`
- `الأفضل: رد فلوس لو مفيش دليل جديد`
- `الأفضل: متابعة لاحقا`

### ReviewEvidencePanel

Section title: `الدليل المالي`

Rows:

- `خصم العميل`: amount deducted from user/customer.
- `رصيد بين قبل العملية`: provider balance before.
- `رصيد بين بعد العملية`: provider balance after.
- `فرق رصيد بين`: provider balance delta.
- `رسالة بين`: response/success/failure message.
- `حالة الرد`: refund state.
- `سبب المراجعة`: plain reason.
- `آخر قرار`: latest admin decision if present.
- `آخر ملاحظة`: latest admin note if present.

Missing values:

- Show `غير متاح` for absent data.
- Show warning text: `الدليل ناقص، متاخدش قرار نهائي غير بعد فحص الكارت أو مراجعة يدوية.`

Advanced section:

- Toggle label: `تفاصيل تقنية`
- Collapsed by default.
- Allowed content: raw operation id, raw review source, raw issue code, selected response data summary.
- Forbidden content: credentials, passwords, tokens, captcha values, full cookies, proxy password.

### CardVerificationPanel

Section title: `فحص الكارت`

States:

1. No check yet
   - Text: `لسه مفيش فحص للكارت بعد العملية دي.`
   - Button: `فحص الكارت الآن`

2. Running
   - Text: `جاري فحص الكارت من بين...`
   - Button text: `جاري الفحص...`

3. Likely renewed
   - Badge: `الكارت غالبا اتجدد`
   - Text: `الفحص لقى بيانات مناسبة للباقة أو تاريخ الانتهاء.`
   - Secondary: `اتراجع بواسطة {admin} - {date}`

4. Not confirmed
   - Badge: `التجديد مش مؤكد`
   - Text: `الفحص الحالي مقدرش يأكد إن الباقة اتضافت للكارت.`
   - Secondary: `راجع الدليل المالي قبل الرد.`

5. Failed
   - Badge: `فشل الفحص`
   - Text: `تعذر فحص الكارت حاليا. ممكن تكون مشكلة بين، بروكسي، أو جلسة.`
   - Button: `إعادة الفحص`

Fields to show when available:

- `الباقة الموجودة`
- `تاريخ الانتهاء`
- `نتيجة الفحص`
- `وقت الفحص`
- `تم بواسطة`

### ReviewDecisionDialog

Shared fields:

- Title depends on action.
- Required note label: `ملاحظة القرار`
- Note placeholder: `اكتب سبب القرار بوضوح عشان أي أدمن يراجعه بعدين`
- Checkbox label: `أفهم إن القرار ده هيأثر على رصيد العميل أو حالة العملية`
- Cancel button: `إلغاء`

Action: no refund

- Open button: `تم التجديد - بدون رد فلوس`
- Dialog title: `تأكيد إن التجديد تم`
- Warning text: `استخدم القرار ده لما تكون متأكد إن التجديد تم على بين أو فحص الكارت أكد العملية.`
- Confirm button: `تأكيد بدون رد فلوس`
- Success toast: `تم حفظ القرار بدون رد فلوس`

Action: refund

- Open button: `رد فلوس للعميل`
- Dialog title: `رد فلوس للعميل`
- Warning text: `هيتم إضافة Refund مربوط بالعملية دي. اتأكد إن التجديد لم يتم أو الدليل غير كافي.`
- Confirm button: `تأكيد رد الفلوس`
- Success toast: `تم رد الفلوس وحفظ القرار`
- Duplicate refund error: `فيه Refund موجود بالفعل للعملية دي`

Action: keep under review

- Open button: `متابعة لاحقا`
- Dialog title: `ترك العملية للمتابعة`
- Warning text: `استخدمها لو الدليل ناقص أو محتاج مراجعة من بين قبل القرار النهائي.`
- Confirm button: `حفظ للمتابعة`
- Success toast: `تم حفظ العملية للمتابعة`

Common errors:

- `لازم تكتب ملاحظة قبل حفظ القرار`
- `لازم تأكد إنك فاهم تأثير القرار`
- `تعذر حفظ القرار. حاول تاني`
- `العملية اتعدلت بواسطة أدمن تاني. حدث الصفحة وراجعها مرة أخرى`

## Empty, Loading, and Error States

Loading:

- `جاري تحميل عمليات المراجعة...`

No pending reviews:

- Title: `مفيش عمليات محتاجة قرار`
- Body: `لو ظهرت عملية مشكوك فيها واتخصم فيها رصيد هتظهر هنا تلقائيا.`
- Button: `تحديث`

No filter results:

- Title: `مفيش نتائج بالفلاتر الحالية`
- Body: `جرب تمسح الفلاتر أو توسع الفترة.`
- Button: `مسح الفلاتر`

API error:

- Title: `تعذر تحميل المراجعات`
- Body: `حاول تحدث الصفحة. لو المشكلة مستمرة راجع اللوجز.`
- Button: `إعادة المحاولة`

## User-Facing Status Copy

For customer/history operation displays:

- Status label: `قيد مراجعة الإدارة`
- Helper text: `تم تسجيل العملية للمراجعة عشان نتأكد هل التجديد تم ولا محتاجة رد فلوس.`
- Do not show: beIN account, proxy, worker, issue code, internal review reason, or provider balance.

## Final UI Acceptance Checklist

- Every visible label in the workbench exists in this file.
- Primary text is Arabic and understandable without code/log knowledge.
- Raw technical codes are collapsed under `تفاصيل تقنية`.
- Card verification is labeled as evidence only, not a final decision.
- Refund action is visually separate from no-refund and follow-up actions.
- Duplicate refund state blocks refund button and shows why.
- Empty/error/loading states never look like "no problem" when data failed to load.
