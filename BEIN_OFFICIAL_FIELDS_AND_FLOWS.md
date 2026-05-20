# beIN Official Fields and Operation Flows

This document records the beIN portal field names and request sequence currently used by the reseller worker.

Source of truth in this project:
- `worker/src/http/HttpClientService.ts`
- `worker/src/http-queue-processor.ts`
- `worker/src/http/types.ts`

Important notes:
- These are field names observed from the official beIN dealer pages as used by the current code.
- beIN pages are ASP.NET WebForms pages, so every POST must keep the latest hidden fields such as `__VIEWSTATE`, `__EVENTVALIDATION`, `__EVENTTARGET`, and `__EVENTARGUMENT`.
- If beIN changes page HTML, button names, or dropdown values, this document and the worker selectors must be reviewed together.
- Mobile renewal and Store flows are not covered here.

## beIN Pages Used

| Purpose | Config key | Default path |
|---|---|---|
| Login | `bein_login_url` | `https://sbs.beinsports.net/Dealers/NLogin.aspx` |
| Card check / signal check | `bein_check_url` | `/Dealers/Pages/frmCheck.aspx` |
| Renewal packages / final payment / dealer balance | `bein_renew_url` | `/Dealers/Pages/frmSellPackages.aspx` |
| Monthly installment / debt payment | `bein_installment_url` | `/Dealers/Pages/frmPayMonthlyInstallment.aspx` |

## Common ASP.NET Hidden Fields

These fields are copied from the latest page response and sent back with the next POST:

- `__VIEWSTATE`
- `__VIEWSTATEGENERATOR`
- `__EVENTVALIDATION`
- `__EVENTTARGET`
- `__EVENTARGUMENT`

Rule: do not refresh or navigate away between dependent POST steps unless the code intentionally starts a new flow. The worker must keep the latest ViewState from each response.

## Card Check Fields

Page: `/Dealers/Pages/frmCheck.aspx`

Purpose: validate card and extract STB number.

Fields submitted:

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$tbSerial` | Full smart card number |
| `ctl00$ContentPlaceHolder1$btnCheck` | Button value extracted from the page, fallback `Check` |

Data extracted from response:

- STB number from text patterns like `STB(s): <number>` or `STB: <number>`.
- `ContentPlaceHolder1_lblSerial` can also contain paired STB information.
- Premium/card status text.
- Wallet balance for signal flows using pattern like `Wallet balance: <amount>`.
- Activation count for signal flows.
- Contract rows for signal history if available.

## Renewal Package Loading Fields

Page: `/Dealers/Pages/frmSellPackages.aspx`

Purpose: load available packages before renewal payment.

Step 1: GET packages page.

Step 2: select smartcard type, if `ddlType` exists.

| Field | Value |
|---|---|
| `__EVENTTARGET` | `ctl00$ContentPlaceHolder1$ddlType` |
| `__EVENTARGUMENT` | empty |
| `ctl00$ContentPlaceHolder1$ddlType` | selected option value for CISCO, Smartcard, Humax, or Irdeto |

Step 3: load first serial field.

For CISCO-style cards the current code removes the last digit before sending to beIN.

Example:

| Panel card | beIN sent value |
|---|---|
| `7511394806` | `751139480` |

Fields:

| Field | Value |
|---|---|
| `__EVENTTARGET` | empty |
| `__EVENTARGUMENT` | empty |
| `ctl00$ContentPlaceHolder1$ddlType` | selected card type value |
| `ctl00$ContentPlaceHolder1$tbSerial1` | formatted card number |
| `ctl00$ContentPlaceHolder1$btnLoad` or `ctl00$ContentPlaceHolder1$btnLoad1` | button value extracted from page, fallback `Load` |
| `ctl00$ContentPlaceHolder1$ctrlQPay$txtMobileNumber` | empty string |

Step 4: if beIN returns `tbSerial2`, send confirmation POST.

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$ddlType` | selected card type value |
| `ctl00$ContentPlaceHolder1$tbSerial1` | formatted card number |
| `ctl00$ContentPlaceHolder1$tbSerial2` | formatted card number |
| `ctl00$ContentPlaceHolder1$btnLoad`, `btnLoad1`, or `btnLoad2` | button value extracted from page |
| `ctl00$ContentPlaceHolder1$ctrlQPay$txtMobileNumber` | empty string |

Data extracted:

- Package table selectors:
  - `#ContentPlaceHolder1_gvAvailablePackages tr.GridRow`
  - `#ContentPlaceHolder1_gvAvailablePackages tr.GridAlternatingRow`
  - `table[id*="gvAvailablePackages"] tr:not(:first-child)`
- Package checkbox:
  - the checkbox `name` is preferred.
  - checkbox `id` is fallback.
- Package name:
  - span containing `lblName`.
- Package price:
  - first `USD` amount in the package row.
- Dealer balance:
  - text pattern `Current Credit Balance is <amount> USD`.

## Promo Code Fields

Page: `/Dealers/Pages/frmSellPackages.aspx`

Must run after packages are loaded and ViewState is available.

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$txtPromoCode` | Promo code |
| `ctl00$ContentPlaceHolder1$btnPromoCode` | `Submit` |

After POST, the worker re-extracts packages from the response. If packages are empty, it reloads packages as fallback.

## Renewal Purchase Sequence

This is the sequence used to renew a package.

1. Login or restore cached beIN session.
2. Check card on `/Dealers/Pages/frmCheck.aspx`.
3. Extract STB number.
4. Load packages on `/Dealers/Pages/frmSellPackages.aspx`.
5. Extract packages, prices, checkbox names, and dealer balance.
6. Customer selects package in the panel.
7. Panel deducts customer balance at final confirm time.
8. Worker restores operation session and ViewState.
9. Worker selects package checkbox and adds it to cart.
10. Worker clicks Sell.
11. Worker sends STB serial fields.
12. If configured to pause, operation waits for user final confirmation.
13. Worker clicks final OK and then Pay.
14. Worker checks beIN success text and dealer balance before/after.
15. Operation becomes completed, review-required, failed, or refund-safe depending on the payment result.

### Add To Cart Fields

| Field | Value |
|---|---|
| `<package checkbox name or id>` | `on` |
| `ctl00$ContentPlaceHolder1$btnAddToCart` | `Add >` |
| `ctl00$ContentPlaceHolder1$txtPromoCode` | promo code, only if supplied |

### Sell Fields

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$btnSell` | `Sell` |

### STB Fields Before Final OK

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$tbStbSerial1` | STB number |
| `ctl00$ContentPlaceHolder1$tbStbSerial2` | STB number |
| `ctl00$ContentPlaceHolder1$toStbSerial2` | STB number, alternative field |

### Final OK Fields

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$tbStbSerial1` | STB number |
| `ctl00$ContentPlaceHolder1$tbStbSerial2` | STB number |
| `ctl00$ContentPlaceHolder1$toStbSerial2` | STB number, alternative field |
| `ctl00$ContentPlaceHolder1$btnStbOk` | `Ok` |

After this POST, beIN shows the payment option page. The worker captures dealer balance before final Pay from:

`Current Credit Balance is <amount> USD`

### Final Pay Fields

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$tbSerial1` | value extracted from the payment page input named `ctl00$ContentPlaceHolder1$tbSerial1` |
| `ctl00$ContentPlaceHolder1$Epay` | `RbdDirectPay` |
| `ctl00$ContentPlaceHolder1$BtnPay` | `Pay` |

Success evidence:

- Text contains `Contract Created Successfully`.
- Text contains `Package Added Successfully`.
- Dealer balance decreases after final Pay.

Unclear evidence:

- `Transaction is busy`.
- No success confirmation.
- Balance cannot be read.
- Login/session page after final Pay.
- Network or timeout after final Pay.

Current safety direction:

- Clear success or balance decrease means complete or review without refund.
- Clear pre-charge failure can be refund-safe.
- Unknown after final Pay must become manual review, not automatic refund.

## Cancel Renewal Fields

Page: `/Dealers/Pages/frmSellPackages.aspx`

Used when trying to cancel before final payment is completed.

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$btnStbCancel` | `Cancel` |

Safety note:

- Before final Pay: cancellation can be safe.
- During or after final Pay: cancellation must be treated as review-only because beIN may already have charged the dealer account.

## Dealer Balance Check

The reliable balance source is the sell packages page.

Page: `/Dealers/Pages/frmSellPackages.aspx`

Patterns used:

- `Current Credit Balance is <amount> USD`
- `Credit Balance: <amount> USD`
- `Balance: <amount> USD`
- `<amount> USD Credit`
- `<amount> USD Balance`

Admin balance fetch path may also submit:

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$txtSmartNo` | card number |
| `ctl00$ContentPlaceHolder1$btnSubmit` | `Submit` |

## Signal / Verification Flow

Page: `/Dealers/Pages/frmCheck.aspx`

Purpose: check card status, premium state, wallet balance, STB, activation count, and contract history.

Step sequence:

1. GET check page.
2. Extract ViewState.
3. POST card number using `tbSerial`.
4. Parse status and card data.
5. For activation, keep latest ViewState and submit activation fields from the check page.
6. Verify activation by checking success text or activation count changes.

Base check fields:

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$tbSerial` | full card number |
| `ctl00$ContentPlaceHolder1$btnCheck` | button value extracted from page, fallback `Check` |

Extracted data:

- Premium status from page text.
- STB number from `STB(s): <number>` or `STB: <number>`.
- Smart card serial.
- Expiry date.
- Wallet balance from `Wallet balance: <amount>`.
- Activation count current/max.
- Contract rows with type, status, package, start date, expiry date, and invoice number.

## Monthly Installment / Debt Flow

Page: `/Dealers/Pages/frmPayMonthlyInstallment.aspx`

Purpose: find and pay monthly installment/debt.

### Load Installment Sequence

1. GET installment page.
2. Extract hidden fields.
3. Select card type from `ddlType`, usually CISCO.
4. POST dropdown change using `__EVENTTARGET`.
5. Send formatted card number in `tbSerial1`.
6. If beIN asks for confirm serial, send `tbSerial1` and `tbSerial2`.
7. Parse package, installment amount, dealer price, contract dates, subscriber details, and dealer balance.

### Card Type Selection Fields

| Field | Value |
|---|---|
| `__EVENTTARGET` | `ctl00$ContentPlaceHolder1$ddlType` |
| `__EVENTARGUMENT` | empty |
| `ctl00$ContentPlaceHolder1$ddlType` | CISCO option value extracted from page |

### First Load Fields

| Field | Value |
|---|---|
| `__EVENTTARGET` | empty |
| `__EVENTARGUMENT` | empty |
| `ctl00$ContentPlaceHolder1$ddlType` | CISCO option value |
| `ctl00$ContentPlaceHolder1$tbSerial1` | formatted card number, last digit removed for 10-digit CISCO cards |
| `ctl00$ContentPlaceHolder1$btnSmtLoad1` or `btnLoad1` or `btnLoad` | button value extracted from page |

### Confirm Serial Fields

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$ddlType` | CISCO option value |
| `ctl00$ContentPlaceHolder1$tbSerial1` | formatted card number |
| `ctl00$ContentPlaceHolder1$tbSerial2` | formatted card number |
| `ctl00$ContentPlaceHolder1$btnLoad2` or `btnLoad` | button value extracted from page |

### Installment Data Extracted

- Package from `lblPackage`, `PackagesRow`, or text containing `Package`.
- Months to pay from dropdown containing `ddlMonths` or `Months`.
- Installment amounts from table headers `Installment 1` and `Installment 2`.
- Contract start date from inputs containing `txtContractStart` or labels `Contract Start`.
- Contract expiry date from inputs containing `txtContractExpiry` or labels `Contract Expiry`.
- Invoice price from inputs containing `txtInvoicePrice`.
- Dealer price from inputs containing `txtDealerPrice`.
- Subscriber information:
  - customer name fields containing `txtCustomerName` or `txtName`
  - email fields containing `txtCustomerEmail` or `txtEmail`
  - mobile fields containing `txtMobile`
  - city, country, address, remarks, home/work phone, fax, STB model
- Dealer balance from text containing `Balance ... USD`.

### Pay Installment Sequence

1. Load installment details first.
2. Read dealer balance before payment.
3. POST `btnPayInstallment`.
4. If payment type popup appears, select Direct Payment.
5. POST Pay button.
6. Read dealer balance after payment.
7. Treat success text or balance decrease as payment evidence.
8. Treat unclear result after submitted payment as manual review, not automatic refund.

### Pay Installment Fields

| Field | Value |
|---|---|
| `ctl00$ContentPlaceHolder1$btnPayInstallment` | button value extracted from page, fallback `Pay Installment` |

Popup/direct payment fields:

| Field | Value |
|---|---|
| radio field containing `Epay`, `RbdDirectPay`, `RbdDirectEPay`, or `DirectPay` | direct payment value extracted from page, fallback `RbdDirectPay` |
| Pay button containing `BtnPay`, `btnPay`, or submit button | button value extracted from page, fallback `Pay` |

## High-Risk Rules

- Never send final Pay without the latest ViewState from the previous beIN response.
- Never use old cached package prices to decide final refund after payment.
- Never consider timeout after final Pay as proof that beIN did not charge.
- Never automatically refund after final Pay unless there is clear evidence that beIN did not charge.
- Dealer balance decrease after Pay is strong evidence that beIN charged the dealer account.
- `ctrlQPay$txtMobileNumber` is intentionally cleared in renewal package loading to avoid ASP.NET validation problems.
