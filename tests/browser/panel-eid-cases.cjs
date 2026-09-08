/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic rewards only. */
const assert=require('node:assert/strict');
module.exports=async function eidCases({p,render,check}){
 const ready=async(config={},width=390)=>{await render({view:'eid',language:'en',...config},width);await p.getByRole('dialog').waitFor();return p.evaluate(()=>window.qaText.panelUi.eidPopup)};
 const claim=async labels=>{await p.getByRole('button',{name:labels.openButtonText,exact:true}).click();await p.getByText(labels.successTitle,{exact:true}).waitFor();};
 for(const language of ['ar','en','bn'])for(const width of [360,390,768,1280,1440]){
  await p.emulateMedia({reducedMotion:'reduce'});const labels=await ready({language,eidConfigured:true},width);const dialog=p.getByRole('dialog');
  await p.setViewportSize({width,height:420});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  assert.equal(await dialog.locator('h2:not(.sr-only)').innerText(),'Synthetic configured title');
  await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('.eid-fallback-envelope')).animationName==='none');
  await p.getByRole('button',{name:labels.laterButtonText,exact:true}).scrollIntoViewIfNeeded();
  await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert.equal(await p.evaluate(()=>sessionStorage.getItem('eid-reward-popup-hidden')),null);
  check('eid configured text, short dialog, reduced motion and Escape '+language+' '+width);
 }
 await p.emulateMedia({reducedMotion:'no-preference'});
 for(const language of ['ar','en','bn']){
  const labels=await ready({language,holdWrite:true,eidWriteError:400});
  await p.getByRole('button',{name:labels.openButtonText,exact:true}).evaluate(el=>{el.click();el.click()});
  await p.waitForFunction(()=>typeof window.releaseWrite==='function');await p.keyboard.press('Escape');assert.equal(await p.getByRole('dialog').count(),1);
  await p.evaluate(()=>window.releaseWrite());await p.getByRole('alert').waitFor();assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/claim')).length),1);
  assert.equal(await p.getByRole('button',{name:labels.openButtonText,exact:true}).count(),0,'claim error requires read-only status retry');
  const retry=await p.evaluate(()=>window.qaText.auth.tryAgain);await p.getByRole('button',{name:retry,exact:true}).click();
  await p.getByRole('button',{name:labels.openButtonText,exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/claim')).length),1);
  check('eid rejected single claim, busy Escape and read-only retry '+language);
 }
 for(const status of [400,500]){
  const labels=await ready();await claim(labels);
  await p.evaluate(status=>{window.audit.eidWriteError=status;window.audit.holdWrite=true},status);
  await p.getByRole('button',{name:labels.redeemButtonText,exact:true}).evaluate(el=>{el.click();el.click()});
  await p.waitForFunction(()=>typeof window.releaseWrite==='function');await p.keyboard.press('Escape');assert.equal(await p.getByRole('dialog').count(),1);
  await p.evaluate(()=>window.releaseWrite());await p.getByRole('alert').waitFor();
  const posts=await p.evaluate(()=>window.requests.filter(r=>r.url.endsWith('/redeem')));assert.equal(posts.length,1);assert.deepEqual(posts[0].body,{points:90});
  assert.equal(await p.getByRole('button',{name:labels.redeemButtonText,exact:true}).count(),status===400?1:0);
  if(status===500){const retry=await p.evaluate(()=>window.qaText.auth.tryAgain);await p.getByRole('button',{name:retry,exact:true}).click();await p.getByText(labels.alreadyClaimedText,{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:labels.redeemButtonText,exact:true}).count(),0);}
  check('eid redemption HTTP '+status+' retains rejection or reconciles unknown without duplicate');
 }
 const labels=await ready();await claim(labels);await p.getByRole('button',{name:labels.redeemButtonText,exact:true}).click();await p.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(await p.evaluate(()=>sessionStorage.getItem('eid-reward-popup-hidden')),'redeemed');check('eid synthetic claim/redeem success and remembered close');
 const noConversion=await ready({eidNoConversion:true});await claim(noConversion);assert.equal(await p.getByRole('button',{name:noConversion.redeemButtonText,exact:true}).count(),0);await p.getByRole('button',{name:noConversion.acknowledge,exact:true}).click();await p.getByRole('dialog').waitFor({state:'detached'});check('eid points-only acknowledgment sends no redemption');
 for(const status of [401,403,500]){
  await render({view:'eid',language:'en',eidReadError:status},390);await p.waitForTimeout(300);
  if(status<500)assert.equal(await p.getByRole('dialog').count(),0);
  else{await p.getByRole('alert').waitFor();await p.evaluate(()=>delete window.audit.eidReadError);await p.getByRole('alert').getByRole('button').click();await p.getByRole('button',{name:labels.openButtonText,exact:true}).waitFor();}
  check('eid initial status HTTP '+status+' does not expose an actionable stale reward');
 }
 await render({view:'eid',language:'en',eidRemembered:true},390);await p.waitForTimeout(300);assert.equal(await p.getByRole('dialog').count(),0);check('eid respects remembered dismissal');
};
