/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic mounted-hook and consumer acceptance. */
const assert=require('node:assert/strict');
module.exports=async function commandCases({p,render,check}) {
 for(const dialogKind of ['edit','reset']) {
  await render({view:'dialogFocus',language:'en',dialogKind,holdWrite:true,writeFailure:true},390);
  await p.locator('#dialog-opener').click();const modal=p.getByRole('dialog');
  if(dialogKind==='edit')await modal.locator('[name=email]').fill('retained@example.invalid');
  else {await modal.locator('#reset-new-password').fill('Synthetic-Only-123!');await modal.locator('#reset-confirm-password').fill('Synthetic-Only-123!');}
  await modal.locator('button[type=submit]').click();await p.waitForFunction(()=>!!window.releaseWrite);
  await p.keyboard.press('Escape');await modal.waitFor({state:'detached'});
  await p.locator('#dialog-opener').click();await modal.waitFor();assert.equal(await modal.locator('button[type=submit]').isDisabled(),true);
  assert.equal(await modal.locator(dialogKind==='edit'?'[name=email]':'#reset-new-password').inputValue(),dialogKind==='edit'?'retained@example.invalid':'Synthetic-Only-123!');
  assert.equal(await p.evaluate(()=>Object.values(sessionStorage).some(value=>/Synthetic-Only-123|retained@example/.test(value))),false);
  await p.evaluate(()=>window.releaseWrite());await p.locator('[data-panel-command-status]').getByText(await p.evaluate(()=>window.qaText.panelUi.commandTracker.uncertain),{exact:false}).waitFor();
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>['PATCH','POST'].includes(r.method)).length),1);
  assert.equal(await p.evaluate(()=>!!window.saved),false);
  check('037 '+dialogKind+' hides pending request, restores draft and prevents replay');
 }
 await render({view:'command',language:'en',ownedCommands:true,holdWrite:true,writeFailure:true},1280);
 await p.waitForFunction(()=>!!window.ownedCommands?.state);
 await p.evaluate(()=>{window.pendingOwned=window.ownedCommands.request({action:'synthetic',resources:['user/a'],url:'/api/synthetic-command',init:{method:'POST',body:'{}'}}).catch(()=>null)});
 await p.waitForFunction(()=>typeof window.releaseWrite==='function');
 await p.getByRole('button',{name:'Synthetic route switch',exact:true}).click();
 assert.equal(await p.locator('[data-owned-commands]').count(),0);
 assert.equal(await p.locator('[data-panel-command-status]').count(),1);
 await p.evaluate(()=>window.releaseWrite());
 await p.evaluate(()=>window.pendingOwned);
 await p.getByRole('button',{name:'Synthetic route switch',exact:true}).click();
 await p.locator('[data-owned-commands]').getByText('user/a: UNCERTAIN',{exact:true}).waitFor();
 assert.equal(await p.evaluate(async()=>{try{await window.ownedCommands.request({action:'synthetic',resources:['user/a'],url:'/api/synthetic-command',init:{method:'POST',body:'{}'}});return false}catch{return true}}),true);
 assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url==='/api/synthetic-command').length),1);
 check('037 owner survives child navigation and retains uncertain resource without duplicate dispatch');
 for(const language of ['ar','en','bn'])for(const managerBalance of [false,true]) {
 await render({view:'dialogFocus',language,managerBalance,holdWrite:true,writeFailure:true},390);
 await p.locator('#dialog-opener').click();
 await p.getByRole('dialog').locator('input[name=amount]').fill('1');
 await p.getByRole('dialog').locator('button[type=submit]').click();
 await p.waitForFunction(()=>typeof window.releaseWrite==='function');
 await p.keyboard.press('Escape');
 await p.getByRole('dialog').waitFor({state:'detached'});
 await p.evaluate(()=>window.releaseWrite());
 await p.locator('[data-panel-command-status]').waitFor();
 await p.locator('#dialog-opener').click();
 assert.equal(await p.getByRole('dialog').locator('button[type=submit]').isDisabled(),true);
 assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='PATCH').length),1);
 check('037 hidden balance write remains owned and cannot be repeated after remount '+language+' manager='+managerBalance);
 }
 if(process.env.PANEL_QA_FOCUS==='037')return;
 const send=async key=>p.evaluate(async key=>{try{const r=await window.commandHarness.request('/api/synthetic-command',{method:'POST',body:JSON.stringify({value:1})},key);return r.status}catch{return 'uncertain'}},key);
 for(const language of ['ar','en','bn']) {
  await render({view:'command',language,writeFailure:true,writeStatus:500},390);
  await p.waitForFunction(()=>!!window.commandHarness);
  assert.equal(await send('a'),500);
  await p.waitForFunction(()=>window.commandHarness.isUnconfirmed('a'));
  await p.evaluate(()=>window.commandHarness.switchId('b'));
  await p.waitForFunction(()=>document.querySelector('[data-command-uncertain]').dataset.commandUncertain==='false');
  await p.evaluate(()=>{window.audit.writeFailure=false;window.audit.writeSuccess=true});
  assert.equal(await send('b'),200);
  await p.evaluate(()=>window.commandHarness.switchId('a'));
  await p.waitForFunction(()=>document.querySelector('[data-command-uncertain]').dataset.commandUncertain==='true');
  assert.equal(await send('a'),'uncertain');
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url==='/api/synthetic-command').length),2);
  assert.equal(await p.evaluate(()=>window.commandHarness.reconcile(['a'],async()=>false)),false);
  assert.equal(await p.evaluate(()=>window.commandHarness.isUnconfirmed('a')),true);
  assert.equal(await p.evaluate(()=>window.commandHarness.reconcile(['a'],async()=>true)),true);
  assert.equal(await send('a'),200);
  check('command identity retention, unrelated action and explicit review '+language);
 }
 for(const status of [400,401,403,409]) {
  await render({view:'command',language:'en',writeFailure:true,writeStatus:status},390);
  await p.waitForFunction(()=>!!window.commandHarness);assert.equal(await send('a'),status);
  assert.equal(await p.evaluate(()=>window.commandHarness.isUnconfirmed('a')),false);
  check('definitive HTTP '+status+' is not an uncertain command');
 }
 await render({view:'command',language:'en',commandBadBody:true},390);
 await p.waitForFunction(()=>!!window.commandHarness);assert.equal(await send('a'),'uncertain');
 assert.equal(await p.evaluate(()=>window.commandHarness.isUnconfirmed('a')),true);
 check('malformed successful response cannot become false success');
 await render({view:'command',language:'en',commandHang:true},390);
 await p.waitForFunction(()=>!!window.commandHarness);
 const started=Date.now();assert.equal(await send('a'),'uncertain');assert.ok(Date.now()-started>=44000);
 assert.equal(await send('a'),'uncertain');assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url==='/api/synthetic-command').length),1);
 check('actual command deadline releases UI without replay');
 await render({view:'command',language:'en',commandBodyHang:true},390);
 await p.waitForFunction(()=>!!window.commandHarness);
 const bodyStarted=Date.now();assert.equal(await send('a'),'uncertain');assert.ok(Date.now()-bodyStarted>=44000);
 assert.equal(await send('a'),'uncertain');assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url==='/api/synthetic-command').length),1);
 check('actual response-body deadline retains uncertainty without replay');
 for(const language of ['ar','en','bn']) {
  await render({view:'permissions',language,writeFailure:true,writeStatus:500},390);
  const row=p.locator('main tbody tr').first();await row.waitFor();
  await row.getByRole('button',{name:await p.evaluate(()=>window.qaText.panelUi.operationalCopy.allow),exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('main tbody button')?.disabled&&document.querySelector('main [role=status]'));
  // The separate global action remains enabled after the role request settles.
  await p.waitForFunction(()=>!document.querySelector('main fieldset').disabled);
  assert.equal(await row.getByRole('button',{name:await p.evaluate(()=>window.qaText.panelUi.operationalCopy.allow),exact:true}).isDisabled(),true);
  assert.equal(await p.getByRole('button',{name:await p.evaluate(()=>window.qaText.common.save),exact:true}).isDisabled(),false);
  await p.getByRole('button',{name:await p.evaluate(()=>window.qaText.panelUi.reviewCurrentValues)}).click();
  await p.waitForFunction(()=>!document.querySelector('main [role=status]'));
  assert.equal(await row.getByRole('button',{name:await p.evaluate(()=>window.qaText.panelUi.operationalCopy.allow),exact:true}).isDisabled(),false);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='PATCH').length),1);
  check('permissions scoped failure and read-only value review '+language);
 }
};
