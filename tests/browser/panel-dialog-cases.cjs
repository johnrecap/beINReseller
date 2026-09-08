/* eslint-disable @typescript-eslint/no-require-imports -- Isolated form acceptance. */
const assert=require('node:assert/strict');
module.exports=async function dialogCases({p,render,check}) {
 for(const view of ['creditControl','transferAgent','edit','resetPassword','ownership','createManager']) for(const language of ['ar','en','bn']) for(const width of [360,390,768,1280,1440]) {
  await render({view,language,role:view==='createManager'?'MANAGER':'ADMIN'},width);await p.setViewportSize({width,height:640});
  if(view==='createManager')await p.locator('main button').first().click();
  const modal=p.getByRole('dialog');await modal.waitFor();
  if(view==='creditControl')await modal.getByText('Synthetic retained debt entry',{exact:true}).waitFor();
  if(view==='transferAgent')await modal.locator('button[type=submit]').waitFor();
  await p.waitForFunction(()=>{const el=document.querySelector('[role=dialog]'),r=el.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1});
  assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1),view+' modal overflow '+language+' '+width);
  await modal.locator('button[type=submit]').first().scrollIntoViewIfNeeded();
  await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));
  check(view+' short dialog, scroll and focus '+language+' '+width);
 }
 for(const outcome of ['rejected','success','conflict']) for(const language of ['ar','en','bn']) for(const scenario of ['creditLimit','creditPayment','transferAgent','edit','resetAdmin','resetManager','resetAgent','ownership','createManager']) {
  if(outcome==='conflict'&&!['transferAgent','ownership'].includes(scenario))continue;
  const view=scenario.startsWith('credit')?'creditControl':scenario.startsWith('reset')?'resetPassword':scenario;
  const resetScope=scenario.startsWith('reset')?scenario.slice(5).toLowerCase():'admin';
  await render({view,language,role:view==='createManager'?'MANAGER':resetScope.toUpperCase(),resetScope,writeFailure:outcome!=='success',writeSuccess:outcome==='success',writeStatus:outcome==='conflict'?409:500,holdWrite:true},390);
  if(view==='createManager')await p.locator('main button').first().click();
  const modal=p.getByRole('dialog');await modal.waitFor();
  if(view==='creditControl')await modal.getByText('Synthetic retained debt entry',{exact:true}).waitFor();
  if(view==='transferAgent')await p.waitForFunction(()=>!document.querySelector('[role=dialog] button[type=submit]').disabled);
  let field,form=modal.locator('form').first(),value;
  if(scenario==='creditLimit'){field=form.locator('input');value='900';}
  if(scenario==='creditPayment'){form=modal.locator('form').nth(1);field=form.locator('[name=amountUsd]');value='10';await form.locator('[name=note]').fill('Synthetic payment note');}
  if(view==='transferAgent'){field=form.locator('input').first();value='Synthetic retained group';}
  if(view==='edit'){field=form.locator('[name=email]');value='retained@example.invalid';}
  if(view==='ownership'){await form.locator('select').nth(1).selectOption('synthetic-new-owner');field=form.getByLabel(await p.evaluate(()=>window.qaText.common.transferReason));value='Synthetic ownership note';}
  if(view==='createManager'){field=form.locator('[name=username]');value='synthetic';await form.locator('[name=email]').fill('synthetic@deshpanel.com');await form.locator('[name=password]').fill('Synthetic-Only-123!');await p.waitForFunction(()=>!document.querySelector('[role=dialog] button[type=submit]').disabled);}
  if(view==='resetPassword'){field=form.locator('#reset-new-password');value='Synthetic-Only-123!';await form.locator('#reset-confirm-password').fill(value);}
  await field.fill(value);
  await form.evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  if(outcome==='success') {
   if(view==='createManager')await modal.waitFor({state:'detached'});
   else await p.waitForFunction(()=>window.saved===true);
   const writes=await p.evaluate(()=>window.requests.filter(r=>['PATCH','POST'].includes(r.method)));
   assert.equal(writes.length,1);
   if(scenario==='creditLimit')assert.deepEqual(writes[0].body,{creditDebtLimitUsd:'900'});
   if(scenario==='creditPayment'){assert.deepEqual(writes[0].body,{amountUsd:'10',note:'Synthetic payment note'});await p.waitForFunction(()=>document.querySelector('[name=amountUsd]')?.value==='');}
   if(view==='transferAgent'){assert.equal(writes[0].body.expectedOwnershipToken,'synthetic-token');assert.equal(writes[0].body.sourceGroup,value);assert.ok(!('whatsappGroupUrl' in writes[0].body));}
   if(view==='ownership'){assert.equal(writes[0].body.expectedOwnershipToken,'synthetic-token');assert.equal(writes[0].body.reason,value);assert.equal(writes[0].body.targetOwnerId,'synthetic-new-owner');}
   if(view==='edit')assert.deepEqual(writes[0].body,{email:value,isActive:true});
   if(view==='resetPassword'){assert.deepEqual(writes[0].body,{newPassword:value});assert.equal(await modal.locator('#reset-new-password').count(),0);}
   if(view==='createManager')assert.deepEqual(writes[0].body,{username:'synthetic',email:'synthetic@deshpanel.com',password:'Synthetic-Only-123!',balance:0});
   if(['edit','ownership','transferAgent'].includes(view))assert.equal(await p.evaluate(()=>window.panelClosed),1);
   check(scenario+' successful save preserves API body and completes once '+language);continue;
  }
  await p.waitForFunction(()=>!!window.releaseWrite);await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(()=>window.panelClosed||0),0,'cannot close a pending mutation');
  assert.equal(await form.locator('button[type=submit]').isDisabled(),true,'busy feedback must persist until the admitted request finishes');
  await p.evaluate(()=>window.releaseWrite());await modal.getByRole('alert').waitFor();
  assert.equal(await field.inputValue(),value);assert.equal(await p.evaluate(()=>!!window.saved),false);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>['PATCH','POST'].includes(r.method)).length),1);
  if(view==='resetPassword')assert.ok(await p.evaluate(scope=>window.requests.some(r=>r.url==='/api/'+scope+'/users/test/reset-password'),resetScope));
  if(outcome==='conflict') {
   assert.equal(await form.locator('button[type=submit]').isDisabled(),true);
   await form.evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1,'ownership conflict must not retry');
   await modal.getByRole('button',{name:await p.evaluate(()=>window.qaText.common.refreshAndReconfirm)}).click();
   assert.equal(await p.evaluate(()=>window.panelClosed),1);assert.equal(await p.evaluate(()=>window.saved),true);
   check(view+' ownership conflict requires fresh confirmation '+language);continue;
  }
  await p.keyboard.press('Escape');
  if(view==='createManager')await modal.waitFor({state:'detached'});
  else assert.equal(await p.evaluate(()=>window.panelClosed),1);
  check(scenario+' rejects duplicates, retains rejected input and guards close '+language);
 }
 for(const view of ['creditControl','createManager','transferAgent','ownership'])for(const status of [401,403,500]) {
  await render({view,language:'en',role:view==='createManager'?'MANAGER':'ADMIN',opsError:status},390);
  if(view==='createManager')await p.locator('main button').first().click();
  const modal=p.getByRole('dialog');await modal.getByRole('alert').waitFor();
  if(view==='creditControl')assert.equal(await modal.locator('form').count(),0);
  else assert.equal(await modal.locator('button[type=submit]').isDisabled(),true);
  assert.ok(!(await modal.innerText()).includes('$0.00'),'failed credit read must not fabricate available balance');
  check(view+' initial HTTP '+status+' prevents uninformed financial form submission');
 }
 for(const view of ['creditControl','transferAgent','ownership']) {
  await render({view,language:'en',opsHang:true},390);
  const modal=p.getByRole('dialog');await modal.getByRole('alert').waitFor({timeout:18000});
  if(view==='creditControl')assert.equal(await modal.locator('form').count(),0);
  else assert.equal(await modal.locator('button[type=submit]').isDisabled(),true);
  await p.evaluate(()=>window.audit.opsHang=false);
  await modal.getByRole('alert').getByRole('button').click();
  if(view==='creditControl')await modal.getByText('Synthetic retained debt entry',{exact:true}).waitFor();
  if(view==='transferAgent')await p.waitForFunction(()=>!document.querySelector('[role=dialog] button[type=submit]').disabled);
  if(view==='ownership')await modal.locator('select').nth(1).selectOption('synthetic-new-owner');
  assert.equal(await modal.getByRole('alert').count(),0);
  check(view+' read deadline disables unsafe submission and retry restores current data');
 }
 await render({view:'creditControl',language:'en',creditRace:true},390);
 await p.waitForFunction(()=>!!window.releaseCreditRead);
 await p.evaluate(()=>window.switchCreditUser());
 await p.getByRole('dialog').getByText('Synthetic retained debt entry',{exact:true}).waitFor();
 await p.evaluate(()=>window.releaseCreditRead());
 await p.waitForTimeout(150);
 await p.getByRole('dialog').locator('form').first().locator('input').fill('800');
 await p.evaluate(()=>{window.audit.writeSuccess=true;document.querySelector('[role=dialog] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 await p.waitForFunction(()=>window.saved===true);
 assert.equal(await p.evaluate(()=>window.requests.find(r=>r.method==='PATCH').url),'/api/credit-debts/credit-b');
 check('credit control ignores superseded user reads and updates the current user only');
};
