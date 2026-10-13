/* eslint-disable @typescript-eslint/no-require-imports -- Existing standalone browser harness. */
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({p,render,check,build,css,out}) => {
 const receipt = {
  operationId:'stats-a-op-1', beinInvoiceNo:'SYNTHETIC-INVOICE', cardNumber:'0000000001',
  itemType:'Card_CISCO', packageName:'Together 6 Months + 20% OFF (6 Months)', promoCode:'SYNTHETIC',
  providerAmount:'43.20', customerChargedAmount:'48.00', currency:'USD',
  contractStartDate:'14/10/2026', contractExpiryDate:'13/04/2027', reportDate:'2026-10-13',
  verifiedAt:'2026-10-13T10:00:00Z',
 };
 // Local fixture for the actual receipt component; intercept every popup request.
 await p.context().route('**/*', route => route.fulfill({contentType:'text/html',body:
  '<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body><div id="root"></div></body></html>'}));
 for (const language of ['ar','en','bn']) for (const width of [390,1280]) {
  await render({view:'stats',language,statsReceipts:true},width);
  const modal=p.getByRole('dialog');await modal.getByText('stats-a note 1',{exact:true}).waitFor();
  const labels=await p.evaluate(()=>({receipt:window.qaText.renewalReceipt,stats:window.qaText.userStats}));
  const links=modal.locator('a[href$="/receipt"]');
  assert.equal(await links.count(),1); // The refund's fixture flag must not expose a link.
  const txHref=await links.first().getAttribute('href');
  assert.equal(txHref,'/dashboard/operations/stats-a-op-1/receipt');
  assert.equal(await links.first().getAttribute('target'),'_blank');
  assert.match(await links.first().getAttribute('rel'),/noopener/);
  await links.first().focus();assert.equal(await links.first().evaluate(el=>el===document.activeElement),true);
  await modal.getByRole('button',{name:labels.stats.tabs.operations+' (3)',exact:true}).click();
  assert.equal(await links.count(),1);assert.equal(await links.first().getAttribute('href'),txHref);
  await modal.getByText(labels.receipt.unavailableShort,{exact:true}).waitFor();
  const opened=p.waitForEvent('popup');await links.first().click();const popup=await opened;
  const errors=[];popup.on('pageerror',e=>errors.push(e.message));
  await popup.waitForLoadState('domcontentloaded');assert.ok(popup.url().endsWith(txHref));
  await popup.setViewportSize({width,height:800});
  await popup.evaluate(config=>window.audit=config,{view:'receipt',language,operationId:receipt.operationId,receipt});
  await popup.addScriptTag({content:build.outputFiles[0].text});
  await popup.getByText(receipt.beinInvoiceNo,{exact:true}).waitFor();
  for(const value of [receipt.packageName,'43.20 USD','48.00 USD'])await popup.getByText(value,{exact:true}).waitFor();
  await popup.getByRole('button',{name:labels.receipt.print,exact:true}).click();
  assert.equal(await popup.evaluate(()=>window.printed),1);
  assert.ok(await popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await popup.emulateMedia({media:'print'});
  assert.equal(await popup.getByRole('button',{name:labels.receipt.print,exact:true}).isVisible(),false);
  if(language==='ar'&&width===390)await popup.screenshot({path:path.join(out,'receipt-print-ar-390.png'),fullPage:true});
  assert.deepEqual(errors,[]);await popup.close();assert.equal(await modal.isVisible(),true);
  await modal.getByRole('button',{name:new RegExp(labels.stats.loadMore,'i')}).click();
  await modal.locator('a[href="/dashboard/operations/stats-a-op-3/receipt"]').waitFor();
  assert.equal(await links.count(),2);
  assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  if(width===390)await p.screenshot({path:path.join(out,'stats-receipts-'+language+'-390.png')});
  check('same saved receipt, original amounts, new tab, print and operation pagination '+language+' '+width);
 }
 await render({view:'stats',language:'en',statsReceipts:true},390);
 await p.getByRole('dialog').getByText('stats-a note 1',{exact:true}).waitFor();
 await p.getByRole('dialog').getByRole('button',{name:/Load more/i}).click();
 await p.getByRole('dialog').locator('a[href="/dashboard/operations/stats-a-op-3/receipt"]').waitFor();
 assert.equal(await p.getByRole('dialog').locator('a[href$="/receipt"]').count(),2);
 check('deduction pagination keeps the linked receipt without loading its operation row');
 await render({view:'stats',language:'en',statsReceipts:true,statsRace:true},390);
 await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('/stats-a/stats')));
 await p.evaluate(()=>window.switchStatsUser());
 await p.getByRole('dialog').locator('a[href="/dashboard/operations/stats-b-op-1/receipt"]').waitFor();
 await p.waitForTimeout(700);
 assert.equal(await p.locator('a[href*="stats-a-op-"]').count(),0);
 check('user switch cannot restore another user receipt link');
 await render({view:'stats',language:'en',statsReceipts:true,managerStats:true,role:'MANAGER'},390);
 const modal=p.getByRole('dialog');await modal.getByText('stats-a note 1',{exact:true}).waitFor();
 assert.equal(await modal.locator('a[href$="/receipt"]').count(),0);
 assert.equal(await modal.getByRole('columnheader',{name:'Receipt',exact:true}).count(),0);
 await modal.getByRole('button',{name:'Operations (3)',exact:true}).click();
 assert.equal(await modal.locator('a[href$="/receipt"]').count(),0);
 check('manager statistics hides receipt columns and links even with forged availability');
};
