/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser harness. */
const assert = require('node:assert/strict');
module.exports = async function operationsCases({p, render, check}) {
 const views = ['logs','agents','adminCredit','requestCredit','agentDashboard','permissions'];
 for (const language of ['ar','en','bn']) for (const width of [360,390,768,1280,1440]) for (const view of views) {
  await render({view, language}, width);
  await p.locator('main table tbody tr').first().waitFor();
  await p.waitForFunction(() => [...document.querySelectorAll('main table tbody')].some(el => el.innerText.includes('synthetic') || el.innerText.includes('SYNTHETIC') || el.innerText.includes('Synthetic')));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), view+' overflow '+language+' '+width);
  assert.equal(await p.locator('main table:not([data-panel-table])').count(), 0);
  check(view+' populated table bounds '+language+' '+width);
 }
 for (const view of views) for (const status of [401,403,500]) {
  await render({view, language:'en'},390);
  await p.waitForFunction(() => [...document.querySelectorAll('main table tbody')].some(el => /synthetic/i.test(el.innerText)));
  await p.evaluate(status => window.audit.opsError = status, status);
  await p.getByRole('button',{name:await p.evaluate(()=>window.qaText.common.refresh),exact:true}).first().click();
  await p.locator('main [role=alert]').first().waitFor();
  assert.equal(await p.locator('main table:visible').count(),0,view+' stale data after '+status);
  check(view+' clears existing data after HTTP '+status);
 }
 await render({view:'adminCredit',language:'en'},390);
 await p.getByText('SYNTHETIC-1',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Next',exact:true}).click();
 await p.getByText('SYNTHETIC-2',{exact:true}).waitFor();
 await p.locator('main input').fill('name+tag&test');
 await p.getByText('SYNTHETIC-name+tag&test',{exact:true}).waitFor();
 const latest = await p.evaluate(() => window.requests.filter(r=>r.url.startsWith('/api/admin/credit-requests?')).at(-1).url);
 const query = new URL(latest,'http://audit.invalid').searchParams;
 assert.equal(query.get('page'),'1');assert.equal(query.get('search'),'name+tag&test');
 await p.getByRole('button',{name:'Next',exact:true}).click();
 await p.waitForFunction(() => window.requests.filter(r=>r.url.includes('/api/admin/credit-requests?')).at(-1).url.includes('page=2'));
 await p.evaluate(()=>window.audit.clampCredit=true);
 await p.getByRole('button',{name:'Refresh',exact:true}).click();
 await p.waitForFunction(() => window.requests.filter(r=>r.url.includes('/api/admin/credit-requests?')).at(-1).url.includes('page=1'));
 check('admin credit pagination, encoded search, reset and disappearing last page');
 for (const view of ['logs','adminCredit']) {
  await render({view,language:'en',opsRace:true},390);
  await p.locator('main table tbody tr').first().waitFor();
  await p.locator('main input').first().fill('old');
  await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('search=old')));
  await p.locator('main input').first().fill('latest+&');
  await p.waitForFunction(()=>[...document.querySelectorAll('main tbody')].some(el=>el.innerText.includes('latest+&')));
  await p.waitForTimeout(900);
  assert.ok(!(await p.locator('main tbody').innerText()).includes('old'));
  check(view+' old response cannot overwrite latest search');
 }
 await render({view:'permissions',language:'en'},390);
 await p.locator('main table').getByText('Synthetic permission',{exact:true}).waitFor();
 await p.waitForTimeout(200);
 assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url==='/api/admin/permissions/catalog').length),1);
 check('permission catalog initializes without duplicate grouped request');
 await render({view:'adminCredit',language:'en',writeFailure:true,holdWrite:true},390);
 await p.getByText('SYNTHETIC-1',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Reject',exact:true}).click();
 const modal=p.getByRole('dialog');await modal.getByRole('textbox').fill('Synthetic retained note');
 await modal.getByRole('button').last().evaluate(el=>{el.click();el.click()});
 await p.waitForFunction(()=>!!window.releaseWrite);await p.keyboard.press('Escape');
 assert.equal(await modal.count(),1);
 await p.evaluate(()=>window.releaseWrite());await modal.getByRole('alert').waitFor();
 assert.equal(await modal.getByRole('textbox').inputValue(),'Synthetic retained note');
 assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1);
 check('credit decision retains rejected note inside modal and blocks duplicate submit/close');
};
