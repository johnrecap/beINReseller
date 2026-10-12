/* eslint-disable @typescript-eslint/no-require-imports -- Shared by the CommonJS CI runner and its tests. */
const { readdirSync } = require('node:fs');
const suites = directory => readdirSync(directory).filter(name => name.endsWith('.test.ts')).sort().map(name => `${directory}/${name}`);
module.exports = {
  unit: () => suites('tests/unit'),
  worker: () => suites('worker/tests'),
  database: () => [
    'audit-financial-model-db', 'audit-remediation-compatibility-db', 'audit-connected-financial-regression-db',
    'card-lifecycle-reservation-db', 'provider-account-reservation-db', 'renewal-fulfillment-proof-db',
    'renewal-baseline-capture-db',
    'renewal-fulfillment-finalization-db', 'renewal-fulfillment-finalization-claim-guard-db',
    'pre-mutation-renewal-finalization-db', 'renewal-fulfillment-reconciliation-db',
    'installment-settlement-db', 'latest-verification-settlement-db', 'promo-dispatch-revision-db',
    'renewal-payment-refund-finalization-db', 'operation-auth-revocation-db',
    'dispatch-recovery-all-types-db', 'dispatch-redis-replay-db', 'legacy-review-adjudication-db',
    'completion-effects-db', 'renewal-readiness-db', 'operation-spend-award-run', 'user-ownership-transfer-concurrency',
  ].map(name => `tests/integration/${name}.test.ts`),
};
