/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser harness. */
const assert = require('node:assert/strict');
module.exports = async function reportCases({p,render,check}) {
 if(process.env.PANEL_QA_FOCUS!=='037') {
 const views=['analytics','activityReport','balanceMonitor','loginMonitor','integrity'];
 for(const view of views) for(const language of ['ar','en','bn']) for(const width of [360,390,768,1280,1440]) {
  await render({view,language},width);
  await p.waitForFunction(()=>[...document.querySelectorAll('main tbody')].some(el=>el.innerText.includes('synthetic')));
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' '+language+' '+width+' overflow');
  assert.equal(await p.locator('main table:not([data-panel-table])').count(),0);
  check(view+' populated report '+language+' '+width);
 }
 for(const view of views) for(const status of [401,403,500]) {
  await render({view,language:'en'},390);
  await p.waitForFunction(()=>[...document.querySelectorAll('main tbody')].some(el=>el.innerText.includes('synthetic')));
  await p.evaluate(status=>window.audit.opsError=status,status);
  if(view==='integrity') await p.locator('main input').first().fill('synthetic');
  else if(view==='analytics') await p.locator('main select').selectOption('7');
  else await p.getByRole('button',{name:'Refresh',exact:true}).click();
  await p.locator('main [role=alert]').waitFor();
  assert.equal(await p.locator('main table:visible').count(),0);
  if(status!==401) {
   await p.evaluate(()=>delete window.audit.opsError);
   await p.locator('main [role=alert] button').click();
   await p.waitForFunction(()=>[...document.querySelectorAll('main tbody')].some(el=>el.innerText.includes('synthetic')));
  }
  check(view+' prior-data HTTP '+status+' and recoverable retry');
 }
 await render({view:'integrity',language:'en',writeFailure:true,holdWrite:true},390);
 await p.locator('main tbody select').waitFor();
 await p.locator('main tbody select').selectOption('ACKNOWLEDGED');
 await p.waitForFunction(()=>!!window.releaseWrite);
 await p.getByRole('button',{name:'Scan Last 7 Days',exact:true}).evaluate(el=>{el.click();el.click()});
 await p.evaluate(()=>window.releaseWrite());
 await p.locator('main [role=alert]').waitFor();
 assert.equal(await p.locator('main tbody select').inputValue(),'OPEN');
 assert.equal(await p.evaluate(()=>window.requests.filter(r=>['POST','PATCH'].includes(r.method)).length),1);
 check('integrity rejected action retains status, blocks competing scan and shows failure');
 for(const view of ['analytics','activityReport']) {
  await render({view,language:'en',opsRace:true},390);
  await p.getByText('synthetic-period-30',{exact:true}).waitFor();
  await p.locator('main select').first().selectOption('7');
  await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('days=7')));
  // Analytics replaces its controls with a loader; only the activity view permits
  // another period change while an earlier request is still pending.
  if(view==='analytics') {
   await p.getByText('synthetic-period-7',{exact:true}).waitFor();
   await p.locator('main select').first().selectOption('90');
   await p.getByText('synthetic-period-90',{exact:true}).waitFor();
  } else {
   await p.locator('main select').first().selectOption('90');
   await p.getByText('synthetic-period-90',{exact:true}).waitFor();
   await p.waitForTimeout(1600);
   assert.equal(await p.getByText('synthetic-period-7',{exact:true}).count(),0);
  }
  check(view+(view==='analytics'?' period changes retain contract':' old period cannot overwrite new period'));
 }
 }
 for(const language of ['ar','en','bn']) {
  await render({view:'balanceMonitor',language,holdWrite:true,writeFailure:true,writeStatus:409},390);
  const activate=p.locator('main tbody button');
  await activate.waitFor(); await activate.evaluate(el=>{el.click();el.click()});
  await p.waitForFunction(()=>!!window.releaseWrite);
  await p.locator('[data-panel-command-status]').waitFor();
  assert.equal(await activate.isDisabled(),true);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1);
  await p.evaluate(()=>window.releaseWrite());
  check('037 low-balance activation owns its resource '+language);
  for(const code of ['CREDENTIALS_REJECTED','CAPTCHA_EXHAUSTED','AUTH_REVIEW_REQUIRED','CONNECTION_FAILED','RATE_LIMITED','SYSTEM_ERROR']) {
   await render({view:'loginMonitor',language,loginHealthCode:code},390);
   const healthCopy=await p.evaluate(()=>window.qaText.panelUi.reportCopy);
   await p.getByText(healthCopy.loginHealthReasons[code],{exact:true}).waitFor();
   const warning=['CONNECTION_FAILED','RATE_LIMITED','SYSTEM_ERROR'].includes(code);
   await p.getByText(warning?healthCopy.loginActive:healthCopy.loginInactive,{exact:true}).waitFor();
   if(warning)await p.getByText(healthCopy.loginConnectionWarning,{exact:true}).waitFor();
   assert.equal(await p.getByText(healthCopy.needsPassword,{exact:true}).count(),code==='CREDENTIALS_REJECTED'?1:0);
   assert.equal(await p.locator('main tbody tr').first().locator('td').nth(1).innerText(),code==='CREDENTIALS_REJECTED'?'1':'0');
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   check('037 localized login reason/activity '+language+' '+code);
  }
  await render({view:'loginMonitor',language,opsHang:true},360);
  await p.locator('main svg.animate-spin').waitFor();
  assert.equal(await p.locator('main table').count(),0);
  assert.equal(await p.locator('main tbody button').count(),0);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  check('login recovery '+language+' pending read has loader and no stale actions');
  await render({view:'loginMonitor',language,loginUnknown:true,writeFailure:true,writeStatus:409,holdWrite:true},360);
  const copy=await p.evaluate(()=>window.qaText.panelUi.reportCopy);
  await p.getByText(copy.needsLoginReview,{exact:true}).waitFor();
  assert.equal(await p.getByText(copy.needsPassword,{exact:true}).count(),0);
  const reset=p.locator('main tbody button');
  await reset.evaluate(el=>{el.click();el.click()});
  await p.waitForFunction(()=>!!window.releaseWrite);
  await p.locator('[data-panel-command-status]').waitFor();
  assert.equal(await reset.isDisabled(),true);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1);
  await p.evaluate(()=>window.releaseWrite());
  await p.getByText(copy.accountBusy,{exact:true}).waitFor();
  assert.equal(await p.getByText('synthetic-bein',{exact:true}).count(),1);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(language==='ar'){
   await reset.scrollIntoViewIfNeeded();
   await p.waitForTimeout(350); // Finish the existing toast entry transition before visual evidence.
   await p.screenshot({path:require('node:path').join(process.env.PANEL_QA_OUTPUT||'output/panel-ui','login-review-ar-360.png'),fullPage:true});
  }
  check('login recovery '+language+' unknown review / busy / single pending action / retained row');
  await render({view:'loginMonitor',language,loginEmpty:true},390);
  await p.getByText(copy.noLoginFailures,{exact:true}).waitFor();
  assert.equal(await p.locator('main tbody button').count(),0);
  check('login recovery '+language+' empty state');
 }
};
