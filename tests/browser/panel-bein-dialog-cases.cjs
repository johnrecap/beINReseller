/* eslint-disable @typescript-eslint/no-require-imports -- Isolated panel DTOs; no real accounts/commands. */
const assert=require('node:assert/strict');
module.exports=async function beinCases({p,render,check}){
 const ready=async(config={},width=390)=>{await render({view:'bein',language:'en',beinPositive:true,...config},width);await p.getByText('Synthetic beIN account',{exact:true}).waitFor();return p.evaluate(()=>window.qaText)};
 const open=async(action,config={},width=390)=>{const t=await ready(config,width);const opener=action==='add'?p.getByRole('button',{name:t.adminBeinAccounts.addAccount,exact:true}):p.getByTitle(action==='edit'?t.common.edit:t.panelUi.beinUnlock.action,{exact:true});await opener.click();await p.getByRole('dialog').waitFor();return{t,opener,modal:p.getByRole('dialog')}};
 // 037: a delayed account request must not hold the modal or the navigation hostage.
 {
  const {modal,t}=await open('add',{holdWrite:true,writeFailure:true,twoBein:true},1280);
  await modal.locator('#username').fill('synthetic-pending-account');
  await modal.locator('#password').fill('synthetic-only-password');
  await modal.locator('button[type=submit]').click();
  await p.waitForFunction(()=>typeof window.releaseWrite==='function');
  await p.keyboard.press('Escape');
  await modal.waitFor({state:'detached'});
  const link=p.locator('aside a').first();
  await link.evaluate(el=>el.addEventListener('click',event=>{event.preventDefault();window.pendingNavigationClicked=true},{once:true}));
  await link.click();
  assert.equal(await p.evaluate(()=>window.pendingNavigationClicked),true);
  assert.ok(await p.evaluate(()=>document.body.style.pointerEvents!=='none'));
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1);
  await p.evaluate(()=>{window.firstRelease=window.releaseWrite;window.releaseWrite=null});
  const secondRow=p.locator('tr').filter({hasText:'Synthetic second account'});
  await secondRow.getByTitle(t.adminBeinAccounts.actions.refreshBalance,{exact:true}).click();
  await p.waitForFunction(()=>typeof window.releaseWrite==='function');
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),2);
  await p.screenshot({path:'output/panel-ui/037-pending-navigation.png',fullPage:true});
  await p.evaluate(()=>{window.firstRelease();window.releaseWrite()});
  check('037 hidden pending account releases pointer and navigation without replay');
 }
 for(const language of ['ar','en','bn']) {
  const t=await ready({language,balancePending:true,twoBein:true},1280);
  const row=p.locator('tr').filter({hasText:'Synthetic beIN account'});
  const refresh=row.getByTitle(t.adminBeinAccounts.actions.refreshBalance,{exact:true});
  await refresh.click();await p.waitForFunction(()=>window.requests.some(r=>r.method==='GET'&&r.url.includes('/check-balance?')));
  assert.equal(await refresh.isDisabled(),true);
  await p.getByRole('button',{name:t.adminBeinAccounts.addAccount,exact:true}).click();
  await p.getByRole('dialog').waitFor();await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'detached'});
  await p.locator('tr').filter({hasText:'Synthetic second account'}).getByTitle(t.adminBeinAccounts.actions.refreshBalance,{exact:true}).click();
  await p.evaluate(()=>window.balanceState='COMPLETED');
  await row.getByText('222 USD',{exact:true}).waitFor();await p.waitForFunction(()=>[...document.querySelectorAll('tr button')].some(b=>b.title===window.qaText.adminBeinAccounts.actions.refreshBalance&&!b.disabled));
  await p.getByText('444 USD',{exact:true}).waitFor();
  const posts=await p.evaluate(()=>window.requests.filter(r=>r.method==='POST'&&r.url.includes('/check-balance')));
  assert.equal(posts.length,2);assert.ok(posts.every(r=>r.body.mode==='async'));
  check('037 async balance polls while independent controls remain usable '+language);
 }
 if(process.env.PANEL_QA_FOCUS==='037')return;
 for(const action of ['add','edit','unlock'])for(const language of ['ar','en','bn'])for(const width of [360,390,768,1280,1440]){
  const{modal,opener}=await open(action,{language},width);await p.setViewportSize({width,height:420});
  assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'beIN dialog overflow '+action+language+width);
  await modal.getByRole('button').last().scrollIntoViewIfNeeded();await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));
  await p.keyboard.press('Escape');await modal.waitFor({state:'detached'});await p.waitForFunction(el=>el===document.activeElement,await opener.elementHandle());
  check('beIN '+action+' short dialog, focus and direction '+language+' '+width);
 }
 for(const action of ['add','edit','unlock'])for(const language of ['ar','en','bn'])for(const success of [false,true]){
  const{modal,t,opener}=await open(action,{language,writeSuccess:success,writeFailure:!success,holdWrite:!success});
  if(action==='unlock')await modal.locator('#unlock-reason').fill('Synthetic retained unlock reason');
  else{
   await modal.locator(action==='edit'?'#edit-label':'#label').fill('Synthetic retained account label');
   if(action==='add'){await modal.locator('#username').fill('synthetic-new-bein');await modal.locator('#password').fill('synthetic-only-password');}
  }
  if(action==='unlock')await modal.getByRole('button',{name:t.panelUi.beinUnlock.action,exact:true}).evaluate(el=>{el.click();el.click()});
  else await modal.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  if(success){await modal.waitFor({state:'detached'});await p.waitForFunction(el=>el===document.activeElement,await opener.elementHandle());}
  else{await p.waitForFunction(()=>typeof window.releaseWrite==='function');await p.evaluate(()=>window.releaseWrite());await modal.getByRole('alert').waitFor();assert.equal(await modal.locator(action==='unlock'?'#unlock-reason':action==='edit'?'#edit-label':'#label').inputValue(),action==='unlock'?'Synthetic retained unlock reason':'Synthetic retained account label');await p.keyboard.press('Escape');await modal.waitFor({state:'detached'});}
  const writes=await p.evaluate(()=>window.requests.filter(r=>['POST','PUT'].includes(r.method)));assert.equal(writes.length,1);
  if(action==='unlock')assert.deepEqual(writes[0].body,{reason:'Synthetic retained unlock reason'});
  else{assert.equal(writes[0].body.label,'Synthetic retained account label');if(action==='edit')assert.equal(Object.hasOwn(writes[0].body,'totpSecret'),false);}
  check('beIN '+action+' single submit '+(success?'success/focus':'rejection/retention')+' '+language);
 }
 for(const status of [401,403,500]){
  await render({view:'bein',language:'en',beinPositive:true,beinReadError:status},390);await p.getByRole('alert').waitFor();assert.equal(await p.locator('main table').count(),0);check('beIN primary read HTTP '+status);
  const{modal}=await open('add',{beinProxyError:status});await modal.getByRole('alert').waitFor();assert.equal(await modal.locator('button[type=submit]').isDisabled(),true);check('beIN proxy choices failure prevents unverified save '+status);
 }
 for(const action of ['toggle','reset','delete','balance'])for(const success of [false,true]){
  const t=await ready({writeFailure:!success,holdWrite:!success,writeSuccess:success});
  const titles={toggle:t.adminBeinAccounts.actions.disable,reset:t.panelUi.reportCopy.resetActivate,delete:t.adminBeinAccounts.actions.delete,balance:t.adminBeinAccounts.actions.refreshBalance};
  const button=p.getByTitle(titles[action],{exact:true});await button.evaluate(el=>{el.click();el.click()});
  if(!success){await p.waitForFunction(()=>typeof window.releaseWrite==='function');await p.evaluate(()=>window.releaseWrite());if(action==='balance')await p.locator('[data-panel-command-status]').getByText(await p.evaluate(()=>window.qaText.panelUi.commandTracker.failed),{exact:false}).waitFor();else await p.locator('main [role=alert]').waitFor();}
  else if(action==='balance')await p.getByText('222 USD',{exact:true}).waitFor();
  else await p.waitForFunction(()=>window.requests.filter(r=>r.url==='/api/admin/bein-accounts'&&r.method==='GET').length>1);
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>['POST','DELETE'].includes(r.method)).length),1);check('beIN '+action+' single command '+(success?'success':'rejection'));
 }
};
