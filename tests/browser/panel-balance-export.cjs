/* eslint-disable @typescript-eslint/no-require-imports -- Isolated baseline comparison. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const esbuild = require('esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = process.cwd();
const out = process.env.PANEL_QA_OUTPUT || path.join(repo, 'output', 'panel-ui');
const renderPdf = process.env.PANEL_QA_EXPORT_RENDER === '1';
const file = 'src/components/admin/report-center/BalanceMovementsReportPanel.tsx';
const baselineCommit = '4a2833e48a0ca033cbf0b9c6fc0faab080275da9';
const baseline = execFileSync('git', ['show', baselineCommit + ':' + file], {encoding:'utf8'});
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import Report from 'audit-report';import {useStore} from '@/store/useStore';
import {balanceMovementData} from './tests/browser/fixtures/panel-financial-report-data';
useStore.setState({language:window.audit.language});window.requests=[];
window.fetch=async(url)=>{if(!String(url).startsWith('/api/admin/reports/balance-movements?'))throw new Error('UNEXPECTED_FIXTURE_HTTP');window.requests.push(String(url));return Response.json(balanceMovementData(url,window.audit.count));};
createRoot(document.getElementById('root')).render(<Report/>);`;
async function bundle(source, isBaseline = false) {
 return (await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^(audit-report|next\/navigation|html-to-image|jspdf)$/},a=>a.path==='jspdf'&&!renderPdf?undefined:({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:repo,contents:a.path==='audit-report'?source:a.path==='jspdf'?`import {jsPDF as RealPDF} from 'jspdf/dist/jspdf.es.min.js';export class jsPDF {constructor(...args){const pdf=new RealPDF(...args);pdf.save=()=>{window.pdfSummary={pages:pdf.getNumberOfPages(),width:pdf.internal.pageSize.getWidth(),height:pdf.internal.pageSize.getHeight()};window.pdfDataUri=pdf.output('datauristring');};return pdf;}}`:a.path==='html-to-image'?(renderPdf?`import {toPng as realPng} from 'html-to-image/lib/index.js';export const toPng=async(node,options)=>{window.pdfElement=node;window.pdfOptions=options;window.surface={html:node.innerHTML,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height};const stats=async png=>{const img=new Image();img.src=png;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let visible=0;for(let i=0;i<pixels.length;i+=16)if(pixels[i+3]>0&&(pixels[i]!==2||pixels[i+1]!==6||pixels[i+2]!==23))visible++;return visible;};
if(${isBaseline})window.baselineOriginalVisibleSamples=await stats(await realPng(node,options));
const captureOptions=${isBaseline}?{...options,style:{position:'static',left:'auto',top:'auto'}}:options;
window.pdfImage=await realPng(node,captureOptions);window.visibleSamples=await stats(window.pdfImage);return window.pdfImage;};`:`export const toPng=(node,options)=>{window.pdfElement=node;window.pdfOptions=options;return new Promise(()=>{});};`):`const params=new URLSearchParams();const router={replace:()=>{}};export const useRouter=()=>router;export const usePathname=()=>'/dashboard/admin/reports';export const useSearchParams=()=>params;`}));
 }}]})).outputFiles[0].text;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const bundles = {baseline:await bundle(baseline,true),current:await bundle(fs.readFileSync(file,'utf8'))};
 const css=(await require('postcss')([require('@tailwindcss/postcss')({base:repo})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.join(repo,'src/app/globals.css')})).css;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const results=[];const errors=[];
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).pathname==='/'?r.fulfill({contentType:'text/html',body:'<!doctype html><html class="dark"><style>'+css+'</style><div id="root"></div></html>'}):r.abort());
  for(const language of ['ar','en','bn'])for(const count of [2,25]) {
   const captures={};
   for(const mode of ['baseline','current']) {
    await page.goto('http://audit.invalid/');
    await page.evaluate(config=>{window.audit=config;document.documentElement.dir=config.language==='ar'?'rtl':'ltr';document.documentElement.lang=config.language;}, {language,count});
    await page.addScriptTag({content:bundles[mode]});
    await page.getByRole('button',{name:/^(Download PDF|تنزيل PDF|PDF ডাউনলোড)$/}).click();
    await page.waitForFunction(()=>!!window.pdfElement);
    if(renderPdf) {
     await page.waitForFunction(()=>!!window.pdfSummary,{},{timeout:60000}).catch(async error=>{console.error('PDF RENDER FAILURE',await page.locator('body').innerText(),await page.evaluate(()=>({image:!!window.pdfImage})));throw error});
     const result=await page.evaluate(()=>({surface:window.surface,summary:window.pdfSummary,png:window.pdfImage,pdf:window.pdfDataUri,visibleSamples:window.visibleSamples,baselineOriginalVisibleSamples:window.baselineOriginalVisibleSamples}));
     assert.ok(result.visibleSamples>1000,'PDF must contain visible text/table pixels');
     if(mode==='baseline')assert.equal(result.baselineOriginalVisibleSamples,0,'checkpoint offscreen-root defect must reproduce');
     captures[mode]={...result.surface,pdfWidth:result.summary.width,pdfHeight:result.summary.height,pages:result.summary.pages,pngHash:require('node:crypto').createHash('sha256').update(result.png).digest('hex')};
     fs.writeFileSync(path.join(out,`balance-${mode}-${language}-${count}.pdf`),Buffer.from(result.pdf.split(',')[1],'base64'));
     if(mode==='current'&&language==='ar'&&count===2)fs.writeFileSync(path.join(out,'balance-export-render.png'),Buffer.from(result.png.split(',')[1],'base64'));
     continue;
    }
    captures[mode]=await page.evaluate(()=>({html:window.pdfElement.innerHTML,width:window.pdfElement.getBoundingClientRect().width,height:window.pdfElement.getBoundingClientRect().height,options:window.pdfOptions,request:window.requests.find(url=>url.includes('export=all'))}));
    if(mode==='current') {
     assert.equal(await page.evaluate(()=>window.pdfElement.querySelectorAll('[data-panel-table]').length),0);
     await page.evaluate(()=>{document.documentElement.style.setProperty('--panel-table-compact-cell-inline','60px');document.documentElement.style.setProperty('--panel-table-compact-cell-block','40px');});
     assert.equal(await page.evaluate(()=>window.pdfElement.getBoundingClientRect().height),captures[mode].height);
    }
   }
   if(!renderPdf){assert.deepEqual(captures.current.options.style,{position:'static',left:'auto',top:'auto'});captures.baseline.options.style=captures.current.options.style;}
   assert.deepEqual(captures.current,captures.baseline,'export parity '+language+' '+count);
   results.push({language,count,width:captures.current.width,height:captures.current.height,...(renderPdf?{pages:captures.current.pages,pngHash:captures.current.pngHash}:{})});
   console.log('PASS baseline PDF '+(renderPdf?'actual PNG and PDF page parity ':'DOM, content, geometry and token isolation ')+language+' '+count);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,renderPdf?'panel-balance-pdf-render-verification.json':'panel-balance-export-verification.json'),JSON.stringify({baselineCommit,results,errors,boundary:renderPdf?'Actual html-to-image/jsPDF with synthetic data. Untouched checkpoint reproduces blank pixels; reference changes only clone positioning to static/auto/auto. Current nonblank pixels/content/geometry and PDF pages match that corrected baseline. Files saved locally.':'Synthetic source-surface capture. Rasterization/PDF pagination are unchanged but not invoked by this harness.'},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
