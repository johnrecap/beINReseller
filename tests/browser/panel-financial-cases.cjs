/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic report acceptance. */
const assert=require('node:assert/strict');
module.exports=async function financialCases({p,render,check}) {
 const views=['balanceReport','creditReport','pointsReport','spendReport'];
 for(const view of views)for(const language of ['ar','en','bn'])for(const width of [360,390,768,1280,1440]) {
  await render({view,language,financialReports:true,reactiveNavigation:true},width);
  await p.waitForFunction(()=>[...document.querySelectorAll('main tbody')].some(el=>el.innerText.includes('synthetic')));
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' page overflow '+language+' '+width);
  assert.equal(await p.locator('main table:not([data-panel-table])').count(),0);
  const text=await p.locator('main [data-panel-report-results]').innerText();
  assert.ok(view==='pointsReport'?text.includes('20'):text.includes('51.00'),'server aggregate must survive rendering');
  check(view+' positive aggregates, all columns and internal scroll '+language+' '+width);
 }
 for(const view of views)for(const mode of ['empty','many']) {
  await render({view,language:'en',financialReports:true,financialEmpty:mode==='empty',financialMany:mode==='many'},390);
  await p.locator('main [data-panel-report-results]').waitFor({state:'attached'});
  assert.equal(await p.locator('main [role=alert]').count(),0);
  if(mode==='many') {
   const lengths=await p.locator('main tbody').evaluateAll(nodes=>nodes.map(node=>node.rows.length));
   assert.ok(lengths.includes(25),'all 25 detail rows remain available');
  } else assert.ok(!(await p.locator('main [data-panel-report-results]').innerText()).includes('synthetic-recipient'));
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' '+mode+' overflow');
  check(view+' successful '+mode+' data is distinct from failure');
 }
 for(const view of views)for(const status of [401,403,500]) {
  await render({view,language:'en',financialReports:true,reactiveNavigation:true},390);
  await p.locator('main [data-panel-report-results]').waitFor({state:'attached'});
  await p.evaluate(status=>window.audit.opsError=status,status);
  if(view==='spendReport')await p.getByRole('button',{name:'Refresh',exact:true}).click();
  else if(view==='balanceReport')await p.locator('main form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  else await p.getByRole('button',{name:'Refresh',exact:true}).click();
  await p.locator('main [role=alert]').waitFor();
  assert.equal(await p.locator('main [data-panel-report-results]').count(),0);
  assert.equal(await p.locator('main table:visible').count(),0);
  check(view+' post-success HTTP '+status+' removes old totals and rows');
 }
 for(const view of ['balanceReport','creditReport','pointsReport']) {
  await render({view,language:'en',financialReports:true,reactiveNavigation:true},390);
  await p.locator('main [data-panel-report-results]').waitFor({state:'attached'});
  if(view==='balanceReport')await p.locator('main select').first().selectOption('USER');
  const field=p.getByPlaceholder('Username or email',{exact:true}).first();
  await field.fill('name+tag&test');
  await p.locator('main form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('name%2Btag%26test')));
  const query=await p.evaluate(()=>window.requests.filter(r=>r.url.includes('name%2Btag%26test')).at(-1).url);
  assert.ok([...new URL(query,'http://audit.invalid').searchParams.values()].includes('name+tag&test'));
  check(view+' submitted filter reaches the report API without splitting plus or ampersand');
 }
 await render({view:'pointsReport',language:'en',financialReports:true},390);
 await p.getByRole('button',{name:/synthetic-owner/}).first().click();
 await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('/points-analysis/owners/synthetic-owner')));
 await p.waitForFunction(()=>document.querySelectorAll('main tbody').length===2);
 check('points owner timeline keeps detail columns alongside the aggregate report');
};
