import test from 'node:test';
import assert from 'node:assert/strict';
import type { Contract } from '../src/http/types';
import type { SoldReportSafeRow } from '../src/http/sold-packages-report';
import { correlateRenewalFulfillment } from '../src/lib/renewal-fulfillment-correlation';

const targetCardNumber = '7517687161';
const oldInvoiceNo = '052999999';
const newInvoiceNo = '053000123';

function reportRow(overrides: Partial<SoldReportSafeRow> = {}): SoldReportSafeRow {
    return {
        invoiceNo: newInvoiceNo,
        cardNumber: targetCardNumber,
        itemType: 'Card_CISCO',
        packageName: 'Add Premium 12 Months',
        contractStartDate: '24/08/2026',
        contractExpiryDate: '23/08/2027',
        providerAmount: '174',
        currency: 'USD',
        rowFingerprint: 'a'.repeat(64),
        ...overrides,
    };
}

function contract(overrides: Partial<Contract> = {}): Contract {
    return {
        type: 'Purchase',
        status: 'Active',
        package: 'Add Premium 12 Months',
        startDate: '24/08/2026',
        expiryDate: '23/08/2027',
        invoiceNo: newInvoiceNo,
        ...overrides,
    };
}

function correlationInput(overrides: Record<string, unknown> = {}) {
    return {
        baseline: {
            outcome: 'COMPLETE' as const,
            invoiceNos: [oldInvoiceNo],
            dealerContextHash: 'dealer-context-a',
            capturedAt: '2026-08-23T21:29:00.000Z',
        },
        postReport: {
            outcome: 'COMPLETE' as const,
            rows: [reportRow()],
            dealerContextHash: 'dealer-context-a',
            observedAt: '2026-08-23T21:31:00.000Z',
        },
        contractCheck: {
            outcome: 'COMPLETE' as const,
            contracts: [contract()],
            observedAt: '2026-08-23T21:31:05.000Z',
        },
        target: {
            cardNumber: targetCardNumber,
            itemType: 'Card_CISCO',
            selectedPackageName: 'Renewal Premium 12 Months (12 Months)',
            providerAmount: '174.0000',
            currency: 'USD',
            finalMutationStartedAt: '2026-08-23T21:30:00.000Z',
        },
        ...overrides,
    };
}

test('one new exact report row and same-invoice active contract is matched', () => {
    const input = correlationInput();
    input.contractCheck.contracts = [
        contract({ invoiceNo: oldInvoiceNo }),
        contract(),
    ];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'MATCHED');
    assert.equal(result.discoveredInvoiceNo, newInvoiceNo);
    assert.equal(result.matchedContract?.invoiceNo, newInvoiceNo);
    assert.equal(result.reportRow?.rowFingerprint, 'a'.repeat(64));
});

test('same-day invoice already present in baseline is not attributed to this operation', () => {
    const input = correlationInput({
        baseline: {
            outcome: 'COMPLETE',
            invoiceNos: [oldInvoiceNo, newInvoiceNo],
            dealerContextHash: 'dealer-context-a',
            capturedAt: '2026-08-23T21:29:00.000Z',
        },
    });

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'VALID_NO_MATCH');
    assert.equal(result.discoveredInvoiceNo, null);
});

test('two exact new invoices are a proof conflict', () => {
    const secondInvoiceNo = '053000124';
    const input = correlationInput();
    input.postReport.rows = [
        reportRow(),
        reportRow({ invoiceNo: secondInvoiceNo, rowFingerprint: 'b'.repeat(64) }),
    ];
    input.contractCheck.contracts = [
        contract(),
        contract({ invoiceNo: secondInvoiceNo }),
    ];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'PROOF_CONFLICT');
    assert.equal(result.reasonCode, 'MULTIPLE_MATCHING_INVOICES');
});

test('unrelated account-wide sale during the exclusive window is a proof conflict', () => {
    const input = correlationInput();
    input.postReport.rows = [
        reportRow(),
        reportRow({
            invoiceNo: '053000777',
            cardNumber: '7000000777',
            packageName: 'Add Premium 3 Months',
            providerAmount: '54',
            rowFingerprint: 'c'.repeat(64),
        }),
    ];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'PROOF_CONFLICT');
    assert.equal(result.reasonCode, 'UNEXPECTED_ACCOUNT_ACTIVITY');
});

test('dealer context change between baseline and report is a proof conflict', () => {
    const input = correlationInput();
    input.postReport.dealerContextHash = 'different-dealer-context';

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'PROOF_CONFLICT');
    assert.equal(result.reasonCode, 'DEALER_CONTEXT_CHANGED');
});

for (const scenario of [
    {
        name: 'card differs by a leading zero',
        row: reportRow({ cardNumber: `0${targetCardNumber}` }),
    },
    {
        name: 'duration differs',
        row: reportRow({ packageName: 'Add Premium 6 Months' }),
    },
    {
        name: 'promotion differs',
        row: reportRow({ packageName: 'Add Premium 12 Months Save 25%' }),
    },
    {
        name: 'Decimal amount differs beyond trailing zeroes',
        row: reportRow({ providerAmount: '174.0001' }),
    },
    {
        name: 'Cairo calendar date differs',
        row: reportRow({ contractStartDate: '23/08/2026' }),
    },
    {
        name: 'item type differs',
        row: reportRow({ itemType: 'STB' }),
    },
] as const) {
    test(`${scenario.name} cannot be normalized into a match`, () => {
        const input = correlationInput();
        input.postReport.rows = [scenario.row];

        const result = correlateRenewalFulfillment(input);

        assert.equal(result.outcome, 'PROOF_CONFLICT');
    });
}

test('Decimal comparison remains exact beyond JavaScript safe integer precision', () => {
    const input = correlationInput();
    input.target.providerAmount = '9007199254740993.0100';
    input.postReport.rows = [reportRow({ providerAmount: '9007199254740993.01' })];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'MATCHED');
});

test('blank new invoice cannot become automatic proof', () => {
    const input = correlationInput();
    input.postReport.rows = [reportRow({ invoiceNo: '' })];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'PROOF_CONFLICT');
    assert.equal(result.reasonCode, 'BLANK_INVOICE');
});

test('matching report row without the same-invoice active contract is report-only', () => {
    const input = correlationInput();
    input.contractCheck.contracts = [contract({ invoiceNo: '053000999' })];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'REPORT_ONLY');
    assert.equal(result.discoveredInvoiceNo, newInvoiceNo);
});

test('two active contracts with the discovered invoice are a proof conflict', () => {
    const input = correlationInput();
    input.contractCheck.contracts = [contract(), contract()];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'PROOF_CONFLICT');
    assert.equal(result.reasonCode, 'MULTIPLE_MATCHING_CONTRACTS');
});

test('matching contract without a new report invoice is contract-only', () => {
    const input = correlationInput();
    input.postReport.rows = [];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'CONTRACT_ONLY');
    assert.equal(result.matchedContract?.invoiceNo, newInvoiceNo);
});

test('same numeric-looking invoice without the leading zero is not the same invoice', () => {
    const input = correlationInput();
    input.contractCheck.contracts = [contract({ invoiceNo: '53000123' })];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'REPORT_ONLY');
});

test('inactive same-invoice contract is report-only', () => {
    const input = correlationInput();
    input.contractCheck.contracts = [contract({ status: 'Expired' })];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'REPORT_ONLY');
});

for (const status of ['Not Active', 'Non Active']) {
    test(`${status} same-invoice contract is not accepted as active`, () => {
        const input = correlationInput();
        input.contractCheck.contracts = [contract({ status })];

        const result = correlateRenewalFulfillment(input);

        assert.equal(result.outcome, 'REPORT_ONLY');
        assert.equal(result.reasonCode, 'REPORT_WITHOUT_ACTIVE_CONTRACT');
    });
}

test('package names without one explicit duration cannot establish automatic proof', () => {
    const input = correlationInput();
    input.target.selectedPackageName = 'Renewal Premium';
    input.postReport.rows = [reportRow({ packageName: 'Add Premium' })];
    input.contractCheck.contracts = [contract({ package: 'Add Premium' })];

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'PROOF_CONFLICT');
    assert.equal(result.reasonCode, 'NEW_REPORT_ROW_MISMATCH');
});

for (const scenario of [
    {
        name: 'different package on the same invoice',
        contract: contract({ package: 'Add Premium 6 Months' }),
    },
    {
        name: 'different start date on the same invoice',
        contract: contract({ startDate: '23/08/2026' }),
    },
] as const) {
    test(`${scenario.name} is not composite fulfillment proof`, () => {
        const input = correlationInput();
        input.contractCheck.contracts = [scenario.contract];

        const result = correlateRenewalFulfillment(input);

        assert.equal(result.outcome, 'REPORT_ONLY');
        assert.equal(result.reasonCode, 'REPORT_WITHOUT_ACTIVE_CONTRACT');
    });
}

for (const scenario of [
    {
        name: 'incomplete post-report scan',
        postReportOutcome: 'INCOMPLETE_SCAN',
        expectedOutcome: 'INCOMPLETE_SCAN',
    },
    {
        name: 'failed post-report check',
        postReportOutcome: 'CHECK_FAILED',
        expectedOutcome: 'CHECK_FAILED',
    },
] as const) {
    test(`${scenario.name} cannot establish absence or fulfillment`, () => {
        const input = correlationInput({
            postReport: {
                outcome: scenario.postReportOutcome,
                rows: [],
                dealerContextHash: 'dealer-context-a',
                observedAt: '2026-08-23T21:31:00.000Z',
            },
        });

        const result = correlateRenewalFulfillment(input);

        assert.equal(result.outcome, scenario.expectedOutcome);
    });
}

test('incomplete baseline cannot be upgraded by later report and contract matches', () => {
    const input = correlationInput({
        baseline: {
            outcome: 'INCOMPLETE_SCAN',
            invoiceNos: [],
            dealerContextHash: 'dealer-context-a',
            capturedAt: '2026-08-23T21:29:00.000Z',
        },
    });

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'INCOMPLETE_SCAN');
});

test('failed contract check cannot turn a report row into report-only absence', () => {
    const input = correlationInput({
        contractCheck: {
            outcome: 'CHECK_FAILED',
            contracts: [],
            observedAt: '2026-08-23T21:31:05.000Z',
        },
    });

    const result = correlateRenewalFulfillment(input);

    assert.equal(result.outcome, 'CHECK_FAILED');
});
