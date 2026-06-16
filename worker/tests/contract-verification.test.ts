import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRenewalContractVerification,
    findMatchingRenewalContract,
    RENEWAL_CONTRACT_VERIFICATION_ATTEMPTS,
    RENEWAL_CONTRACT_VERIFICATION_DELAY_MS,
} from '../src/lib/contract-verification';
import type { Contract } from '../src/http/types';

const selectedPackageName = 'Add Summer Offer 2: World Cup Package + 3 Month PREMIUM (Full Payment)';

function contract(overrides: Partial<Contract> = {}): Contract {
    return {
        type: 'AddonEvent',
        status: 'Active',
        package: 'Add Summer Offer 2: World Cup Package+ 3 Month PREMIUM',
        startDate: '16/06/2026',
        expiryDate: '15/09/2026',
        invoiceNo: '52742068',
        ...overrides,
    };
}

test('matches an active same-day beIN contract for the selected package', () => {
    const matched = findMatchingRenewalContract({
        contracts: [contract()],
        selectedPackageName,
        referenceDate: new Date('2026-06-16T02:00:00.000Z'),
    });

    assert.equal(matched?.invoiceNo, '52742068');
});

test('does not use an old active contract as post-Pay proof', () => {
    const matched = findMatchingRenewalContract({
        contracts: [contract({ startDate: '15/06/2026' })],
        selectedPackageName,
        referenceDate: new Date('2026-06-16T02:00:00.000Z'),
    });

    assert.equal(matched, null);
});

test('builds a contract verified outcome with invoice evidence', () => {
    const verification = buildRenewalContractVerification({
        contracts: [contract()],
        selectedPackageName,
        operationCreatedAt: new Date('2026-06-16T01:59:00.000Z'),
        responseData: { finalPayRequestStartedAt: '2026-06-16T02:00:00.000Z' },
        checkedAt: new Date('2026-06-16T02:00:15.000Z'),
    });

    assert.equal(verification.outcome, 'CONTRACT_VERIFIED_SUCCESS');
    assert.equal(verification.matchedContract?.invoiceNo, '52742068');
    assert.equal(verification.contractCount, 1);
});

test('returns no match when package text does not match', () => {
    const verification = buildRenewalContractVerification({
        contracts: [contract({ package: 'Premium 3 Months' })],
        selectedPackageName,
        operationCreatedAt: new Date('2026-06-16T01:59:00.000Z'),
    });

    assert.equal(verification.outcome, 'NO_MATCHING_CONTRACT');
    assert.equal(verification.matchedContract, null);
});

test('keeps post-Pay contract verification at three attempts with three-second spacing', () => {
    assert.equal(RENEWAL_CONTRACT_VERIFICATION_ATTEMPTS, 3);
    assert.equal(RENEWAL_CONTRACT_VERIFICATION_DELAY_MS, 3000);
});
