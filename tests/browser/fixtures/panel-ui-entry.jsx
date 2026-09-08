import {usePanelCommand} from '@/hooks/usePanelRequest';
import {operationsPayload} from './tests/browser/fixtures/panel-operations-data';
import {financialReportData} from './tests/browser/fixtures/panel-financial-report-data';
import Logs from '@/components/admin/LogsTable';
import Agents from '@/components/admin/agents/AdminAgentsClient';
import AdminCredit from '@/components/admin/credit-requests/AdminCreditRequestsClient';
import RequestCredit from '@/components/credit-requests/RequestCreditForm';
import AgentDashboard from '@/components/agent/AgentDashboardClient';
import Permissions from '@/components/admin/permissions/AdminPermissionsClient';
import Analytics from '@/components/admin/report-center/AnalyticsReportPanel';
import ActivityReport from '@/components/admin/report-center/ActivityReportPanel';
import BalanceMonitor from '@/components/admin/report-center/BalanceMonitorPanel';
import LoginMonitor from '@/components/admin/report-center/LoginMonitorPanel';
import IntegrityReport from '@/components/admin/report-center/IntegrityReportPanel';
import EidPopup from '@/components/eid-rewards/EidRewardPopup';
import FinancialReview from '@/components/admin/financial-review/FinancialReviewClient';
import {reviewData} from './tests/browser/fixtures/panel-review-data.js';
import Proxies from '@/app/dashboard/admin/proxies/page';
import ActiveOperations from '@/app/dashboard/operations/active/page';
import Installments from '@/components/renewal/InstallmentPaymentFlow';
import CreditControl from '@/components/admin/users/CreditControlDialog';
import TransferAgent from '@/components/admin/users/TransferToAgentDialog';
import ResetPassword from '@/components/users/ResetPasswordDialog';
import Ownership from '@/components/admin/users/TransferOwnershipDialog';
import {CreateUserDialog as ManagerCreate} from '@/components/manager/CreateUserDialog';
import UserStats from '@/components/admin/users/UserStatsDialog';
import {InactiveUsersTable} from '@/components/admin/InactiveUsersTable';
import {ar,en,bn} from '@/i18n/translations';
/* Synthetic browser-only fixture. All HTTP is intercepted; never import into runtime code. */
import AdminDeleted from '@/components/admin/users/DeletedUsersTable';import ManagerDeleted from '@/components/manager/ManagerDeletedUsersTable';
import CreditReport from '@/components/admin/report-center/CreditPaymentsReportPanel';import PointsReport from '@/components/admin/report-center/PointsAnalysisReportPanel';import SpendReport from '@/components/admin/reports/BeinSpendReportClient';
import ExportTable from '@/components/renewal/BeINExportTable';import Contracts from '@/components/renewal/ContractsTable';import AddBalance from '@/components/admin/users/AddBalanceDialog';import ManagerBalance from '@/components/manager/users/ManagerAddBalanceDialog';import CreateUser from '@/components/admin/users/CreateUserDialog';import BalanceReport from '@/components/admin/report-center/BalanceMovementsReportPanel';

import React from 'react';import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';import {PanelTablePagination} from '@/components/ui/PanelTableControls';import{createRoot}from'react-dom/client';import Login from'@/components/auth/LoginPageClient';import Shell from'@/components/layout/DashboardShell';import Transactions from'@/components/transactions/TransactionsTable';import Operations from'@/components/history/OperationsTable';import{useStore}from'@/store/useStore';
import HistoryPage from '@/components/history/HistoryPageClient';import AdminUsers from '@/components/admin/users/UsersTable';import ManagerUsers from '@/components/manager/users/ManagerUsersTable';import EditUser from '@/components/admin/users/EditUserDialog';import BeinAccounts from '@/app/dashboard/admin/bein-accounts/page';const c=window.audit;useStore.setState({language:c.language});document.documentElement.dir=c.language==='ar'?'rtl':'ltr';document.documentElement.lang=c.language;
function statsPayload(id, moreTx, moreOp) {
 const tx=n=>({id:id+'-tx-'+n,type:'DEPOSIT',amount:10,balanceAfter:100,notes:id+' note '+n,createdAt:'2026-09-08T00:00:00Z',operationId:null});
 const op=n=>({id:id+'-op-'+n,type:'RENEW',cardNumber:'000000000'+n,amount:10,status:'COMPLETED',responseMessage:'Synthetic result '+id,createdAt:'2026-09-08T00:00:00Z',completedAt:'2026-09-08T00:00:01Z'});
 return {user:{id,username:id,email:id+'@example.invalid',isActive:true,createdAt:'2026-01-01T00:00:00Z'},financials:{totalDeposits:100000.25,totalDeductions:200,totalRefunds:10,totalWithdrawals:5,totalCorrections:0,expectedBalance:90,actualBalance:100,discrepancy:10,isBalanceValid:false,completedSpent:100,netSpent:95},operations:{total:3,completed:3,failed:0,cancelled:0,pending:0,processing:0},alerts:[{type:'BALANCE_MISMATCH',message:'Synthetic discrepancy',severity:'high'}],refundSummary:{doubleRefunds:0,phantomRefunds:0,overRefunds:0},recentTransactions:moreTx?[tx(2),tx(3)]:[tx(1),tx(2)],recentOperations:moreOp?[op(2),op(3)]:[op(1),op(2)],pagination:{transactions:{total:3,limit:2,skip:moreTx?2:0,hasMore:!moreTx},operations:{total:3,limit:2,skip:moreOp?2:0,hasMore:!moreOp}}};
}
function StatsFixture(){const[id,setId]=React.useState('stats-a');React.useEffect(()=>{window.switchStatsUser=()=>setId('stats-b');return()=>{delete window.switchStatsUser}},[]);return <UserStats isOpen userId={id} username={id} onClose={()=>window.panelClosed=true} statsEndpoint={c.managerStats?'/api/manager/users/'+id+'/stats':undefined} canCorrectBalance={!c.managerStats}/>}
function InactiveFixture(){const[filters,setFilters]=React.useState({days:30,sortBy:'lastLogin',sortOrder:'desc'});const[page,setPage]=React.useState(1);return <InactiveUsersTable users={[{id:'inactive',username:'synthetic-inactive',email:'long-synthetic-email@example.invalid',role:'USER',lastLoginAt:new Date('2026-07-01T00:00:00Z'),lastOperationAt:null,daysSinceLastActivity:69,loginCount:12,totalOperations:31,activityStatus:'critical',createdAt:new Date('2026-01-01T00:00:00Z')}]} total={21} page={page} limit={10} totalPages={3} filters={filters} onFiltersChange={delta=>{window.filterChanges.push(delta);setFilters(old=>({...old,...delta}));setPage(1)}} onPageChange={setPage} onViewUser={id=>window.viewedUser=id}/>}
window.routes=[];window.requests=[];window.qaText={ar,en,bn}[c.language];window.filterChanges=[];window.auditAlerts=[];window.alert=m=>window.auditAlerts.push(String(m));
if(c.manualHandoff){window.opened=[];window.copied=[];window.open=(url)=>{const item={location:{href:url},close:()=>{item.closed=true}};window.opened.push(item);return item;};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied.push(text)}}});}
if(c.view==='activeOperations'||c.beinPositive||c.view==='proxies')window.confirm=()=>true;
if(c.view==='eid'){sessionStorage.removeItem('eid-reward-popup-hidden');if(c.eidRemembered)sessionStorage.setItem('eid-reward-popup-hidden','redeemed');}
window.fetch=async(url,o={})=>{
window.requests.push({url:String(url),method:o.method||'GET',body:o.body?JSON.parse(o.body):null});
if(c.beinPositive&&(!o.method||o.method==='GET')){
 if(String(url)==='/api/admin/proxies'){if(c.beinProxyError)return Response.json({error:'Synthetic denied'},{status:c.beinProxyError});return Response.json({success:true,proxies:[]});}
 if(String(url)==='/api/admin/bein-accounts'){
  if(c.beinReadError)return Response.json({error:'Synthetic denied'},{status:c.beinReadError});
  return Response.json({success:true,accounts:[{id:'synthetic-bein',username:'synthetic-bein-user',label:'Synthetic beIN account',isActive:true,priority:1,customerOnly:false,automationExclusive:true,lastUsedAt:null,usageCount:3,cooldownUntil:null,consecutiveFailures:0,totalFailures:0,totalSuccess:3,successRate:100,lastError:null,lastErrorAt:null,createdAt:'2026-09-08T00:00:00Z',operationsCount:3,dealerBalance:123.45,balanceUpdatedAt:'2026-09-08T00:00:00Z',proxyId:null,hasTotpSecret:true,lockStatus:{locked:true,stale:true,ownerWorkerId:'synthetic-worker',ownerOperationId:'synthetic-operation',ageSeconds:120,ttlSeconds:60,legacy:false}}],poolStatus:{totalAccounts:1,activeAccounts:1,availableNow:0,inCooldown:0,rateLimited:0}});
 }
}
if(c.view==='eid') {
 if(String(url).startsWith('/assets/eid-rewards/'))return Response.json({}, {status:404});
 if(String(url)==='/api/eid-rewards/status'){
  if(c.eidReadHang)return new Promise(()=>{});
  if(c.eidReadError)return Response.json({error:'Synthetic error'},{status:c.eidReadError});
  const fallback=({ar,en,bn}[c.language]||en).panelUi.eidPopup;
  return Response.json({enabled:true,active:!c.eidInactive,eligible:!c.eidClaimed&&!c.eidInactive,alreadyClaimed:!!c.eidClaimed,claimPolicy:'ONCE_PER_EVENT',pointsBalance:90,canRedeem:true,minRedeemPoints:1,conversion:{enabled:!c.eidNoConversion,previewAmount:9,currencyLabel:'USD'},popup:{show:true,allowLaterDismiss:true,closeDelaySeconds:0,beforeText:'Synthetic configured introduction',afterText:'Synthetic configured after text',...(c.eidConfigured?{texts:{...fallback,title:'Synthetic configured title',beforeText:'Synthetic configured introduction',afterText:'Synthetic configured after text',genericErrorText:'Synthetic configured error'}}:{})},message:null});
 }
 if(String(url)==='/api/eid-rewards/claim'||String(url)==='/api/eid-rewards/redeem'){
  if(c.holdWrite)await new Promise(resolve=>window.releaseWrite=resolve);
  if(c.eidWriteError)return Response.json({error:'Synthetic failure'},{status:c.eidWriteError});
  if(String(url).endsWith('/claim')){c.eidClaimed=true;return Response.json({claim:{id:'synthetic-claim',points:90,moneyValue:9,eventKey:'synthetic-event'},pointsBalance:90,conversion:{enabled:!c.eidNoConversion,previewAmount:9,currencyLabel:'USD',canRedeem:true},message:'Synthetic success'});}
  return Response.json({success:true});
 }
}
if(c.view==='review'&&String(url).startsWith('/api/admin/financial-review?')) {
 const query=new URL(String(url),'http://audit.invalid').searchParams;
 if(c.reviewRace&&query.get('q')==='old')await new Promise(resolve=>setTimeout(resolve,650));
 if(c.reviewError)return Response.json({error:'Synthetic failure'},{status:c.reviewError});
 return Response.json(reviewData(query,c));
}
if(c.view==='installments') {
 if(String(url)==='/api/user/stats') return Response.json({balance:1000});
 if(String(url)==='/api/operations/start-installment') {
  if(c.installmentStartHang)return new Promise(()=>{});
  if(c.installmentStartStatus)return Response.json({error:'Synthetic start failure'},{status:c.installmentStartStatus});
  await new Promise(resolve=>setTimeout(resolve,100));
  return Response.json({operationId:'synthetic-installment'});
 }
 if(String(url)==='/api/operations/synthetic-installment/confirm-installment') {
  if(c.installmentConfirmHang)return new Promise(()=>{});
  if(c.holdWrite)await new Promise(resolve=>window.releaseWrite=resolve);
  if(c.installmentConfirmStatus)return Response.json({error:'Synthetic confirmation failure'},{status:c.installmentConfirmStatus});
  c.installmentStatus=c.installmentAfterConfirm||'COMPLETING';
  return Response.json({success:true});
 }
 if(String(url)==='/api/operations/synthetic-installment/installment') {
  if(c.installmentReadHang)return new Promise(()=>{});
  if(c.installmentReadStatus)return Response.json({error:'Synthetic denied'},{status:c.installmentReadStatus});
  return Response.json({status:c.installmentStatus||'AWAITING_FINAL_CONFIRM',message:c.installmentMessage,finalConfirmExpiry:c.installmentInvalidExpiry?'invalid':new Date(Date.now()+(c.installmentExpired?-10000:3600000)).toISOString(),installment:{package:'Synthetic long package name for readability',monthsToPay:'2',installment1:50,installment2:50,contractStartDate:'01/01/2026',contractExpiryDate:'01/01/2027',invoicePrice:100,dealerPrice:90},subscriber:{name:'Synthetic subscriber',email:'synthetic@example.invalid',mobile:'0000000000',city:'Synthetic city',country:'Synthetic country',homeTel:'-',workTel:'-',fax:'-',stbModel:'Synthetic STB',address:'Synthetic long address for browser layout',remarks:'Synthetic remarks'}});
 }
}
if(String(url).includes('/stats?')) {
 const u=new URL(String(url),'http://audit.invalid');const id=u.pathname.split('/').at(-2);
 await new Promise(r=>setTimeout(r,c.statsRace&&id==='stats-a'?600:200));
 if(c.statsError)return Response.json({error:'Synthetic denied'},{status:c.statsError});
 return Response.json(statsPayload(id,Number(u.searchParams.get('txSkip'))>0,Number(u.searchParams.get('opSkip'))>0));
}
if(c.view==='proxies'&&String(url)==='/api/admin/proxies/import'&&JSON.parse(o.body||'{}').mode==='preview')return Response.json({success:true,summary:{totalLines:1,blankLines:0,validCount:1,duplicateCount:0,invalidCount:0,nextLabelStart:1},validRows:[{lineNumber:1,host:'192.0.2.10',port:8080,username:'synthetic',hasPassword:true,label:'Synthetic import'}],duplicates:[],invalidRows:[]});
if(c.commandHang && ['PATCH','POST','PUT','DELETE'].includes(o.method))return new Promise(()=>{});
if(c.commandBodyHang && ['PATCH','POST','PUT','DELETE'].includes(o.method))return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));}}));
if(c.commandBadBody && ['PATCH','POST','PUT','DELETE'].includes(o.method))return new Response('{');
if(c.writeFailure && ['PATCH','POST','PUT','DELETE'].includes(o.method)){if(c.holdWrite)await new Promise(resolve=>window.releaseWrite=resolve);else await new Promise(r=>setTimeout(r,350));return Response.json({error:'Synthetic rejection'},{status:c.writeStatus||500});}
if(c.writeSuccess && ['PATCH','POST','PUT','DELETE'].includes(o.method)) return Response.json({success:true,...(c.beinPositive||c.view==='proxies'?{balance:222,result:{ip:'192.0.2.10'}}:{}),user:{id:'synthetic-created'},...(c.manualHandoff&&String(url).endsWith('/decision')&&JSON.parse(o.body).decision==='APPROVE'?{whatsappHandoff:{id:'synthetic-handoff',destinationLabel:'Synthetic group',groupUrl:'https://example.invalid/group',phone:'0000000000',phoneUrl:'https://example.invalid/user',messageText:'Synthetic message only',groupOpenAvailable:true,phoneOpenAvailable:true,createdAt:'2026-09-08T00:00:00Z'}}:{})});
const opsPayload=financialReportData(url,c)||operationsPayload(url,c);
if(opsPayload && (!o.method || o.method==='GET')) {
 if(c.opsHang)return new Promise(()=>{});
 const search=new URL(String(url),'http://audit.invalid').searchParams.get('search');
 const period=new URL(String(url),'http://audit.invalid').searchParams.get('days');
 if(c.creditRace&&String(url)==='/api/credit-debts/test')await new Promise(resolve=>window.releaseCreditRead=resolve);
 else await new Promise(r=>setTimeout(r,c.opsRace&&(search==='old'||period==='7')?1500:100));
 if(c.opsError)return Response.json({error:'Synthetic denied'},{status:c.opsError});
 return Response.json(opsPayload);
}
if(c.reportError && String(url).includes('/api/admin/reports/')) {await new Promise(r=>setTimeout(r,350));return Response.json({error:'Synthetic denied'},{status:c.reportError});}
if(c.view==='activeOperations'&&String(url).endsWith('/installment')) {
 const id=String(url).split('/').at(-2);
 if(c.holdDetail&&id==='synthetic-detail-a')await new Promise(resolve=>window.releaseDetail=resolve);
 if(c.detailError)return Response.json({error:'Synthetic rejected'},{status:c.detailError});
 return Response.json({status:c.detailStatus||'AWAITING_FINAL_CONFIRM',installment:c.detailMissing?null:{package:id,monthsToPay:'1',installment1:20,installment2:0,contractStartDate:'2026-01-01',contractExpiryDate:'2027-01-01',invoicePrice:25,dealerPrice:20},finalConfirmExpiry:new Date(Date.now()+(c.detailExpired?-1000:3600000)).toISOString()});
}
if(c.view==='activeOperations'&&String(url).includes('/api/operations?')) {
 if(c.opsHang)return new Promise(()=>{});
 if(c.opsError)return Response.json({error:'Synthetic denied'},{status:c.opsError});
 const statuses=['PENDING','PROCESSING','AWAITING_CAPTCHA','AWAITING_PACKAGE','AWAITING_FINAL_CONFIRM','COMPLETING','REVIEW_REQUIRED','COMPLETED'];
 const operations=statuses.map((status,i)=>({id:'synthetic-op-'+i,cardNumber:'000000000'+i,status,type:'RENEW',amount:20,createdAt:new Date(Date.now()-10000).toISOString(),updatedAt:new Date().toISOString(),responseMessage:null,selectedPackage:status==='AWAITING_FINAL_CONFIRM'?{index:0,name:'Synthetic package',price:20,checkboxSelector:'#synthetic',quoteRevision:3}:null,finalConfirmExpiry:new Date(Date.now()+3600000).toISOString(),providerPaymentState:status==='COMPLETING'||status==='REVIEW_REQUIRED'?'CHARGED':'NOT_SUBMITTED',fulfillmentState:status==='COMPLETING'?'VERIFYING':'UNVERIFIED'}));
 if(c.activeDetails)for(const suffix of ['a','b'])operations.push({...operations[4],id:'synthetic-detail-'+suffix,cardNumber:'detail-'+suffix,selectedPackage:null,type:'PAY_INSTALLMENT',...(suffix==='a'&&c.detailListStatus?{status:c.detailListStatus}:{})});
 operations.push({...operations[4],id:'synthetic-expired',cardNumber:'0000000009',finalConfirmExpiry:new Date(Date.now()-10000).toISOString()});
 return Response.json({operations,total:operations.length,totalPages:1});
}
if(String(url).includes('/api/operations?')) {
 const q=new URL(String(url),'http://audit.invalid').searchParams;
 if(c.race&&q.get('cardNumber')==='old') await new Promise(r=>setTimeout(r,700));
 return new Response(JSON.stringify({operations:[{id:'test',type:'RENEW',cardNumber:q.get('cardNumber')||'0000000000',amount:1,status:'REVIEW_REQUIRED',createdAt:'2026-09-08T00:00:00Z',messageKey:'operations.refundSettlementPending',settlementState:'REFUND_PENDING',nextAction:'CONTACT_ADMIN'}],totalPages:2,total:11}));
}
if(String(url).includes('/api/admin/users/counts')) return Response.json({users:1,agents:1,distributors:1,totalBalance:1});
if(String(url).includes('/api/admin/users?')) {const q=new URL(String(url),'http://audit.invalid').searchParams;const role=q.get('roleFilter');return Response.json({users:[{id:'test',username:'synthetic-'+role,email:'long-synthetic-address@example.invalid',role:role==='distributors'?'MANAGER':role==='agents'?'AGENT':'USER',balance:12345.67,isActive:true,createdAt:'2026-01-01T00:00:00Z',lastLoginAt:'2026-09-01T00:00:00Z',managedUsersCount:2,assignedUsersCount:3,currentOwner:{type:'ADMIN',id:'owner',label:'Synthetic owner',isLegacyFallback:false,hasConflict:false,conflictCount:0,ownershipToken:'synthetic',agentAssignment:null},profile:{displayName:'Synthetic agent',defaultSourceGroup:'Synthetic group',whatsappHandoffGroupUrl:'',isActive:true},operationCount:23,transactionCount:31,points:{available:1,lifetimeEarned:2,converted:1,reversed:0,legacy:0}}],totalPages:1,capabilities:{canResetPasswords:true}});}
if(String(url).includes('/users/deleted?')) {
 const q=new URL(String(url),'http://audit.invalid').searchParams;
 if(c.deletedError) return Response.json({error:'Synthetic denied'},{status:c.deletedError});
 return Response.json({users:[{id:'deleted',username:'synthetic-deleted',email:'long-synthetic-address@example.invalid',role:'USER',deletedBalance:12345.67,deletedAt:'2026-09-08T00:00:00Z',createdAt:'2026-01-01T00:00:00Z',operationCount:31,transactionCount:12,deletedByUsername:'synthetic-admin'}],totalPages:c.clampDeleted&&q.get('page')==='2'?1:2});
}
if(c.managerError&&String(url).includes('/api/manager/users'))return Response.json({error:'test'},{status:c.managerError});
if(c.loginFeedbackHang&&String(url).includes('login-attempt-status'))return new Promise(()=>{});

if(String(url).includes('/api/manager/users')){const p=new URL(String(url),'http://audit.invalid').searchParams;return new Response(JSON.stringify({users:p.get('search')&&p.get('page')!=='1'?[]:[{id:'test',username:'synthetic-user',email:'audit@example.invalid',role:'USER',balance:1,isActive:true,createdAt:'2026-09-08T00:00:00Z'}],totalPages:p.get('search')?1:2,total:p.get('search')?1:11}));} if(String(url).includes('/api/admin/bein-accounts'))return new Response(JSON.stringify({success:true,accounts:[],poolStatus:null}));if(String(url).includes('/api/admin/proxies'))return new Response(JSON.stringify({success:true,proxies:[]}));if(String(url).includes('login-attempt-status'))return new Response(JSON.stringify({status:'invalid_credentials',remainingAttempts:3}));
if(String(url).includes('/api/notifications'))return new Response(JSON.stringify(o.method==='PUT'?{error:'unavailable'}:{notifications:[{id:'test',title:'Audit notification',message:'Synthetic content',read:false,type:'info',createdAt:'2026-09-08T00:00:00Z'}],unreadCount:1}),{status:o.method==='PUT'?500:200});
if(String(url).includes('/api/transactions'))return new Response(JSON.stringify(c.transactionError?{error:'unavailable'}:{transactions:[{id:'test',type:'DEPOSIT',amount:1,balanceBefore:0,balanceAfter:1,createdAt:'2026-09-08T00:00:00Z',notes:'Synthetic entry'}],totalPages:2,total:11,stats:{currentBalance:1,totalDeposits:1,totalDeductions:0}}),{status:c.transactionError?500:200});
return new Response(JSON.stringify({enabled:false}));};
function CreditFixture(){const [id,setId]=React.useState('test');React.useEffect(()=>{window.switchCreditUser=()=>setId('credit-b');return()=>delete window.switchCreditUser},[]);return <CreditControl isOpen userId={id} username={id} onClose={()=>window.panelClosed=(window.panelClosed||0)+1} onSuccess={()=>window.saved=true}/>;}
function DialogLauncher(){const [open,setOpen]=React.useState(false);return <><button id='dialog-opener' onClick={()=>setOpen(true)}>Open synthetic dialog</button>{open&&<AddBalance isOpen userId='test' username='synthetic' onClose={()=>setOpen(false)} onSuccess={()=>{}}/>}</>}
function CommandFixture(){const[id,setId]=React.useState('a');const api=usePanelCommand(id);React.useEffect(()=>{window.commandHarness={...api,switchId:setId};},[api]);return <div data-command-uncertain={api.unconfirmed} data-command-keys={[...api.uncertainKeys].join(',')}>Synthetic command fixture</div>}
createRoot(document.getElementById('root')).render(c.view==='login'?<Login revoked={c.revoked} unavailable={c.unavailable}/>:<Shell>{c.view==='command'?<CommandFixture/>:c.view==='eid'?<EidPopup/>:c.view==='review'?<FinancialReview/>:c.view==='proxies'?<Proxies/>:c.view==='activeOperations'?<ActiveOperations/>:c.view==='createManager'?<ManagerCreate/>:c.view==='ownership'?<Ownership isOpen user={{id:'test',username:'synthetic',currentOwner:{type:'ADMIN',id:'synthetic-old-owner',ownershipToken:'synthetic-token',agentAssignment:null}}} onClose={()=>window.panelClosed=(window.panelClosed||0)+1} onSuccess={()=>window.saved=true}/>:c.view==='creditControl'?<CreditFixture/>:c.view==='transferAgent'?<TransferAgent isOpen user={{id:'synthetic-user',username:'synthetic',ownershipToken:'synthetic-token'}} onClose={()=>window.panelClosed=(window.panelClosed||0)+1} onSuccess={()=>window.saved=true}/>:c.view==='resetPassword'?<ResetPassword isOpen scope={c.resetScope||'admin'} user={{id:'test',username:'synthetic'}} onClose={()=>window.panelClosed=(window.panelClosed||0)+1} onSuccess={()=>window.saved=true}/>:c.view==='installments'?<Installments/>:c.view==='integrity'?<IntegrityReport/>:c.view==='analytics'?<Analytics/>:c.view==='activityReport'?<ActivityReport/>:c.view==='balanceMonitor'?<BalanceMonitor/>:c.view==='loginMonitor'?<LoginMonitor/>:c.view==='logs'?<Logs/>:c.view==='agents'?<Agents/>:c.view==='adminCredit'?<AdminCredit/>:c.view==='requestCredit'?<RequestCredit/>:c.view==='agentDashboard'?<AgentDashboard/>:c.view==='permissions'?<Permissions/>:c.view==='foundation'?<><Table id='default-table'><TableHeader><TableRow><TableHead>Default</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Default value</TableCell></TableRow></TableBody></Table>{[1,2].map(n=><Table panel key={n} id={'panel-table-'+n}><TableHeader><TableRow><TableHead>Panel</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Panel value</TableCell></TableRow></TableBody></Table>)}<PanelTablePagination page={1} total={0} onPageChange={()=>{}}/></>:c.view==='export'?<ExportTable cardNumber='0000000000' contracts={[{type:'Package',status:'Active',package:'Synthetic package with a long descriptive name',startDate:'01/01/2026',expiryDate:'01/01/2027',invoiceNo:'SYNTHETIC-001'}]}/>:c.view==='contracts'?<Contracts contracts={[{type:'Package',status:'Active',package:'Synthetic package with a long descriptive name',startDate:'01/01/2026',expiryDate:'01/01/2027',invoiceNo:'SYNTHETIC-001'}]} expiryDate='01/01/2027'/>:c.view==='balance'?<AddBalance isOpen userId='test' username='synthetic' onClose={()=>window.panelClosed=(window.panelClosed||0)+1} onSuccess={()=>window.saved=true}/>:c.view==='managerBalance'?<ManagerBalance isOpen userId='test' username='synthetic' managerBalance={10} onClose={()=>window.panelClosed=(window.panelClosed||0)+1} onSuccess={()=>window.saved=true}/>:c.view==='create'?<CreateUser isOpen onClose={()=>window.panelClosed=(window.panelClosed||0)+1} onSuccess={()=>window.saved=true}/>:c.view==='stats'?<StatsFixture/>:c.view==='inactive'?<InactiveFixture/>:c.view==='dialogFocus'?<DialogLauncher/>:c.view==='adminDeleted'?<AdminDeleted/>:c.view==='managerDeleted'?<ManagerDeleted/>:c.view==='creditReport'?<CreditReport/>:c.view==='pointsReport'?<PointsReport/>:c.view==='spendReport'?<SpendReport/>:c.view==='balanceReport'?<BalanceReport/>:c.view==='admin'?<AdminUsers/>:c.view==='history'?<HistoryPage/>:c.view==='manager'?<ManagerUsers managerBalance={1} onBalanceChange={()=>{}}/>:c.view==='edit'?<EditUser isOpen user={{id:'test',username:'synthetic-user',email:'audit@example.invalid',isActive:true}} onClose={()=>window.panelClosed=(window.panelClosed||0)+1} onSuccess={()=>window.saved=true}/>:c.view==='bein'?<BeinAccounts/>:c.view==='transactions'?<Transactions/>:<Operations operations={[{id:'test',type:'RENEW',cardNumber:'0000000000',amount:1,status:'COMPLETED',createdAt:'2026-09-08T00:00:00Z',responseMessage:'Synthetic result'}]} page={2} total={11} totalPages={2} sortConfig={{key:'date',direction:'desc'}} onSortChange={()=>{}} onPageChange={()=>{}}/>}</Shell>);
