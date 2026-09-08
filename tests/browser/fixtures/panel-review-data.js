// Synthetic panel review DTOs. These never constitute provider or financial proof.
export function reviewData(query, config) {
    const q = query.get('q') || 'Synthetic review';
    return {
        summary: {total:1,needsDecision:1,followUp:0,refunded:0,beinExecuted:0,financiallyImpactedTotal:90},
        items: config.reviewEmpty ? [] : [{
            id:'synthetic-review-operation',type:'RENEW',cardNumber:'0000000000',amount:90,
            status:'REVIEW_REQUIRED',createdAt:'2026-09-08T00:00:00Z',updatedAt:'2026-09-08T00:00:00Z',
            user:{id:'synthetic-user',username:q,kind:'reseller'},customer:null,beinAccount:{id:'synthetic-bein',username:'synthetic-account',label:'Synthetic account'},
            state:'needs_decision',stateLabel:'Synthetic review state',packageName:'Synthetic package',packagePrice:90,
            capabilities:{classification:config.reviewLegacy?'LEGACY_RENEWAL':'PRE_MUTATION',allowedActions:['RESOLVE_PRE_MUTATION','KEEP_UNDER_REVIEW','REFUND_CUSTOMER','BEIN_EXECUTED_NO_REFUND'],blockedReasonCodes:[]},
            evidence:{operationId:'synthetic-review-operation',reason:'Synthetic evidence for UI only',reasonCode:null,refundBlocked:false,
                responseMessage:null,userDeductTotal:90,userBalanceBefore:100,userBalanceAfter:10,beinBalanceBefore:null,beinBalanceAfter:null,beinDelta:null,
                beinUsername:'synthetic-account',beinAccountId:'synthetic-bein',beinAccountLabel:'Synthetic account',beinDebitConfirmed:false,beinDebitAmount:null,
                beinDebitSource:'none',beinLedgerId:null,beinEvidenceConfidence:null,providerEvidenceState:'incomplete-evidence',providerEvidenceLabel:'Synthetic unconfirmed evidence',
                legacyStoredBeinDebitAmount:null,differenceAmount:null,manualVerification:null,selectedPackageName:'Synthetic package',selectedPackagePrice:90,capturedAt:null,
                hasUserDeduction:true,hasCustomerWalletDebit:false,hasRefund:false,financiallyImpacted:true,fulfillmentVerified:false,fulfillmentProofId:null,
                fulfillmentAuthority:'NONE',manualEvidenceId:null},review:{},manualFulfillmentEvidence:null,
        }],
    };
}
