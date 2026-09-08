/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser harness. */
const assert = require('node:assert/strict');
module.exports = async function reportCases({p,render,check}) {
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
};
