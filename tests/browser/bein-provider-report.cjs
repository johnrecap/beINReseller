/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser; every network request is intercepted. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
require('tsx/cjs');
const translations = require('../../src/i18n/translations');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const repo=process.cwd(), output=path.join(repo,'output/playwright/bein-provider-report'); fs.mkdirSync(output,{recursive:true});
 const build=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Panel from '@/components/admin/report-center/BeinProviderReportPanel';import{useStore}from'@/store/useStore';useStore.setState({language:window.qaLanguage});document.documentElement.dir=window.qaLanguage==='ar'?'rtl':'ltr';window.setLanguage=l=>useStore.setState({language:l});createRoot(document.getElementById('root')).render(<Panel/>);`,loader:'tsx',resolveDir:repo},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const css=(await require('postcss')([require('@tailwindcss/postcss')({base:repo})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.join(repo,'src/app/globals.css')})).css;
 const browser=await chromium.launch({channel:'chrome',headless:true}); const results=[];
 try {
  const p=await browser.newPage(); const errors=[],unexpected=[];p.on('pageerror',e=>errors.push(e.message));
  let posts=[], mode='complete', counter=0; const requests=new Map(); let releaseA;
  await p.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!=='http://provider-report.invalid'){unexpected.push(req.url());return route.abort();}
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="bg-background text-foreground"><main id="root" style="max-width:1150px;margin:auto;padding:16px"></main></body></html>`});
   if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
   if(url.pathname==='/api/admin/bein-accounts')return route.fulfill({json:{accounts:[{id:'account-a',username:'dealer-a',label:'Synthetic A',eligible:true},{id:'account-b',username:'dealer-b',label:'Synthetic B',eligible:true},{id:'disabled',username:'disabled-dealer',label:null,eligible:false}]}});
   if(url.pathname==='/api/admin/reports/bein-provider'){
    const body=req.postDataJSON();posts.push(body);
    if(mode==='429')return route.fulfill({status:429,json:{code:'RATE_LIMITED'}});
    const id='r'+(++counter);requests.set(id,body);return route.fulfill({status:202,json:{success:true,data:{requestId:id}}});
   }
   if(url.pathname.startsWith('/api/admin/reports/bein-provider/')){
    if(mode==='403')return route.fulfill({status:403,json:{code:'FORBIDDEN'}});
    if(mode==='404')return route.fulfill({status:404,json:{code:'REPORT_EXPIRED'}});
    const id=url.pathname.split('/').pop(),input=requests.get(id);assert.ok(input);
    const page=Number(url.searchParams.get('page')||1),search=url.searchParams.get('search')||'';
    if(mode==='race'&&input.accountId==='account-a')await new Promise(resolve=>{releaseA=resolve});
    const state=['ACCOUNT_BUSY','REPORT_INCOMPLETE','CAPTCHA_REQUIRED','REPORT_TIMEOUT'].includes(mode)?'FAILED':mode==='queued'?'QUEUED':'COMPLETED';
    const rows=Array.from({length:mode==='empty'||search==='none'?0:page===2?1:50},(_,i)=>({invoiceNo:String(1001+i+(page-1)*50),cardNumber:input.accountId==='account-a'?'7000000001':'7000000002',itemType:'Card_CISCO',packageName:'Premium 6 Months + 20% OFF — '+input.accountId,contractStartDate:'12/10/2026',contractExpiryDate:'11/04/2027',providerAmount:'86.40',currency:'USD'}));
    return route.fulfill({json:{...input,id,state,errorCode:state==='FAILED'?mode:undefined,createdAt:Date.now(),deadline:Date.now()+300000,fetchedAt:'2026-10-12T12:00:00Z',rows:state==='COMPLETED'?rows:[],total:rows.length?51:0,page,pageSize:50}}).catch(()=>{});
   }
   unexpected.push(url.pathname);return route.abort();
  });
  async function render(language='en',width=390){posts=[];mode='complete';await p.setViewportSize({width,height:900});await p.goto('http://provider-report.invalid/');await p.evaluate(l=>window.qaLanguage=l,language);await p.addScriptTag({content:build.outputFiles[0].text});await p.locator('select').waitFor();}
  const check=name=>{results.push(name);console.log('PASS '+name)};
  for(const language of ['en','ar','bn'])for(const width of [360,1280]){
   await render(language,width);const t=translations[language].providerReport;
   await p.getByLabel(t.account,{exact:true}).selectOption('account-a');await p.locator('tbody tr').first().waitFor();
   assert.equal(posts.length,1);assert.equal(posts[0].accountId,'account-a');assert.equal((Date.parse(posts[0].to)-Date.parse(posts[0].from))/86400000,6);
   assert.equal(await p.locator('option[value="disabled"]').evaluate(el=>el.disabled),true);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.equal(await p.locator('table[data-panel-table]').count(),1);
   await p.getByRole('button',{name:t.next,exact:true}).click();await p.waitForFunction(()=>document.querySelector('tbody').children.length===1);assert.equal(posts.length,1);
   await p.screenshot({path:path.join(output,`${language}-${width}-rows.png`),fullPage:true});
   await p.getByLabel(t.search,{exact:true}).fill('none');await p.getByRole('button',{name:translations[language].common.search,exact:true}).click();await p.getByText(t.empty,{exact:true}).waitFor();assert.equal(posts.length,1);
   await p.screenshot({path:path.join(output,`${language}-${width}.png`),fullPage:true});check(`${language} ${width}: range, exact account, paging, search, responsive`);
  }
  for(const failure of ['ACCOUNT_BUSY','REPORT_INCOMPLETE','CAPTCHA_REQUIRED','REPORT_TIMEOUT','429','403','404','empty','queued']){
   await render();mode=failure;await p.locator('select').selectOption('account-a');
   if(failure==='empty')await p.getByText(translations.en.providerReport.empty,{exact:true}).waitFor();
   else if(failure==='queued'){await p.getByText(translations.en.providerReport.queued,{exact:true}).waitFor();await p.waitForTimeout(2200);assert.equal(posts.length,1);assert.equal(await p.getByRole('button',{name:translations.en.common.refresh,exact:true}).isDisabled(),true);}
   else {await p.locator('[role=alert]').waitFor();assert.equal(await p.locator('tbody').count(),0);}
   check(failure+' has explicit state without substitute or false empty success');
  }
  await render();mode='race';await p.locator('select').selectOption('account-a');while(!releaseA)await p.waitForTimeout(10);
  await p.locator('select').selectOption('account-b');await p.locator('tbody').getByText(/account-b/).first().waitFor();releaseA();await p.waitForTimeout(250);
  assert.equal(await p.locator('tbody').getByText(/account-a/).count(),0);check('late account A response cannot replace account B');
  await render();await p.locator('select').selectOption('account-a');await p.locator('tbody').waitFor();
  await p.evaluate(()=>window.setLanguage('ar'));await p.getByRole('heading',{name:translations.ar.providerReport.title}).waitFor();assert.equal(posts.length,1);check('live language switch retains data without a new provider read');
  await render();const t=translations.en.providerReport;
  await p.getByLabel(t.findAccount,{exact:true}).fill('dealer-b');assert.equal(await p.locator('option[value="account-a"]').count(),0);
  await p.getByLabel(t.from,{exact:true}).fill('2025-01-01');await p.getByLabel(t.to,{exact:true}).fill('2025-01-31');
  await p.getByLabel(t.account,{exact:true}).selectOption('account-b');await p.locator('tbody').waitFor();
  assert.deepEqual(posts[0],{accountId:'account-b',from:'2025-01-01',to:'2025-01-31'});
  await p.getByLabel(t.search,{exact:true}).fill('none');await p.getByLabel(t.search,{exact:true}).press('Enter');await p.getByText(t.empty,{exact:true}).waitFor();assert.equal(posts.length,1);
  await p.getByRole('button',{name:translations.en.common.refresh,exact:true}).focus();await p.keyboard.press('Enter');await p.locator('tbody').waitFor();assert.equal(posts.length,2);check('account search, earlier month and keyboard search/refresh');
  await p.getByLabel(t.to,{exact:true}).fill('2025-02-01');await p.getByRole('button',{name:translations.en.common.refresh,exact:true}).click();await p.getByText(t.errors.VALIDATION_ERROR,{exact:true}).waitFor();assert.equal(posts.length,2);check('overlong date range stops locally without another request');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:results.length,results},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
