// Sanitized reconstruction of the live read-only browser trace on 2026-10-13.
// Real: control names, labels/values, disabled states, maxlength and package rows.
// Synthetic: card serials and all WebForms state. No cookies or provider tokens.
export const observedPackages = [
    ['Together 3 Months (3 Months)', 27], ['Together 6 Months (6 Months)', 54],
    ['Together 12 Months (12 Months)', 108], ['Together 24 Months (24 Months)', 216],
    ['Premium 3 Months (3 Months)', 54], ['Premium 6 Months (6 Months)', 108],
    ['Premium 12 Months (12 Months)', 216], ['Premium 24 Months (24 Months)', 432],
    ['Ultimate 3 Months (3 Months)', 102], ['Ultimate 6 Months (6 Months)', 204],
    ['Ultimate 12 Months (12 Months)', 408], ['Ultimate 24 Months (24 Months)', 816],
    ['AFC Asian Cup Saudi Arabia 2027 (Full Payment)', 40],
    ['TotalEnergies CAF AFCON PAMOJA 2027 (Full Payment)', 40],
] as const

export function observedSmartcardForm(stage: 'initial' | 'selected' | 'confirm' | 'packages') {
    const prefix = 'ctl00$ContentPlaceHolder1$'
    const locked = stage === 'confirm' || stage === 'packages'
    const serial = stage === 'initial' ? '' : stage === 'selected' ? '7' : stage === 'confirm' ? '7XXXXXXXX' : '700000000'
    return `<form method="post" action="./frmSellPackages.aspx">
    <input id="__VIEWSTATE" name="__VIEWSTATE" value="synthetic-${stage}">
    <input id="__EVENTVALIDATION" name="__EVENTVALIDATION" value="synthetic-validation-${stage}">
    <input id="__EVENTTARGET" name="__EVENTTARGET" value="">
    <input id="__EVENTARGUMENT" name="__EVENTARGUMENT" value="">
    <select id="ContentPlaceHolder1_ddlType" name="${prefix}ddlType" ${locked ? 'disabled="disabled"' : ''}>
        <option value="1" ${stage === 'initial' ? 'selected="selected"' : ''}>Smartcard: Irdeto</option>
        <option value="8" ${stage !== 'initial' ? 'selected="selected"' : ''}>Smartcard: CISCO</option>
        <option value="11">beIN Stream: DeviceID</option>
    </select>
    <input id="ContentPlaceHolder1_tbSerial1" name="${prefix}tbSerial1" type="text" maxlength="${stage === 'initial' ? 10 : 9}" value="${serial}" ${locked ? 'disabled="disabled"' : ''}>
    ${locked ? `<input type="submit" name="${prefix}btnNew" value="Load Another">` : `<input type="submit" name="${prefix}btnLoad1" value="Load">`}
    ${stage === 'confirm' ? `<input id="ContentPlaceHolder1_tbSerial2" name="${prefix}tbSerial2" type="text" maxlength="9" value="7"><input type="submit" name="${prefix}btnLoad2" value="Load">` : ''}
    ${stage === 'packages' ? `<input name="${prefix}txtPromoCode" value=""><input type="submit" name="${prefix}btnPromoCode" value="Submit">
    <table id="ContentPlaceHolder1_gvAvailablePackages"><tr><th>&nbsp;</th><th>Package Name</th><th>Full Price</th></tr>
    ${observedPackages.map(([name, price], index) => `<tr><td><span title="Check to select the package"><input id="ContentPlaceHolder1_gvAvailablePackages_cbSelect_${index}" type="checkbox" name="${prefix}gvAvailablePackages$ctl${String(index + 2).padStart(2, '0')}$cbSelect"></span></td><td><span id="ContentPlaceHolder1_gvAvailablePackages_lblName_${index}">${name}</span></td><td>${price}&nbsp;USD</td></tr>`).join('')}
    </table><input type="submit" name="${prefix}btnAddToCart" value="Add &gt;"><input type="submit" name="${prefix}btnRemoveFromCart" value="&lt; Remove">` : ''}
    <input name="${prefix}ctrlQPay$txtMobileNumber" value="">
    </form>`
}
