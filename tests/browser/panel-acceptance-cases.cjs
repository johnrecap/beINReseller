/* eslint-disable @typescript-eslint/no-require-imports -- Isolated responsive acceptance. */
const assert=require('node:assert/strict');
module.exports=async function acceptance({p,render,check}) {
 p.on('pageerror',error=>console.error('ACCEPTANCE PAGE ERROR',error.message));
 const views=['logs','agents','adminCredit','requestCredit','agentDashboard','permissions','analytics','activityReport','balanceMonitor','loginMonitor','integrity','balanceReport','creditReport','pointsReport','spendReport','activeOperations','review'];
 for(const view of views)for(const language of ['ar','en','bn']) {
  await render({view,language,financialReports:true,reactiveNavigation:true},640);
  await p.waitForFunction(()=>document.querySelector('main tbody tr, main article'));
  // A 1280x600 display at 200% has a 640x300 CSS layout viewport.
  // CSS zoom alone preserves desktop media queries and is not browser zoom.
  await p.setViewportSize({width:640,height:300});
  await p.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' zoom overflow');
  assert.equal(await p.locator('main').innerText().then(text=>text.includes('undefined')),false);
  await p.keyboard.press('Tab');
  assert.ok(await p.evaluate(()=>document.activeElement!==document.body),'keyboard focus must reach a control');
  if(['permissions','balanceReport','review'].includes(view)&&language==='ar') {
   await p.setViewportSize({width:390,height:800});
   await p.screenshot({path:require('node:path').join(process.env.PANEL_QA_OUTPUT||'output/panel-ui','fix-'+view+'-ar.png'),fullPage:false});
  }
  check(view+' 200% equivalent layout viewport, short window and keyboard entry '+language);
 }
};
