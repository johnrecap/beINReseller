/* eslint-disable @typescript-eslint/no-require-imports -- All proxy/import/probe HTTP is intercepted. */
const assert=require('node:assert/strict');
module.exports=async function proxyCases({p,render,check}) {
 async function open(action,language,width,config={}) {
  await render({view:'proxies',language,...config},width);
  await p.getByText('Synthetic proxy',{exact:true}).waitFor();
  const copy=await p.evaluate(()=>window.qaText);
  if(action==='edit')await p.getByTitle(copy.common.edit,{exact:true}).click();
  else await p.getByRole('button',{name:action==='import'?copy.adminProxies.import.button:copy.adminProxies.addProxy,exact:true}).click();
  return p.getByRole('dialog');
 }
 for(const language of ['ar','en','bn'])for(const width of [360,390,768,1280,1440]) {
  await render({view:'proxies',language},width);await p.getByText('Synthetic proxy',{exact:true}).waitFor();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'proxy page overflow '+language+' '+width);
  check('proxy table/header bounds '+language+' '+width);
 }
 for(const action of ['add','edit','import'])for(const language of ['ar','en','bn'])for(const width of [360,390,768,1280,1440]) {
  const modal=await open(action,language,width);await p.setViewportSize({width,height:640});
  await p.waitForFunction(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1;});
  assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  assert.equal(await modal.getAttribute('dir'),language==='ar'?'rtl':'ltr');
  await modal.getByRole('button').last().scrollIntoViewIfNeeded();await p.keyboard.press('Escape');await modal.waitFor({state:'detached'});
  check('proxy '+action+' short-dialog scroll, direction and Escape '+language+' '+width);
 }
 for(const action of ['add','edit','import'])for(const language of ['ar','en','bn'])for(const success of [false,true]) {
  const modal=await open(action,language,390,{writeFailure:!success,holdWrite:!success,writeSuccess:success});
  const label=action==='edit'?'#edit-label':'#label';
  if(action==='import') {
   await modal.locator('textarea').fill('192.0.2.10:8080:synthetic:synthetic');
   await modal.getByRole('button',{name:await p.evaluate(()=>window.qaText.adminProxies.import.preview),exact:true}).click();
   await p.waitForFunction(()=>!document.querySelector('[role=dialog] textarea').disabled);
   await modal.getByRole('button',{name:await p.evaluate(()=>window.qaText.adminProxies.import.import),exact:true}).evaluate(button=>{button.click();button.click()});
  } else {
   await modal.locator(label).fill('Synthetic retained label');
   if(action==='add'){await modal.locator('#host').fill('192.0.2.10');await modal.locator('#port').fill('8080');}
   await modal.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  }
  if(success){
   await modal.waitFor({state:'detached'});
   await p.waitForFunction(action=>action==='edit'?document.activeElement.title===window.qaText.common.edit:document.activeElement.textContent.trim()===(action==='import'?window.qaText.adminProxies.import.button:window.qaText.adminProxies.addProxy),action);
  }
  else {
   await p.waitForFunction(()=>!!window.releaseWrite);await p.keyboard.press('Escape');assert.equal(await modal.count(),1);
   await p.evaluate(()=>window.releaseWrite());await modal.getByRole('alert').waitFor();
   assert.equal(await modal.locator(action==='import'?'textarea':label).inputValue(),action==='import'?'192.0.2.10:8080:synthetic:synthetic':'Synthetic retained label');
  }
  const writes=await p.evaluate(()=>window.requests.filter(r=>['POST','PUT'].includes(r.method)&&r.body?.mode!=='preview'));
  assert.equal(writes.length,1);
  if(action==='import')assert.deepEqual(writes[0].body,{mode:'commit',text:'192.0.2.10:8080:synthetic:synthetic',isActive:true});
  else {assert.equal(writes[0].body.host,'192.0.2.10');assert.equal(writes[0].body.port,8080);assert.equal(writes[0].body.label,'Synthetic retained label');}
  check('proxy '+action+' '+(success?'success':'rejection')+' preserves fields/body and admits one request '+language);
 }
 for(const action of ['test','toggle','delete'])for(const success of [false,true]) {
  await render({view:'proxies',language:'en',writeFailure:!success,holdWrite:!success,writeSuccess:success},390);await p.getByText('Synthetic proxy',{exact:true}).waitFor();
  const titles=await p.evaluate(()=>({test:window.qaText.adminProxies.actions.testConnection,toggle:window.qaText.adminProxies.actions.disable,delete:window.qaText.adminProxies.actions.delete}));
  await p.getByTitle(titles[action],{exact:true}).evaluate(el=>{el.click();el.click()});
  if(!success){await p.waitForFunction(()=>typeof window.releaseWrite==='function');await p.evaluate(()=>window.releaseWrite());await p.locator('main [role=alert]').waitFor();}
  else await p.waitForFunction(()=>window.requests.filter(r=>r.url==='/api/admin/proxies'&&r.method==='GET').length>1);
  const writes=await p.evaluate(()=>window.requests.filter(r=>['POST','PUT','DELETE'].includes(r.method)));assert.equal(writes.length,1);if(action==='toggle')assert.deepEqual(writes[0].body,{isActive:false});
  check('proxy '+action+' single command '+(success?'success':'rejection'));
 }
 const importDialog=await open('import','en',390);const importCopy=await p.evaluate(()=>window.qaText.adminProxies.import);
 await importDialog.locator('textarea').fill('192.0.2.10:8080:synthetic:synthetic');await importDialog.getByRole('button',{name:importCopy.preview,exact:true}).click();
 await p.waitForFunction(()=>!document.querySelector('[role=dialog] textarea').disabled);await importDialog.locator('textarea').fill('192.0.2.11:8080:synthetic:synthetic');
 assert.equal(await importDialog.getByRole('button',{name:importCopy.import,exact:true}).isDisabled(),true);
 assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.body?.mode==='commit').length),0);check('proxy edited import text invalidates prior preview');
 for(const status of [401,403,500]) {
  await render({view:'proxies',language:'en',opsError:status},390);await p.locator('main [role=alert]').waitFor();
  assert.equal(await p.locator('main table').count(),0);assert.equal(await p.locator('main form').count(),0);
  check('proxy read HTTP '+status+' does not fabricate a loaded list');
 }
};
