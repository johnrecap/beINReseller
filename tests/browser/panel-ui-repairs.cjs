
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser fixture; runtime module path is configurable. */
const assert=require('node:assert/strict');const fs=require('fs'),path=require('path'),esbuild=require('esbuild');const{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const repo=process.cwd(),out=process.env.PANEL_QA_OUTPUT || path.join(repo,'output','panel-ui');fs.mkdirSync(out,{recursive:true});
const entry="\nimport React from 'react';import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';import {PanelTablePagination} from '@/components/ui/PanelTableControls';import{createRoot}from'react-dom/client';import Login from'@/components/auth/LoginPageClient';import Shell from'@/components/layout/DashboardShell';import Transactions from'@/components/transactions/TransactionsTable';import Operations from'@/components/history/OperationsTable';import{useStore}from'@/store/useStore';\nimport HistoryPage from '@/components/history/HistoryPageClient';import AdminUsers from '@/components/admin/users/UsersTable';import ManagerUsers from '@/components/manager/users/ManagerUsersTable';import EditUser from '@/components/admin/users/EditUserDialog';import BeinAccounts from '@/app/dashboard/admin/bein-accounts/page';const c=window.audit;useStore.setState({language:c.language});document.documentElement.dir=c.language==='ar'?'rtl':'ltr';document.documentElement.lang=c.language;\nwindow.routes=[];window.requests=[];window.fetch=async(url,o={})=>{\nwindow.requests.push({url:String(url),method:o.method||'GET'});\nif(String(url).includes('/api/operations?')) {\n const q=new URL(String(url),'http://audit.invalid').searchParams;\n if(c.race&&q.get('cardNumber')==='old') await new Promise(r=>setTimeout(r,700));\n return new Response(JSON.stringify({operations:[{id:'test',type:'RENEW',cardNumber:q.get('cardNumber')||'0000000000',amount:1,status:'REVIEW_REQUIRED',createdAt:'2026-09-08T00:00:00Z',messageKey:'operations.refundSettlementPending',settlementState:'REFUND_PENDING',nextAction:'CONTACT_ADMIN'}],totalPages:2,total:11}));\n}\nif(String(url).includes('/api/admin/users/counts')) return Response.json({users:1,agents:1,distributors:1,totalBalance:1});\nif(String(url).includes('/api/admin/users?')) return Response.json({users:[],totalPages:1});\nif(c.managerError&&String(url).includes('/api/manager/users'))return Response.json({error:'test'},{status:c.managerError});\nif(c.loginFeedbackHang&&String(url).includes('login-attempt-status'))return new Promise(()=>{});\n\nif(String(url).includes('/api/manager/users')){const p=new URL(String(url),'http://audit.invalid').searchParams;return new Response(JSON.stringify({users:p.get('search')&&p.get('page')!=='1'?[]:[{id:'test',username:'synthetic-user',email:'audit@example.invalid',role:'USER',balance:1,isActive:true,createdAt:'2026-09-08T00:00:00Z'}],totalPages:p.get('search')?1:2,total:p.get('search')?1:11}));} if(String(url).includes('/api/admin/bein-accounts'))return new Response(JSON.stringify({success:true,accounts:[],poolStatus:null}));if(String(url).includes('/api/admin/proxies'))return new Response(JSON.stringify({success:true,proxies:[]}));if(String(url).includes('login-attempt-status'))return new Response(JSON.stringify({status:'invalid_credentials',remainingAttempts:3}));\nif(String(url).includes('/api/notifications'))return new Response(JSON.stringify(o.method==='PUT'?{error:'unavailable'}:{notifications:[{id:'test',title:'Audit notification',message:'Synthetic content',read:false,type:'info',createdAt:'2026-09-08T00:00:00Z'}],unreadCount:1}),{status:o.method==='PUT'?500:200});\nif(String(url).includes('/api/transactions'))return new Response(JSON.stringify(c.transactionError?{error:'unavailable'}:{transactions:[{id:'test',type:'DEPOSIT',amount:1,balanceBefore:0,balanceAfter:1,createdAt:'2026-09-08T00:00:00Z',notes:'Synthetic entry'}],totalPages:2,total:11,stats:{currentBalance:1,totalDeposits:1,totalDeductions:0}}),{status:c.transactionError?500:200});\nreturn new Response(JSON.stringify({enabled:false}));};\ncreateRoot(document.getElementById('root')).render(c.view==='login'?<Login revoked={c.revoked} unavailable={c.unavailable}/>:<Shell>{c.view==='foundation'?<><Table id='default-table'><TableHeader><TableRow><TableHead>Default</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Default value</TableCell></TableRow></TableBody></Table>{[1,2].map(n=><Table panel key={n} id={'panel-table-'+n}><TableHeader><TableRow><TableHead>Panel</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Panel value</TableCell></TableRow></TableBody></Table>)}<PanelTablePagination page={1} total={0} onPageChange={()=>{}}/></>:c.view==='admin'?<AdminUsers/>:c.view==='history'?<HistoryPage/>:c.view==='manager'?<ManagerUsers managerBalance={1} onBalanceChange={()=>{}}/>:c.view==='edit'?<EditUser isOpen user={{id:'test',username:'synthetic-user',email:'audit@example.invalid',isActive:true}} onClose={()=>{}} onSuccess={()=>{}}/>:c.view==='bein'?<BeinAccounts/>:c.view==='transactions'?<Transactions/>:<Operations operations={[{id:'test',type:'RENEW',cardNumber:'0000000000',amount:1,status:'COMPLETED',createdAt:'2026-09-08T00:00:00Z',responseMessage:'Synthetic result'}]} page={2} total={11} totalPages={2} sortConfig={{key:'date',direction:'desc'}} onSortChange={()=>{}} onPageChange={()=>{}}/>}</Shell>);\n";
(async()=>{const build=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'mocks',setup(b){b.onResolve({filter:/^(next\/navigation|next\/link|next-auth\/react)$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',resolveDir:repo,contents:a.path==='next/navigation'?"const router={push:u=>window.routes.push(u),refresh:()=>{}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(window.audit.callback?'callbackUrl='+encodeURIComponent(window.audit.callback):'');export const usePathname=()=>'/dashboard/history';":a.path==='next/link'?"import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}":"const session={status:'authenticated',data:{user:{id:'test',username:'Audit User',role:'ADMIN'}}};export const useSession=()=>session;export const signIn=async()=>window.audit.authError?{error:window.audit.authError}:{ok:true};export const signOut=async()=>{window.signouts=(window.signouts||0)+1;};"}));}}]});
const css=(await require('postcss')([require('@tailwindcss/postcss')({base:repo})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.join(repo,'src/app/globals.css')})).css;const b=await chromium.launch({channel:'chrome',headless:true});try{const c=await b.newContext();const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body class="font-arabic antialiased bg-[#020617] text-slate-200"><div id="root"></div></body></html>'});if(u.pathname.startsWith('/images/')){const f=path.join(repo,'public',u.pathname);if(fs.existsSync(f))return r.fulfill({path:f});}return r.fulfill({status:404,body:''});});
async function render(config,width=360){await p.setViewportSize({width,height:800});await p.goto('http://audit.invalid/');await p.evaluate(c=>window.audit=c,config);await p.addScriptTag({content:build.outputFiles[0].text});await p.locator(config.view==='login'?'#root > div':'header').waitFor({timeout:5000});}


const results=[];p.setDefaultTimeout(6000);
const check=(name)=>{results.push(name);console.log('PASS '+name)};
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
assert.equal(await p.locator('th[aria-sort=ascending]').count(),1);check('server sorting and true total');
await render({view:'manager',language:'en'},1280);await p.getByText('synthetic-user',{exact:true}).waitFor();
await p.getByTitle('Next Page',{exact:true}).click();await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('page=2')));
await p.locator('main input[type=text]').fill('name+tag@example.invalid');
await p.waitForFunction(()=>window.requests.some(r=>r.url.includes('search=name%2B')));
const request=await p.evaluate(()=>window.requests.filter(r=>r.url.includes('/api/manager/users')).at(-1).url);
assert.equal(new URL(request,'http://audit.invalid').searchParams.get('page'),'1');
assert.equal(new URL(request,'http://audit.invalid').searchParams.get('search'),'name+tag@example.invalid');check('manager search encoding and page reset');
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
assert.deepEqual(errors,[]);
fs.writeFileSync(path.join(out,'panel-ui-verification.json'),JSON.stringify({passed:results,errors},null,2));
console.log('TOTAL '+results.length);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
