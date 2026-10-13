# Dynamic promo renewal repair — 2026-10-13

Scope: implement the accepted renewal/promo safeguards in local source and test with synthetic HTTP. No beIN Add, Sell, OK, Pay, subscription, deployment, database write or subagent was used for this task.

## HTTP evidence and limits

The signed-in Sell Packages page was read in the Codex browser. Its visible form posts to `frmSellPackages.aspx` and contains `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`, `ddlType`, `tbSerial1` and `btnLoad1`. The selected CISCO option has value `8`; its first serial field has maxlength `9`. The previous authorized browser trace in [package identity repair](package-identity-repair.md) records both CISCO Load POSTs and the disabled controls omitted from the second native POST. These are **observed form/earlier request facts**, not a captured promo POST or promo response.

Correction after checking the current HTTP loader against the previously captured native CISCO Load requests: the selected provider field has `maxlength=9` and a prefilled `7`; the browser submits the **complete nine-digit field value**, including that `7`, in `tbSerial1` and later `tbSerial2`. The panel keeps the customer's ten-digit card separately and, for CISCO only, derives the provider field value by removing the last digit. It does not remove the first digit or submit just the eight manually entered digits. The earlier assistant request to approve this normal field value as a potentially incomplete/different card was a mistaken interpretation and is withdrawn. The automatic browser approval review still declined the current first Load, which was not sent. Therefore the current live before/after offer list, actual promo acceptance, and later checkout/report response remain **NOT_VERIFIED**. The coupon value and discount are never fixed in source; the provided code is a time-limited example only.

## Implemented source behavior

| Requirement | Local behavior and evidence | State |
| --- | --- | --- |
| Normalize a changing promo | API trims and uppercases the submitted code. Current UI already uppercases typed input. The accepted value, not a draft, is bound to a new quote revision. | VERIFIED locally; live beIN acceptance NOT_VERIFIED |
| Submit the current WebForms form | After exact card/type Load, the Worker retains that response only for its current client. Promo submission reconstructs enabled successful controls, including the current WebForms state, card/type fields and actual promo button value. A missing/duplicate control, stale ViewState, other card/type, cart or checked old row stops before the POST. | VERIFIED in synthetic HTTP tests |
| Preserve exact offer | Promo must echo the code and change the commercial catalogue. Applying/removing it invalidates the old selection; the customer selects from the new quote. Fulfillment reloads the same card/type, reapplies the accepted code and uniquely rematches full name (including duration/offer), price and currency. Reordered rows do not authorize another offer. | VERIFIED locally; provider response layout NOT_VERIFIED |
| Stop wrong cart or invoice | Existing guards require one matching cart line and total before Sell/Pay, then a new same-account Sold Report invoice matching the full offer/amount/card plus a same-invoice active contract. A changed discount name at the same price fails matching. Missing/delayed Reports stays under review without another Pay or automatic refund. | VERIFIED locally; new live sale NOT_VERIFIED |
| Receiver and log safety | Check clears any prior client STB, accepts one explicitly labelled receiver with the requested card echoed, and no longer guesses from any 15-digit page value. Before Add, the Worker checks that card again and stops if the STB is absent or differs from the operation. Known direct card/STB/coupon and provider-page-snippet log statements in these paths were removed; unstructured exception logging elsewhere still needs a separate audit. | VERIFIED locally; live Check response compatibility NOT_VERIFIED |

The receiver is **entered later**, after Add and Sell, into both `tbStbSerial1` and `tbStbSerial2` (or the observed-code alias `toStbSerial2`). The Worker requires both fields and the same value echoed before it prepares final `btnStbOk`; that final POST retains both values. A focused synthetic test asserts both submissions and rejects a different second echo. The actual live post-selection HTTP for these fields was not observed, so their provider compatibility remains NOT_VERIFIED.

No API endpoint, translation key, migration, queue limit, account allocation or financial closure rule was added. Old mixed-version Workers can bypass these source guards; all deployed panel Workers and web must be built from one reviewed version before production acceptance. Their running artifacts were not inspected here.

## Local checks

- Focused promo/identity/API tests pass, including uppercase input, stale/ambiguous form, changed offer name at the same price, card/STB mismatch, reordered controls, cart mismatch and invoice/contract mismatch.
- Full Worker test command `node --import tsx --test --test-reporter=dot worker/tests/*.test.ts` exits 0. Full root unit command with the bundled Python interpreter and a workspace-owned temporary directory exits 0; the temporary directory was removed after the run.
- Root and Worker TypeScript `--noEmit` checks pass. Scoped ESLint exits 0 with pre-existing warnings; no errors. The final diff/encoding checks are recorded in the task handoff.
- All provider purchase/payment responses in tests are synthetic. Live checkout, report-after-sale, current promo acceptance, deployed Worker parity and incident attribution remain **NOT_VERIFIED**.
