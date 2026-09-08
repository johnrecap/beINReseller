/* eslint-disable @typescript-eslint/no-require-imports -- Intercepted HTTP/clipboard/window fixture only. */
const assert=require('node:assert/strict');
module.exports=async function operationDialogs({p,render,check}) {
 const actions={APPROVE:'approve',REJECT:'reject',CANCEL:'cancel',ESCALATE:'escalate',RESOLVE:'resolveEscalation',PAYMENT:'payment'};
 async function open(action,language,width,extra={}) {
  await render({view:action==='PAYMENT'?'agentDashboard':'adminCredit',role:action==='PAYMENT'?'AGENT':'ADMIN',language,escalated:action==='RESOLVE',manualHandoff:true,...extra},width);
  await p.getByRole('button',{name:await p.evaluate(key=>key==='cancel'?window.qaText.common.cancel:window.qaText.panelUi.operationalCopy[key],actions[action]),exact:true}).first().click();
  return p.getByRole('dialog');
 }
 for(const action of Object.keys(actions))for(const language of ['ar','en','bn'])for(const width of [360,390,768,1280,1440]) {
  const modal=await open(action,language,width);await p.setViewportSize({width,height:640});
  await p.waitForFunction(()=>{const el=document.querySelector('[role=dialog]');if(!el)return false;const r=el.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1;});
  assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1),action+' overflow');
  await modal.getByRole('button').last().scrollIntoViewIfNeeded();await p.keyboard.press('Escape');await modal.waitFor({state:'detached'});
  check(action+' operation dialog bounds, scroll and Escape '+language+' '+width);
 }
 for(const action of Object.keys(actions))for(const language of ['ar','en','bn'])for(const success of [false,true]) {
  const modal=await open(action,language,390,{writeFailure:!success,holdWrite:!success,writeSuccess:success});
  const note=action==='PAYMENT'?modal.locator('input:not([type])'):modal.locator('textarea');
  await note.fill('Synthetic retained operation note');
  if(action==='PAYMENT')await modal.locator('input[type=number]').fill('10');
  await modal.getByRole('button').last().evaluate(el=>{el.click();el.click()});
  if(success) {
   if(action==='APPROVE') {
    await modal.locator('h3').filter({hasText:await p.evaluate(()=>window.qaText.panelUi.operationalCopy.whatsappConfirmation)}).waitFor();
    assert.equal(await modal.locator('textarea').inputValue(),'Synthetic message only');
    assert.deepEqual(await p.evaluate(()=>window.copied),['Synthetic message only']);
    assert.equal(await p.evaluate(()=>window.opened[0].location.href),'https://example.invalid/group');
    await p.keyboard.press('Escape');
   }
   await modal.waitFor({state:'detached'});
  } else {
   await p.waitForFunction(()=>!!window.releaseWrite);await p.keyboard.press('Escape');assert.equal(await modal.count(),1);
   await p.evaluate(()=>window.releaseWrite());await modal.getByRole('alert').waitFor();
   assert.equal(await note.inputValue(),'Synthetic retained operation note');
  }
  const writes=await p.evaluate(()=>window.requests.filter(r=>r.method==='POST'));
  assert.equal(writes.length,1);
  assert.deepEqual(writes[0].body,action==='PAYMENT'?{amountUsd:'10',note:'Synthetic retained operation note'}:['ESCALATE','RESOLVE'].includes(action)?{action,note:'Synthetic retained operation note'}:{decision:action,note:'Synthetic retained operation note'});
  check(action+' '+(success?'successful':'rejected')+' operation submit once with preserved payload '+language);
 }
};
