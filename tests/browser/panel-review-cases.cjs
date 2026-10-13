/* eslint-disable @typescript-eslint/no-require-imports -- HTTP/identity fixture only. */
const assert=require('node:assert/strict');
module.exports=async function reviewCases({p,render,check}) {
 p.on('pageerror',error=>console.error('REVIEW PAGE ERROR',error.message));
 const ready=async(config={},width=390)=>{
  await render({view:'review',language:'en',...config},width);
  // audit.invalid is an intercepted HTTP origin; production uses a secure context.
  await p.evaluate(()=>{if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-'+String(window.reviewUuid=(window.reviewUuid||0)+1).padStart(12,'0')})});
  await p.getByText('Synthetic review',{exact:true}).waitFor();return p.evaluate(()=>window.qaText.admin.financialReview);
 };
 const actionKeys=['followUpAction','refundAction','preMutationTitle','completeAction'];
 for(const language of ['ar','en','bn']) {
  await ready({language,reviewHold:true,reviewPages:true},360);
  const copy=await p.evaluate(()=>({hold:window.qaText.renewalHold,pagination:window.qaText.pagination}));
  await p.getByText(copy.hold.holdReasons.INTEGRITY_ISSUE,{exact:true}).waitFor();
  assert.ok((await p.locator('article').innerText()).includes(copy.hold.holdStages.PRE_PAYMENT));
  await p.getByRole('button',{name:copy.pagination.next,exact:true}).click();
  await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('cursor=synthetic-next')));
  await p.getByRole('button',{name:copy.pagination.previous,exact:true}).click();
  await p.waitForFunction(()=>window.requests.filter(r=>r.url.startsWith('/api/admin/financial-review?')&&!r.url.includes('cursor=')).length>=2);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  check('review actionable hold and cursor navigation '+language);
 }
 for(const language of ['ar','en','bn'])for(const width of [360,390,768,1280,1440]) {
  const labels=await ready({language},width);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'review page overflow '+language+' '+width);
  for(const key of actionKeys) {
   const opener=p.locator('article').getByRole('button',{name:labels[key],exact:true});await opener.click();
   const modal=p.getByRole('dialog');await modal.waitFor().catch(async error=>{console.error('REVIEW MODAL',language,width,key,await p.locator('main').innerText());throw error});
   await p.setViewportSize({width,height:420});
   assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'review dialog horizontal overflow');
   await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));
   await p.keyboard.press('Escape');await modal.waitFor({state:'detached'});
   await p.waitForFunction(el=>el===document.activeElement,await opener.elementHandle());
   await p.setViewportSize({width,height:800});
   check('review '+key+' dialog '+language+' '+width);
  }
 }
 for(const status of [401,403,500]) {
  await ready();await p.evaluate(status=>window.audit.reviewError=status,status);
  await p.getByRole('button',{name:await p.evaluate(()=>window.qaText.panelUi.reviewCopy.refreshList),exact:true}).click();await p.getByRole('alert').waitFor();
  assert.equal(await p.locator('article').count(),0);
  if(status!==401){await p.evaluate(()=>delete window.audit.reviewError);await p.getByRole('alert').getByRole('button').click();await p.getByText('Synthetic review',{exact:true}).waitFor();}
  check('review clears inaccessible/stale data HTTP '+status);
 }
 for(const status of [409,500]) {
  const labels=await ready({writeFailure:true,writeStatus:status,holdWrite:true});
  await p.getByRole('button',{name:labels.followUpAction,exact:true}).click();const modal=p.getByRole('dialog');
  const note='Synthetic retained decision note';await modal.locator('textarea').fill(note);
  await modal.getByRole('button',{name:labels.followUpConfirm,exact:true}).evaluate(el=>{el.click();el.click()});
  await p.waitForFunction(()=>typeof window.releaseWrite==='function');await p.keyboard.press('Escape');assert.equal(await modal.count(),1);
  await p.evaluate(()=>window.releaseWrite());await modal.getByRole('alert').waitFor();
  assert.equal(await modal.locator('textarea').inputValue(),note);
  const requests=await p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/decision')));
  assert.equal(requests.length,1);assert.equal(requests[0].body.action,'KEEP_UNDER_REVIEW');assert.equal(requests[0].body.note,note);assert.ok(requests[0].body.decisionKey);
  await modal.getByRole('button',{name:labels.followUpConfirm,exact:true}).click();await p.waitForFunction(()=>window.requests.filter(r=>r.url.endsWith('/decision')).length===2);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/decision'))[1].body.decisionKey),requests[0].body.decisionKey);
  await p.evaluate(()=>window.releaseWrite());await modal.getByRole('alert').waitFor();
  check('review single write, retained input and stable retry decision key HTTP '+status);
 }
 const labels=await ready({writeSuccess:true});const opener=p.getByRole('button',{name:labels.followUpAction,exact:true});await opener.click();
 await p.getByRole('dialog').locator('textarea').fill('Synthetic follow-up');await p.getByRole('dialog').getByRole('button',{name:labels.followUpConfirm,exact:true}).click();
 await p.getByRole('dialog').waitFor({state:'detached'});await p.waitForFunction(()=>document.activeElement?.closest('article'));
 check('review synthetic success closes and restores focus');
 for(const language of ['ar','en','bn'])for(const legacy of [false,true])for(const success of [false,true]){
  const copy=await ready({language,reviewLegacy:legacy,writeFailure:!success,holdWrite:!success,writeSuccess:success});
  await p.getByRole('button',{name:copy.completeAction,exact:true}).click();const modal=p.getByRole('dialog');
  const submit=modal.getByRole('button',{name:copy.manualDecisionConfirm,exact:true});assert.equal(await submit.isDisabled(),true);
  await modal.getByPlaceholder(copy.invoiceNoPlaceholder,{exact:true}).fill('SYNTHETIC-INVOICE');
  await modal.locator('input[type=number]').fill('90.00');await modal.locator('input[type=datetime-local]').fill('2026-09-08T10:00');
  await modal.locator('select').selectOption('SBS_SOLD_REPORT_AND_ACTIVE_CONTRACT');
  await modal.getByPlaceholder(copy.evidenceNotePlaceholder,{exact:true}).fill('Synthetic UI fixture only; not provider proof');
  await modal.getByPlaceholder(copy.decisionNotePlaceholder,{exact:true}).fill('Synthetic retained review note');
  if(legacy){assert.equal(await submit.isDisabled(),true);await modal.getByLabel(copy.sourceReference,{exact:true}).fill('synthetic-reference');}
  assert.equal(await modal.getByLabel(copy.beinAccountId,{exact:true}).getAttribute('readonly'),'');
  await submit.evaluate(el=>{el.click();el.click()});
  if(success)await modal.waitFor({state:'detached'});
  else{await p.waitForFunction(()=>typeof window.releaseWrite==='function');await p.keyboard.press('Escape');assert.equal(await modal.count(),1);await p.evaluate(()=>window.releaseWrite());await modal.getByRole('alert').waitFor();assert.equal(await modal.getByPlaceholder(copy.invoiceNoPlaceholder,{exact:true}).inputValue(),'SYNTHETIC-INVOICE');}
  const writes=await p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/decision')));assert.equal(writes.length,1);
  const body=writes[0].body;assert.equal(body.action,'BEIN_EXECUTED_NO_REFUND');assert.ok(body.decisionKey);assert.equal(body.manualFulfillmentEvidence.invoiceNo,'SYNTHETIC-INVOICE');assert.equal(body.manualFulfillmentEvidence.beinAccountId,'synthetic-bein');assert.equal(body.manualFulfillmentEvidence.cardNumberSnapshot,'0000000000');assert.equal(body.manualFulfillmentEvidence.providerAmount,'90.00');assert.equal(body.manualFulfillmentEvidence.currency,'USD');assert.equal(body.sourceReference,legacy?'synthetic-reference':undefined);
  check('review manual evidence '+(legacy?'legacy':'current')+' '+(success?'success':'rejection')+' '+language);
 }
 for(const language of ['ar','en','bn'])for(const width of [360,1280]) {
  await ready({language},width);
  const allowed=await p.evaluate(()=>window.qaText.admin.financialReview);
  for(const key of actionKeys)await p.locator('article').getByRole('button',{name:allowed[key],exact:true}).waitFor();
  assert.equal(await p.locator('article').getByRole('button',{name:/archive.*unlock|أرشفة المحاولات وفك/}).count(),0);
  assert.equal(await p.locator('main').innerText().then(t=>t.includes('undefined')),false);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.equal(await p.evaluate(()=>window.requests.some(r=>r.url.includes('card-release'))),false);
  if(language==='ar')await p.screenshot({path:require('node:path').join(process.env.PANEL_QA_OUTPUT,'review-no-unlock-ar-'+width+'.png'),fullPage:false});
  check('review financial actions remain without card-unlock controls '+language+' '+width);
 }
 {
  const copy=await ready({reviewArchived:true});await p.getByRole('button',{name:copy.archivedTab,exact:true}).click();
  await p.getByText('Synthetic archive reason',{exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>window.requests.some(r=>r.url.includes('card-release'))),false);
  check('admin archive retains actor reason and read-only details');
 }
 await ready({reviewRace:true});const search=p.locator('main input');await search.fill('old');await search.fill('name+tag&test');
 await p.getByText('name+tag&test',{exact:true}).waitFor();await p.waitForTimeout(800);
 assert.equal(await p.getByText('old',{exact:true}).count(),0);
 assert.ok(await p.evaluate(()=>window.requests.some(r=>r.url.includes('q=name%2Btag%26test'))));check('review encoded search and late response ownership');
};
