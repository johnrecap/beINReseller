/* eslint-disable @typescript-eslint/no-require-imports -- Provider-free active-operation fixtures. */
const assert=require('node:assert/strict');
module.exports=async function activeCases({p,render,check}) {
 for(const language of ['ar','en','bn'])for(const width of [360,390,768,1280,1440]) {
  await render({view:'activeOperations',language},width);
  await p.getByText('0000000009',{exact:true}).waitFor();
  assert.equal(await p.locator('main tbody tr').count(),8,'server-active expired rows remain visible; terminal row excluded');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.equal(await p.locator('main table:visible').count(),1);
  assert.equal(await p.locator('main [dir]').first().getAttribute('dir'),language==='ar'?'rtl':'ltr');
  for(const card of ['0000000005','0000000006'])assert.equal(await p.locator('main tr').filter({hasText:card}).getByRole('button').count(),0,'charged/review operation has no duplicate payment or cancel action');
  check('active operations full status/expiry table and locale direction '+language+' '+width);
 }
 for(const status of [401,403,500]) {
  await render({view:'activeOperations',language:'en'},390);await p.getByText('0000000000',{exact:true}).waitFor();
  await p.evaluate(status=>window.audit.opsError=status,status);
  await p.getByRole('button',{name:await p.evaluate(()=>window.qaText.activeOperations.refresh),exact:true}).click();
  await p.locator('main [role=alert]').waitFor();assert.equal(await p.locator('main table').count(),0);
  assert.equal(await p.getByText(await p.evaluate(()=>window.qaText.activeOperations.noOperations),{exact:true}).count(),0);
  check('active operations prior-data HTTP '+status+' is not successful empty/completed state');
 }
 await render({view:'activeOperations',language:'en',opsHang:true},390);
 await p.locator('main [role=alert]').waitFor({timeout:18000});
 assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url.includes('status=active')).length),1,'poll interval cannot restart a hanging read forever');
 check('active operation polling permits deadline failure without overlapping reads');
 for(const language of ['ar','en','bn'])for(const action of ['cancel','confirm','cancelConfirm']) {
  await render({view:'activeOperations',language,writeFailure:true,holdWrite:true},390);
  const row=p.locator('main tr').filter({hasText:action==='cancel'?'0000000000':'0000000004'});await row.waitFor();
  if(action==='cancel')await row.getByRole('button').last().evaluate(button=>{button.click();button.click()});
  else {
   await row.getByRole('button').click();
   const modal=p.getByRole('dialog');await modal.waitFor();
   const button=action==='cancelConfirm'?modal.getByRole('button').first():modal.getByRole('button').last();
   await button.evaluate(button=>{button.click();button.click()});
  }
  await p.waitForFunction(()=>!!window.releaseWrite);
  if(action!=='cancel'){await p.keyboard.press('Escape');assert.equal(await p.getByRole('dialog').count(),1);}
  await p.evaluate(()=>window.releaseWrite());
  if(action!=='cancel')await p.getByRole('dialog').getByRole('alert').waitFor();
  else await p.locator('main [role=alert]').waitFor();
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1);
  if(action==='confirm')assert.deepEqual(await p.evaluate(()=>window.requests.find(r=>r.method==='POST').body),{quoteRevision:3});
  assert.equal(await row.count(),1);
  check('active '+action+' preserves rejected operation and admits one request '+language);
 }
 for(const status of [401,403]) {
  await render({view:'activeOperations',language:'en'},390);
  await p.locator('main tr').filter({hasText:'0000000004'}).getByRole('button').click();
  await p.getByRole('dialog').waitFor();
  await p.evaluate(status=>window.audit.opsError=status,status);
  await p.getByRole('dialog').waitFor({state:'detached',timeout:8000});
  await p.locator('main [role=alert]').waitFor();assert.equal(await p.locator('main table').count(),0);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),0);
  check('active confirmation hides its snapshot after polling permission rejection '+status);
 }
 for(const scenario of ['different','forbidden','stateChanged']) {
  await render({view:'activeOperations',language:'en',activeDetails:true,holdDetail:true},390);
  await p.locator('main tr').filter({hasText:'detail-a'}).getByRole('button').click();await p.waitForFunction(()=>!!window.releaseDetail);
  if(scenario==='different') {
   await p.locator('main tr').filter({hasText:'detail-b'}).getByRole('button').click();
   await p.getByRole('dialog').getByText('synthetic-detail-b',{exact:true}).waitFor();
  } else {
   await p.evaluate(scenario=>{if(scenario==='forbidden')window.audit.opsError=403;else window.audit.detailListStatus='COMPLETING';},scenario);
   await p.getByRole('button',{name:await p.evaluate(()=>window.qaText.activeOperations.refresh),exact:true}).click();
   if(scenario==='forbidden')await p.locator('main [role=alert]').waitFor();
   else await p.waitForFunction(()=>[...document.querySelectorAll('main tr')].some(r=>r.textContent.includes('detail-a')&&r.querySelectorAll('button').length===0));
  }
  await p.evaluate(()=>window.releaseDetail());await p.waitForTimeout(150);
  if(scenario==='different')assert.equal(await p.getByRole('dialog').getByText('synthetic-detail-b',{exact:true}).count(),1);
  else assert.equal(await p.getByRole('dialog').count(),0);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),0);
  check('late installment details cannot revive confirmation after '+scenario);
 }
 for(const flags of [{detailMissing:true},{detailExpired:true},{detailStatus:'COMPLETED'},{detailError:500},{detailError:401},{detailError:403}]) {
  await render({view:'activeOperations',language:'en',activeDetails:true,...flags},390);
  await p.locator('main tr').filter({hasText:'detail-a'}).getByRole('button').click();
  await p.locator('main [role=alert]').first().waitFor();assert.equal(await p.getByRole('dialog').count(),0);
  check('installment detail admission rejects '+JSON.stringify(flags));
 }
 for(const action of ['confirm','cancel','cancelConfirm']) {
  await render({view:'activeOperations',language:'en',commandHang:true},390);
  const row=p.locator('main tr').filter({hasText:action==='cancel'?'0000000000':'0000000004'});await row.waitFor();
  if(action==='cancel')await row.getByRole('button').last().click();
  else {await row.getByRole('button').click();await p.getByRole('dialog').getByRole('button').nth(action==='confirm'?1:0).click();}
  await p.locator('main [role=alert]').first().waitFor({timeout:48000});
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1);
  if(action!=='cancel') {await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'detached'});}
  assert.equal(await row.getByRole('button').first().isDisabled(),true);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1);
  check('active '+action+' actual deadline allows safe exit and prevents replay');
 }
};
