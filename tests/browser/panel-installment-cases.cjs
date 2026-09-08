/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic HTTP only; never connect to provider. */
const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function installmentCases({p,render,check}) {
 for(const language of ['ar','en','bn']) for(const width of [360,390,768,1280,1440]) {
  await render({view:'installments',language},width);
  await p.locator('#installmentCard').fill('0000000000');
  const labels=await p.evaluate(()=>window.qaText.installment);
  await p.getByRole('button',{name:labels.loadButton,exact:true}).click();
  await p.getByText('Synthetic subscriber',{exact:true}).waitFor();
  assert.equal(await p.locator('main table').count(),3);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'installment details overflow '+language+' '+width+' '+JSON.stringify(await p.locator('main').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).slice(0,8).map(el=>({tag:el.tagName,classes:el.className})))));
  assert.ok((await p.locator('main').innerText()).includes('100'));
  assert.equal(await p.locator('main th').first().evaluate(el=>getComputedStyle(el).color),'rgb(51, 51, 51)','provider header contrast');
  await p.locator('main tbody tr').first().hover();
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('main tbody tr')).backgroundColor==='rgb(245, 245, 245)');
  assert.equal(await p.locator('main tbody tr').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(245, 245, 245)','provider hover must not inherit dark panel surface');
  if(language==='ar'&&width===360&&process.env.PANEL_QA_OUTPUT)await p.screenshot({path:path.join(process.env.PANEL_QA_OUTPUT,'installment-tables-ar-360.png')});
  await p.getByRole('button',{name:labels.payInstallment,exact:true}).click();
  const modal=p.getByRole('dialog');await modal.waitFor();
  assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'installment modal overflow');
  if(language==='ar'&&width===360&&process.env.PANEL_QA_OUTPUT)await p.screenshot({path:path.join(process.env.PANEL_QA_OUTPUT,'installment-confirm-ar-360.png')});
  await p.keyboard.press('Escape');await modal.waitFor({state:'detached'});
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1,'view test must never confirm or pay');
  check('installment three tables and view-only dialog '+language+' '+width);
 }
 const start=async(config={})=>{
  await render({view:'installments',language:'en',...config},390);
  await p.locator('#installmentCard').fill('0000000000');
  const labels=await p.evaluate(()=>window.qaText.installment);
  await p.getByRole('button',{name:labels.loadButton,exact:true}).evaluate(el=>{el.click();el.click()});
  return labels;
 };
 const reads=()=>p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/installment')).length);
 const confirms=()=>p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/confirm-installment')).length);
 for(const status of [401,403,500]) {
  await start({installmentReadStatus:status});
  await p.getByRole('alert').waitFor();
  assert.equal(await p.locator('main table').count(),0);
  assert.equal(await reads(),1);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/start-installment')).length),1);
  if(status!==401) {
   await p.evaluate(()=>delete window.audit.installmentReadStatus);
   await p.getByRole('alert').getByRole('button').click();
   await p.getByText('Synthetic subscriber',{exact:true}).waitFor();
  }
  check('installment read HTTP '+status+' and guarded start/read-only retry');
 }
 for(const status of ['CANCELLED','FAILED','EXPIRED','REVIEW_REQUIRED','UNRECOGNIZED','AWAITING_CAPTCHA']) {
  await start({installmentStatus:status});await p.getByRole('alert').waitFor();
  assert.equal(await p.locator('main table').count(),0);
  assert.equal(await confirms(),0);
  assert.equal(await p.locator('#installmentCard').count(),0,'uncertain/follow-up state must not offer new payment');
  check('installment server status requires follow-up '+status);
 }
 for(const language of ['ar','en','bn']) {
  const labels=await start({language,installmentExpired:true});
  const text=await p.evaluate(()=>window.qaText.panelUi.installmentExpired);
  await p.getByText(text,{exact:true}).waitFor();
  assert.equal(await p.getByRole('button',{name:labels.payInstallment,exact:true}).isDisabled(),true);
  assert.equal(await confirms(),0);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url.includes('cancel')).length),0);
  check('installment local expiry does not claim cancellation or send command '+language);
 }
 await start({installmentInvalidExpiry:true});await p.getByRole('alert').waitFor();
 assert.equal(await p.locator('main table').count(),0);check('installment malformed confirmation snapshot rejected');
 await start({installmentReadHang:true});
 await p.getByRole('alert').waitFor({timeout:18000});
 assert.equal(await reads(),1,'deadline must not be restarted by overlapping polls');
 await p.evaluate(()=>delete window.audit.installmentReadHang);
 await p.getByRole('alert').getByRole('button').click();await p.getByText('Synthetic subscriber',{exact:true}).waitFor();
 check('installment real read deadline and explicit read retry');
 for(const status of [400,401,403,409,500]) {
  const labels=await start({installmentConfirmStatus:status,holdWrite:true});
  await p.getByRole('button',{name:labels.payInstallment,exact:true}).click();
  const modal=p.getByRole('dialog');
  await modal.getByRole('button',{name:labels.payNow,exact:true}).evaluate(el=>{el.click();el.click()});
  await p.waitForFunction(()=>typeof window.releaseWrite==='function');
  await p.keyboard.press('Escape');assert.equal(await modal.count(),1);
  assert.equal(await confirms(),1);
  await p.evaluate(()=>window.releaseWrite());
  await p.getByRole('alert').waitFor();
  if(status<500)assert.equal(await modal.count(),1,'definitive rejection retains confirmation details');
  else {assert.equal(await modal.count(),0);assert.equal(await p.locator('main table').count(),0);}
  check('installment held single confirmation and HTTP '+status);
 }
 for(const status of ['COMPLETED','REVIEW_REQUIRED']) {
  const labels=await start({installmentAfterConfirm:status});
  await p.getByRole('button',{name:labels.payInstallment,exact:true}).click();
  await p.getByRole('dialog').getByRole('button',{name:labels.payNow,exact:true}).click();
  if(status==='COMPLETED')await p.getByText(labels.successTitle,{exact:true}).waitFor();
  else await p.getByRole('alert').waitFor();
  assert.equal(await confirms(),1);
  check('installment confirmed command follows synthetic server '+status);
 }
 const labels=await start();await p.getByRole('button',{name:labels.payInstallment,exact:true}).click();
 await p.evaluate(()=>window.audit.installmentReadStatus=403);
 await p.getByRole('alert').waitFor();assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await p.locator('main table').count(),0);
 check('installment permission revocation removes subscriber and confirmation');
 await start({installmentStartStatus:500});await p.getByRole('alert').waitFor();
 assert.equal(await p.locator('#installmentCard').count(),0);assert.equal(await confirms(),0);
  check('installment uncertain start directs follow-up without resubmission');
 await start({installmentStartHang:true});await p.getByRole('alert').waitFor({timeout:48000});
 assert.equal(await p.locator('#installmentCard').count(),0);
 assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/start-installment')).length),1);
 check('installment real start command deadline preserves uncertain outcome');
 const timeoutLabels=await start({installmentConfirmHang:true});
 await p.getByRole('button',{name:timeoutLabels.payInstallment,exact:true}).click();
 await p.getByRole('dialog').getByRole('button',{name:timeoutLabels.payNow,exact:true}).click();
 await p.getByRole('alert').waitFor({timeout:48000});
 assert.equal(await confirms(),1);assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await p.locator('main table').count(),0);
 check('installment real confirmation deadline offers follow-up without another payment');
};
