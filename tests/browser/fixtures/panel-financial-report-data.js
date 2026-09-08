// Deterministic, synthetic report DTOs. Never import into application code.
export function balanceMovementData(url, count = 2) {
 const q = new URL(String(url), 'http://audit.invalid').searchParams;
 const date = '2026-09-08T00:00:00Z';
 const actor = {id:'synthetic-admin',username:'synthetic-admin',email:'admin@example.invalid',role:'ADMIN'};
 const owner = {type:'ADMIN',id:actor.id,label:actor.username,isLegacyFallback:false,hasConflict:false};
 const recipient = {id:'synthetic-recipient',username:'synthetic-recipient',email:'recipient@example.invalid',role:'USER',currentOwner:owner};
 const rows = Array.from({length:count},(_,i)=>({id:'synthetic-'+i,amount:25.5,balanceAfter:100+25.5*(i+1),type:'DEPOSIT',notes:'Synthetic note + & '+i+' — retained export content',createdAt:date,createdAtCairoDate:'2026-09-08',source:{key:'ADMIN_TOP_UP',label:'Admin top-up'},bucket:{key:'ADMIN_TO_USERS',label:'Admin to users'},recipient,actor}));
 return {
  filters:{page:Number(q.get('page')||1),limit:25,range:q.get('range')||'month',fromInput:'2026-09-01',toInput:'2026-09-08',recipientRole:'ALL',recipientId:'',actorRole:'ALL',actorId:'',ownerType:'',ownerId:'',userSearch:q.get('userSearch')||'',exportAll:q.get('export')==='all'},
  summary:{totalAmount:25.5*count,movementCount:count,recipientsCount:count?1:0,actorsCount:count?1:0,averageAmount:count?25.5:0,lastMovementAt:count?date:null,adminToManagersAmount:0,adminToManagersCount:0,adminToUsersAmount:25.5*count,adminToUsersCount:count,managerToUsersAmount:0,managerToUsersCount:0,systemAmount:0,systemCount:0},
  rows,lookups:{managers:[],adminOwners:[actor],agents:[],users:[recipient]},pagination:{page:1,limit:25,total:count,totalPages:1},exportLimit:1000,
 };
}

export function financialReportData(url, config) {
 if(!config.financialReports)return null;
 const u=new URL(String(url),'http://audit.invalid');const q=u.searchParams;
 const count=config.financialEmpty?0:config.financialMany?25:2;
 const base=balanceMovementData(url,count);
 if(u.pathname==='/api/admin/reports/balance-movements')return base;
 const date='2026-09-08T00:00:00Z';
 if(u.pathname==='/api/admin/reports/credit-payments')return {
  filters:{...base.filters,from:date,to:date,recordedBySearch:q.get('recordedBySearch')||''},
  summary:{totalPaidUsd:25.5*count,paymentCount:count,usersCount:count?1:0,recordersCount:count?1:0},
  daily:count?[{date:'2026-09-08',totalPaidUsd:25.5*count,paymentCount:count}]:[],
  rows:base.rows.map(row=>({id:row.id,amountUsd:row.amount,debtAfterUsd:200-row.amount,ownerTypeSnapshot:'ADMIN',ownerIdSnapshot:row.actor.id,ownerLabelSnapshot:row.actor.username,note:row.notes,createdAt:date,createdAtCairoDate:'2026-09-08',user:row.recipient,recordedBy:row.actor})),pagination:base.pagination,
 };
 if(u.pathname.startsWith('/api/admin/reports/points-analysis')) {
  const owner={id:'synthetic-owner',username:'synthetic-owner',email:'points@example.invalid',role:'USER',isActive:true,deleted:false,balance:100};
  const summary={earnedPoints:10*count,availablePoints:10*count,convertedPoints:0,convertedBalanceAmount:0,reversedPoints:0,pendingPoints:0,cancelledPoints:0,legacyPoints:0,ownersCount:count?1:0,ledgerEntriesCount:count};
  return {owner,summary,rows:base.rows.map(row=>({ledgerEntryId:row.id,createdAt:date,createdAtDisplay:'2026-09-08',owner,sourceType:'OPERATION',sourceLabel:'Synthetic source',status:'AVAILABLE',points:10,direction:'earn',conversionState:'available',amountUsdSnapshot:25.5,ratePerThousandSnapshot:100,moneyValue:null,operationRef:{id:'synthetic-operation',cardNumber:'0000000000',status:'COMPLETED'},redemptionRef:null,transactionRef:null,notes:row.notes})),pagination:base.pagination,settings:{pointsEnabled:true,conversionEnabled:true,conversionPoints:100,conversionAmount:1,currencyLabel:'USD'}};
 }
 if(u.pathname==='/api/admin/reports/bein-spend')return {totals:{confirmedSpend:25.5*count,confirmedOperationCount:count,unconfirmedReviewCount:0,currency:'USD'},accounts:count?[{beinAccountId:'synthetic-bein',beinUsernameSnapshot:'synthetic-bein',beinLabelSnapshot:'Synthetic account',confirmedSpend:25.5*count,confirmedOperationCount:count,unconfirmedReviewCount:0,lastChargedAt:date}]:[]};
 if(u.pathname==='/api/admin/reports/bein-spend/operations')return {items:base.rows.map(row=>({ledgerId:row.id,operationId:row.id,chargedAt:date,panelUserId:row.recipient.id,panelUsername:row.recipient.username,beinAccountId:'synthetic-bein',beinUsernameSnapshot:'synthetic-bein',beinLabelSnapshot:'Synthetic account',operationType:'RENEW',cardNumber:q.get('cardNumber')||'0000000000',selectedPackageName:'Synthetic package',dealerBalanceBefore:100,dealerBalanceAfter:74.5,spendAmount:25.5,evidenceSource:'BALANCE_DELTA',operationStatusAtRecord:'COMPLETED'})),page:Number(q.get('page')||1),pageSize:25,total:count};
 return null;
}
