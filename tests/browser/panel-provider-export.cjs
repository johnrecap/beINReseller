/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic provider-document compatibility. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{execFileSync}=require('node:child_process'),esbuild=require('esbuild');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.cwd(),out=process.env.PANEL_QA_OUTPUT||path.join(repo,'output/panel-ui');
const baselineCommit='4a2833e48a0ca033cbf0b9c6fc0faab080275da9',file='src/components/renewal/BeINExportTable.tsx';
const baseline=execFileSync('git',['show',baselineCommit+':'+file],{encoding:'utf8'});
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Table from'audit-provider';import{toPng}from'html-to-image';
const contracts=['Active','Expired','Cancelled'].map((status,i)=>({type:'Package',status,package:'Synthetic long package باقة পরীক্ষা '+i,startDate:'01/01/2026',expiryDate:'01/01/2027',invoiceNo:'SYNTHETIC-'+i}));
createRoot(document.getElementById('root')).render(<Table cardNumber='0000000000' contracts={contracts}/>);
window.capture=async()=>{const node=document.querySelector('[data-export-table]');const rect=node.getBoundingClientRect();return{html:node.innerHTML,width:rect.width,height:rect.height,png:await toPng(node,{backgroundColor:'#ffffff',pixelRatio:2,cacheBust:true})}};`;
async function bundle(source){return(await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'provider',setup(b){b.onResolve({filter:/^audit-provider$/},()=>({path:'provider',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'tsx',resolveDir:repo,contents:source}));}}]})).outputFiles[0].text}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const bundles={baseline:await bundle(baseline),current:await bundle(fs.readFileSync(file,'utf8'))};
 const css=(await require('postcss')([require('@tailwindcss/postcss')({base:repo})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.join(repo,'src/app/globals.css')})).css;
 const browser=await chromium.launch({channel:'chrome',headless:true});const results=[],errors=[];
 try{
  const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>new URL(r.request().url()).pathname==='/'?r.fulfill({contentType:'text/html',body:'<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div></html>'}):r.abort());
  for(const language of ['ar','en','bn'])for(const width of [360,390,768,1280,1440]){
   const captures={};await p.setViewportSize({width,height:800});
   for(const mode of ['baseline','current']){
    await p.goto('http://audit.invalid/');await p.evaluate(language=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr'},language);
    await p.addScriptTag({content:bundles[mode]});await p.locator('[data-export-table]').waitFor({state:'attached'});
    const capture=await p.evaluate(()=>window.capture());
    captures[mode]={html:capture.html,width:capture.width,height:capture.height,pngHash:crypto.createHash('sha256').update(capture.png).digest('hex')};
    if(mode==='current'&&language==='ar'&&width===360)fs.writeFileSync(path.join(out,'provider-export-render.png'),Buffer.from(capture.png.split(',')[1],'base64'));
   }
   assert.deepEqual(captures.current,captures.baseline,'provider exported content and pixels '+language+' '+width);assert.equal(captures.current.width,850);
   results.push({language,viewport:width,width:captures.current.width,height:captures.current.height,pngHash:captures.current.pngHash});console.log('PASS provider export raster/content parity '+language+' '+width);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'panel-provider-export-verification.json'),JSON.stringify({baselineCommit,results,errors,boundary:'Synthetic document and real html-to-image capture with the same options as SignalRefreshFlow. No provider connection or production data.'},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
