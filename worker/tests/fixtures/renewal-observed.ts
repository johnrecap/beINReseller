// Sanitized reconstruction of DOM fragments inspected on 2026-10-11, not raw captures.
// Real: cart IDs/legend/checkbox/footer/total, CISCO type and serial; report criteria/headers.
// Synthetic: IDs, money/offer variants, explicit rowspans and all later purchase stages.
export const fullCard = '7000000001'
export const providerCard = '700000000'
export function observedCart(name = 'Premium 6 Months (6 Months)', amount = '108', promo = '') {
    return `<input name="ctl00$ContentPlaceHolder1$tbSerial1" value="${providerCard}" disabled>
    <select name="ctl00$ContentPlaceHolder1$ddlType" disabled><option value="8" selected>CISCO</option></select>
    <input name="ctl00$ContentPlaceHolder1$txtPromoCode" value="${promo}">
    <fieldset><legend>Shopping Cart</legend><div><table id="ContentPlaceHolder1_gvPackagesCart">
    <tr><th></th><th>Package Name</th><th>Price</th></tr>
    <tr><td><input type="checkbox" name="ctl00$ContentPlaceHolder1$gvPackagesCart$ctl02$cbSelect"></td>
    <td><span id="ContentPlaceHolder1_gvPackagesCart_lblName_0">${name}</span></td><td>${amount}&nbsp;USD</td></tr>
    <tr><td colspan="2">Remaining<div>* Money due if any will be added to the current package as extended validity</div></td><td><div>${amount}USD</div></td></tr>
    </table></div></fieldset><span id="ContentPlaceHolder1_lblTotalAmount">${amount} USD</span>`
}
export function observedReport(rows = `<tr><td>Subscriber</td><td>Country</td><td>1001</td><td>${providerCard}</td><td>Card_CISCO</td><td>Add Premium 6 Months</td><td>11/10/2026</td><td>10/04/2027</td><td>108</td></tr>`, total = 1) {
    return `<form><input name="__VIEWSTATE" value="synthetic"><input name="__EVENTVALIDATION" value="synthetic">
    <select name="ctl00$ContentPlaceHolder1$cboDealer"><option value="dealer-a" selected>Dealer A</option></select>
    <select name="ctl00$ContentPlaceHolder1$ddlType"><option value="0" selected>All</option></select>
    <input name="ctl00$ContentPlaceHolder1$DateFrom$txtDate" value="">
    <input name="ctl00$ContentPlaceHolder1$DateTo$txtDate" value="">
    <input type="submit" name="ctl00$ContentPlaceHolder1$btnApply" value="Apply">
    <table id="ContentPlaceHolder1_GridView1"><tr><th>Subscriber</th><th>Country</th><th>Invoice No</th><th>Smart Card / CAM Serial</th><th>Item Type</th><th>Package</th><th>Contract Start</th><th>Contract Expiry</th><th>Amount USD</th></tr>
    <tr><td colspan="10">Dealer A - Total Sold Packages: ${total}</td></tr>${rows}</table></form>`
}
