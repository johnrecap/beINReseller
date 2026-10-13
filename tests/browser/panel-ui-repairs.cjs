
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser fixture; runtime module path is configurable. */
const assert=require('node:assert/strict');const fs=require('fs'),path=require('path'),esbuild=require('esbuild');const{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const repo=process.cwd(),out=process.env.PANEL_QA_OUTPUT || path.join(repo,'output','panel-ui');fs.mkdirSync(out,{recursive:true});
const entry=fs.readFileSync(path.join(__dirname,'fixtures/panel-ui-entry.jsx'),'utf8');
(async()=>{const build=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'mocks',setup(b){b.onResolve({filter:/^(next\/navigation|next\/link|next-auth\/react)$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',resolveDir:repo,contents:a.path==='next/navigation'?fs.readFileSync(path.join(__dirname,'fixtures/panel-navigation-mock.jsx'),'utf8'):a.path==='next/link'?"import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}":"const session={status:'authenticated',data:{user:{id:'test',username:'Audit User',role:window.audit.role||'ADMIN'}}};export const useSession=()=>session;export const signIn=async()=>window.audit.authError?{error:window.audit.authError}:{ok:true};export const signOut=async()=>{window.signouts=(window.signouts||0)+1;};"}));}}]});
const css=(await require('postcss')([require('@tailwindcss/postcss')({base:repo})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.join(repo,'src/app/globals.css')})).css;const b=await chromium.launch({channel:'chrome',headless:true});try{const c=await b.newContext();const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body class="font-arabic antialiased bg-[#020617] text-slate-200"><div id="root"></div></body></html>'});if(u.pathname.startsWith('/images/')){const f=path.join(repo,'public',u.pathname);if(fs.existsSync(f))return r.fulfill({path:f});}return r.fulfill({status:404,body:''});});
async function render(config,width=360){await p.setViewportSize({width,height:800});await p.goto('http://audit.invalid/');await p.evaluate(c=>window.audit=c,config);await p.addScriptTag({content:build.outputFiles[0].text});await p.locator(config.view==='login'?'#root > div':'header').first().waitFor({timeout:15000});}


const results=[];p.setDefaultTimeout(6000);
const check=(name)=>{results.push(name);console.log('PASS '+name)};
if(!['users','stats','operations','reports','installments','dialogs','financial','operation-dialogs','active','proxies','review','eid','bein-dialogs','command','acceptance'].includes(process.env.PANEL_QA_SCOPE)) {
for(const language of ['en','ar','bn']){
 for(const width of [360,390,768,1280,1440]){
  await render({view:'history',language},width);
  await p.locator('main [data-panel-table]').waitFor({state:'attached'});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow '+language+width);
  if(width<1024){
   await p.getByRole('button',{name:language==='en'?'Main menu':language==='ar'?'القائمة الرئيسية':'প্রধান মেনু',exact:true}).click();
   await p.getByRole('dialog').waitFor();
   await p.keyboard.press('Tab');
   assert.ok(await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));
   await p.keyboard.press('Escape');
   await p.getByRole('dialog').waitFor({state:'detached'});
   await p.waitForFunction(()=>document.activeElement.id==='panel-menu-button');
  }
  await p.locator('header button').last().click();
  const popup=p.locator('#panel-notifications');await popup.waitFor();
  const rect=await popup.boundingBox();assert.ok(rect.x>=-1&&rect.x+rect.width<=width+1,'notification bounds');
  await p.keyboard.press('Escape');
  check('responsive navigation '+language+' '+width);
 }
 await render({view:'login',language},360);
 await p.locator('form').waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const pass=p.locator('#password');const toggle=p.locator('button[aria-pressed]');const a=await pass.boundingBox(),e=await toggle.boundingBox();
 assert.ok(language==='ar'?e.x+e.width<=a.x+2:e.x>=a.x+a.width-2,'password toggle overlap');
 await p.screenshot({path:path.join(out,'ui-fixed-login-'+language+'-360.png')});check('login layout '+language);
}
await render({view:'login',language:'en',authError:'Configuration'},360);
await p.locator('#username').fill('synthetic');await p.locator('#password').fill('synthetic');
await p.locator('button[type=submit]').click();await p.getByRole('alert').waitFor();
assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url.includes('login-attempt-status')).length),0);check('configuration error preserved');
await render({view:'login',language:'en',authError:'CredentialsSignin',loginFeedbackHang:true},360);
await p.locator('#username').fill('synthetic');await p.locator('#password').fill('synthetic');
await p.locator('button[type=submit]').click();await p.getByRole('alert').waitFor({timeout:7000});assert.equal(await p.locator('button[type=submit]').isDisabled(),false);check('login feedback deadline');
await render({view:'login',language:'en',callback:'https://evil.invalid/dashboard'},360);
await p.locator('#username').fill('synthetic');await p.locator('#password').fill('synthetic');await p.locator('button[type=submit]').click();
await p.waitForFunction(()=>window.routes.length);assert.equal(await p.evaluate(()=>window.routes[0]),'/dashboard');check('safe login redirect');
await render({view:'login',language:'en',revoked:true},360);await p.locator('form').waitFor();assert.equal(await p.evaluate(()=>window.signouts),1);check('revoked cookie cleaned once');
await render({view:'transactions',language:'en',transactionError:true},1280);
await p.locator('main [role=alert]').waitFor();assert.ok(!(await p.locator('main').innerText()).includes('No transactions'));check('transaction failure is not empty balance');
await render({view:'transactions',language:'en'},1280);await p.getByText('Showing 1-10 of 11',{exact:true}).waitFor();
await p.getByRole('button',{name:/Amount/}).click();await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('sortBy=amount')));
await p.locator('th[aria-sort=ascending]').waitFor();assert.equal(await p.locator('th[aria-sort=ascending]').count(),1);check('server sorting and true total');
await render({view:'manager',language:'en'},1280);await p.getByText('synthetic-user',{exact:true}).waitFor();
await p.getByTitle('Next Page',{exact:true}).click();await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('page=2')));
await p.locator('main input[type=text]').fill('name+tag&test@example.invalid');
await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('search=name%2B')));
const request=await p.evaluate(()=>window.requests.filter(r=>r.url.includes('/api/manager/users')).at(-1).url);
assert.equal(new URL(request,'http://audit.invalid').searchParams.get('page'),'1');
assert.equal(new URL(request,'http://audit.invalid').searchParams.get('search'),'name+tag&test@example.invalid');check('manager search encoding and page reset');
await render({view:'manager',language:'en',managerError:403},1280);await p.locator('main [role=alert]').waitFor();assert.ok((await p.locator('main').innerText()).includes('access'));check('permission failure state');
await render({view:'edit',language:'en'},360);await p.getByRole('dialog').waitFor();await p.setViewportSize({width:360,height:640});
const styles=await p.getByRole('dialog').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color,rect:el.getBoundingClientRect().toJSON()}));
assert.notEqual(styles.bg,styles.fg);assert.ok(styles.rect.top>=0&&styles.rect.bottom<=640);
await p.screenshot({path:path.join(out,'ui-fixed-edit-dialog.png')});check('edit dialog theme and viewport');
await render({view:'bein',language:'en'},360);await p.getByRole('button',{name:'Add Account',exact:true}).waitFor();
assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
await p.getByRole('button',{name:'Add Account',exact:true}).click();await p.getByRole('dialog').waitFor();await p.setViewportSize({width:360,height:640});
const dialog=p.getByRole('dialog');await p.waitForFunction(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight});const box=await dialog.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=640);
await dialog.locator('button[type=submit]').scrollIntoViewIfNeeded();assert.ok(await dialog.locator('button[type=submit]').isVisible());
await p.screenshot({path:path.join(out,'ui-fixed-bein-add-dialog.png')});check('beIN mobile header and scrollable dialog');
await render({view:'history',language:'en'},1280);await p.locator('header button').last().click();await p.getByRole('button',{name:/Mark all as read/}).click();
await p.waitForFunction(()=>window.requests.some(r=>r.method==='PUT'));
await p.getByRole('button',{name:/Mark all as read/}).waitFor();
assert.equal(await p.locator('button[aria-controls=panel-notifications]').innerText(),'1');check('failed notification mutation retains unread count');
await p.screenshot({path:path.join(out,'ui-fixed-notifications.png')});
await render({view:'history',language:'en',race:true},1280);
await p.locator('main [data-panel-table]').waitFor();await p.locator('main input[type=search]').fill('old');
await p.locator('main button[type=submit]').click();await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('cardNumber=old')));
await p.getByTitle('Reset',{exact:true}).click();await p.locator('main [data-panel-table]').waitFor();
await p.waitForTimeout(850);assert.ok(!(await p.locator('main').innerText()).includes('old'));check('stale list response cannot replace reset query');
await render({view:'history',language:'en'},640);await p.evaluate(()=>document.body.style.zoom='200%');
assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));check('200 percent zoom');
await render({view:'foundation',language:'ar'},1280);
assert.equal(await p.locator('#default-table th').evaluate(el=>getComputedStyle(el).textAlign),'left');
assert.equal(await p.locator('#panel-table-1 th').evaluate(el=>getComputedStyle(el).textAlign),'start');
const original=await p.locator('#default-table td').evaluate(el=>getComputedStyle(el).paddingTop);
await p.addStyleTag({content:'[data-panel-table]{--panel-table-cell-block:33px}'});
for(const id of ['panel-table-1','panel-table-2'])assert.equal(await p.locator('#'+id+' td').evaluate(el=>getComputedStyle(el).paddingTop),'33px');
assert.equal(await p.locator('#default-table td').evaluate(el=>getComputedStyle(el).paddingTop),original);check('panel table tokens preserve default consumers');
assert.ok((await p.locator('main').innerText()).includes('0-0'));check('empty range is zero');

for (const language of ['ar','en','bn']) {
 for (const width of [360,390,768,1280,1440]) {
  for (const view of ['export','contracts']) {
   await render({view,language},width);
   await p.locator('main table').first().waitFor();
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' page overflow');
   const scroller=p.locator('main [tabindex="0"]').first();
   assert.ok(await scroller.evaluate(el=>el.scrollWidth>=el.clientWidth));
   await scroller.focus(); assert.ok(await scroller.evaluate(el=>el===document.activeElement));
   if(view==='export') {
    const exportNode=p.locator('[data-export-table]');
    assert.equal(Math.round((await exportNode.boundingBox()).width),850);
    assert.equal(await p.locator('main table').first().innerText(),await exportNode.locator('table').innerText());
    assert.equal(await p.locator('main table').first().evaluate(el=>getComputedStyle(el.parentElement).transform),'none');
   }
   check(view+' readable document '+language+' '+width);
   if (width === 360 && language === 'ar') await p.screenshot({path:path.join(out,'completion-'+view+'-ar-360.png')});
  }
 }
 for (const view of ['balance','managerBalance','create']) {
  await render({view,language,writeFailure:true},360);
  await p.setViewportSize({width:360,height:640});
  const modal=p.getByRole('dialog');await modal.waitFor();
  await p.waitForFunction(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight});
  await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));
  if(view==='create') {
   await modal.locator('[name=username]').fill('synthetic');
   await modal.locator('[name=email]').fill('synthetic@deshpanel.com');
   await modal.locator('[name=password]').fill('Synthetic-Only-123!');
  } else await modal.locator('[name=amount]').fill('1');
  await modal.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await p.waitForFunction(()=>window.requests.some(r=>['POST','PATCH'].includes(r.method)));
  await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>window.panelClosed||0),0);
  await modal.getByText('Synthetic rejection',{exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>['POST','PATCH'].includes(r.method)).length),1);
  assert.equal(await p.evaluate(()=>!!window.saved),false);
  assert.equal(await modal.locator(view==='create'?'[name=username]':'[name=amount]').inputValue(),view==='create'?'synthetic':'1');
  await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>window.panelClosed),1);
  check(view+' dialog bounds, focus, duplicate submit and failure retention '+language);
  if (language === 'ar') await p.screenshot({path:path.join(out,'completion-'+view+'-ar-360.png')});
 }
}
for(const view of ['balanceReport','creditReport','pointsReport','spendReport']) {
 for(const status of [401,403,500]) {
  await render({view,language:'en',reportError:status},390);
  await p.locator('main [role=status]').waitFor();
  assert.equal(await p.locator('[data-panel-report-results]').count(),0,'loading is not a zero report');
  await p.locator('main [role=alert]').waitFor();
  assert.equal(await p.locator('[data-panel-report-results]').count(),0,'failed report must not render fabricated totals/empty rows');
  assert.equal(await p.locator('main table').count(),0);
  assert.ok(!(await p.locator('main').innerText()).includes('$0.00'));
  check(view+' HTTP '+status+' distinct loading/failure');
 }
}
for(const view of ['adminDeleted','managerDeleted']) {
 for(const language of ['ar','en','bn']) {
  for(const width of [360,390,768,1280,1440]) {
   await render({view,language,clampDeleted:true},width);
   await p.getByText('synthetic-deleted',{exact:true}).waitFor();
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+language+width);
   await p.locator('main [data-panel-table-scroll]').focus();
   assert.ok(await p.evaluate(()=>document.activeElement.hasAttribute('data-panel-table-scroll')));
   check(view+' table bounds and keyboard scroll '+language+' '+width);
  }
 }
 for(const status of [401,403,500]) {
  await render({view,language:'en',deletedError:status},390);
  await p.locator('main [role=alert]').waitFor();
  assert.equal(await p.locator('main table:visible').count(),0);
  assert.ok(!(await p.locator('main').innerText()).includes('No deleted'));
  check(view+' distinct HTTP '+status+' failure');
 }
 await render({view,language:'en',clampDeleted:true},390);
 await p.getByText('synthetic-deleted',{exact:true}).waitFor();
 await p.locator('main button[title]').last().click();
 await p.waitForFunction(()=>window.requests.filter(r=>r.url.includes('/users/deleted?')).length>=3);
 const last=await p.evaluate(()=>window.requests.filter(r=>r.url.includes('/users/deleted?')).at(-1).url);
 assert.equal(new URL(last,'http://audit.invalid').searchParams.get('page'),'1');
 check(view+' page clamps when last page disappears');
}
await render({view:'foundation',language:'en'},390);
await p.addStyleTag({content:':root{--panel-table-cell-block:29px}'});
for(const id of ['panel-table-1','panel-table-2']) assert.equal(await p.locator('#'+id+' td').evaluate(el=>getComputedStyle(el).paddingTop),'29px');
check('root theme token reaches every opted-in table');

for(const language of ['ar','en','bn']) {
 await render({view:'dialogFocus',language},390);
 await p.locator('#dialog-opener').click();await p.getByRole('dialog').waitFor();
 await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));
 await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'detached'});
 await p.waitForFunction(()=>document.activeElement.id==='dialog-opener');
 check('legacy dialog restores opener focus '+language);
}
}
if(!['stats','operations','reports','installments','dialogs','financial','operation-dialogs','active','proxies','review','eid','bein-dialogs','command','acceptance'].includes(process.env.PANEL_QA_SCOPE)) {
for(const language of ['ar','en','bn']) {
 for(const width of [360,390,768,1280,1440]) {
  await render({view:'admin',language},width);
  for(const [index,role] of [[0,'distributors'],[1,'users'],[2,'agents']]) {
   await p.getByRole('tab').nth(index).click();await p.getByText('synthetic-'+role,{exact:true}).waitFor();
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'admin '+role+' '+language+' '+width);
   assert.equal(await p.locator('main table:visible').count(),1);
   check('admin '+role+' table '+language+' '+width);
  }
  await render({view:'manager',language,role:'MANAGER'},width);await p.getByText('synthetic-user',{exact:true}).waitFor();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'manager user table bounds');
  assert.equal(await p.locator('main table:visible').count(),1);check('manager user table '+language+' '+width);
  await render({view:'inactive',language},width);await p.getByText('synthetic-inactive',{exact:true}).waitFor();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'inactive table bounds');
  assert.ok((await p.locator('main select').nth(1).locator('option').allTextContents()).every(text=>text.trim().length>0));
  if(language==='bn')assert.ok(!(await p.locator('main tbody').innerText()).includes('Critical'));
  await p.locator('main th[aria-sort] button').first().focus();await p.keyboard.press('Enter');
  await p.locator('th[aria-sort=ascending]').waitFor();
  await p.locator('main input').fill('name+tag&test@example.invalid');await p.locator('main input').press('Enter');
  assert.equal(await p.evaluate(()=>window.filterChanges.at(-1).search),'name+tag&test@example.invalid');
  check('inactive filters, labels and keyboard sort '+language+' '+width);
  await render({view:'stats',language},width);await p.getByText('stats-a note 1',{exact:true}).waitFor();
  const statsDialog=p.getByRole('dialog').first();
  if(width===360)await p.screenshot({path:path.join(out,'stats-'+language+'-360.png')});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'stats page bounds');
  assert.ok(await statsDialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'stats dialog bounds '+language+' '+width);
  const label=await p.evaluate(()=>window.qaText.userStats.tabs.operations);
  await statsDialog.getByRole('button',{name:label+' (3)',exact:true}).click();
  await statsDialog.getByText('0000000001',{exact:true}).waitFor();
  assert.equal(await statsDialog.locator('table').count(),2);
  check('statistics summary/transaction/operation tables '+language+' '+width);
 }
}
}
if(!['operations','reports','installments','dialogs','financial','operation-dialogs','active','proxies','review','eid','bein-dialogs','command','acceptance'].includes(process.env.PANEL_QA_SCOPE)) {
await render({view:'stats',language:'en',statsRace:true},390);
await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('/stats-a/stats')));
await p.evaluate(()=>window.switchStatsUser());await p.getByText('stats-b note 1',{exact:true}).waitFor();
await p.waitForTimeout(700);assert.equal(await p.getByText('stats-a note 1',{exact:true}).count(),0);check('statistics rejects old user response');
await render({view:'stats',language:'en'},390);await p.getByText('stats-a note 1',{exact:true}).waitFor();
const more=p.getByRole('dialog').getByRole('button').filter({hasText:/Load more/i});
await more.evaluate(button=>{button.click();button.click()});await p.getByText('stats-a note 3',{exact:true}).waitFor();
assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.url.includes('txSkip=2')).length),1);
assert.equal(await p.getByText('stats-a note 2',{exact:true}).count(),1);check('statistics load more deduplicates admission and rows');
for(const status of [401,403,500]) {
 await render({view:'stats',language:'en'},390);await p.getByText('stats-a note 1',{exact:true}).waitFor();
 await p.evaluate(status=>window.audit.statsError=status,status);
 await p.getByRole('dialog').getByRole('button').filter({hasText:/Load more/i}).click();
 await p.locator('[role=dialog] [role=alert]').waitFor();
 assert.equal(await p.locator('[role=dialog] table').count(),0);check('statistics hides prior data after HTTP '+status);
}
await render({view:'stats',language:'en',managerStats:true,role:'MANAGER'},390);await p.getByText('stats-a note 1',{exact:true}).waitFor();
assert.ok(await p.evaluate(()=>window.requests.some(r=>r.url.includes('/api/manager/users/stats-a/stats'))));
const correctionTitle=await p.evaluate(()=>window.qaText.userStats.alerts.correct);assert.equal(await p.getByTitle(correctionTitle,{exact:true}).count(),0);check('manager statistics uses manager endpoint without correction');
await render({view:'stats',language:'en',writeFailure:true,holdWrite:true},390);await p.getByText('stats-a note 1',{exact:true}).waitFor();
await p.getByTitle(correctionTitle,{exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===2);
const correction=p.getByRole('dialog').last();await correction.getByRole('textbox').fill('Synthetic retained correction note');
await correction.getByRole('button').last().evaluate(button=>{button.click();button.click()});
await p.waitForFunction(()=>window.requests.some(r=>r.method==='POST'));
await p.keyboard.press('Escape');assert.equal(await p.locator('[role=dialog]').count(),2); // Radix hides the parent from the accessibility tree.
await p.evaluate(()=>window.releaseWrite());
await p.waitForFunction(()=>window.auditAlerts.length>0);
assert.equal(await correction.getByRole('textbox').inputValue(),'Synthetic retained correction note');
assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.method==='POST').length),1);
await p.keyboard.press('Escape');await p.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);
await p.waitForFunction(title=>document.activeElement.title===title,correctionTitle);check('statistics correction rejects duplicates, retains failure and restores nested focus');
}
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='operations') await require('./panel-operations-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='stats') await require('./panel-stats-receipt-cases.cjs')({p,render,check,build,css,out});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='reports') await require('./panel-report-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='installments') await require('./panel-installment-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='financial')await require('./panel-financial-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='operation-dialogs')await require('./panel-operation-dialog-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='active')await require('./panel-active-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='bein-dialogs')await require('./panel-bein-dialog-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='eid')await require('./panel-eid-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='review')await require('./panel-review-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='proxies')await require('./panel-proxy-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='dialogs') await require('./panel-dialog-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='command')await require('./panel-command-cases.cjs')({p,render,check});
if(!process.env.PANEL_QA_SCOPE || process.env.PANEL_QA_SCOPE==='acceptance')await require('./panel-acceptance-cases.cjs')({p,render,check});
assert.deepEqual(errors,[]);
fs.writeFileSync(path.join(out,process.env.PANEL_QA_SCOPE==='acceptance'?'panel-ui-acceptance-verification.json':process.env.PANEL_QA_SCOPE==='command'?'panel-ui-command-verification.json':process.env.PANEL_QA_SCOPE==='bein-dialogs'?'panel-ui-bein-dialogs-verification.json':process.env.PANEL_QA_SCOPE==='eid'?'panel-ui-eid-verification.json':process.env.PANEL_QA_SCOPE==='review'?'panel-ui-review-verification.json':process.env.PANEL_QA_SCOPE==='proxies'?'panel-ui-proxies-verification.json':process.env.PANEL_QA_SCOPE==='active'?'panel-ui-active-verification.json':process.env.PANEL_QA_SCOPE==='operation-dialogs'?'panel-ui-operation-dialogs-verification.json':process.env.PANEL_QA_SCOPE==='financial'?'panel-ui-financial-verification.json':process.env.PANEL_QA_SCOPE==='dialogs'?'panel-ui-dialogs-verification.json':process.env.PANEL_QA_SCOPE==='installments'?'panel-ui-installments-verification.json':process.env.PANEL_QA_SCOPE==='reports'?'panel-ui-reports-verification.json':process.env.PANEL_QA_SCOPE==='operations'?'panel-ui-operations-verification.json':process.env.PANEL_QA_SCOPE==='users'?'panel-ui-users-verification.json':process.env.PANEL_QA_SCOPE==='stats'?'panel-ui-stats-verification.json':'panel-ui-verification.json'),JSON.stringify({passed:results,errors},null,2));
console.log('TOTAL '+results.length);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
