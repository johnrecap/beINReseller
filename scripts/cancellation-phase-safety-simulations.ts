import { decideOperationCancellationSafety } from '../src/lib/operation-safety'

type ExpectedAction = 'cancel' | 'review' | 'reject'
type OperationStatus =
    | 'PENDING'
    | 'PROCESSING'
    | 'AWAITING_CAPTCHA'
    | 'AWAITING_PACKAGE'
    | 'AWAITING_FINAL_CONFIRM'
    | 'COMPLETING'
    | 'REVIEW_REQUIRED'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'

interface CancellationPhaseCase {
    name: string
    status: OperationStatus
    phase:
    | 'PACKAGE_PREPARATION'
    | 'CANCELLATION_CONFIRM'
    | 'FINAL_PAY_SUBMITTED'
    | 'LEGACY_UNKNOWN'
    | null
    amount: number
    expected: ExpectedAction
}

const cases: CancellationPhaseCase[] = [
    {
        name: 'package preparation COMPLETING must remain safely cancellable',
        status: 'COMPLETING',
        phase: 'PACKAGE_PREPARATION',
        amount: 0,
        expected: 'cancel',
    },
    {
        name: 'cancel-confirm COMPLETING before Pay must remain cancellation path',
        status: 'COMPLETING',
        phase: 'CANCELLATION_CONFIRM',
        amount: 0,
        expected: 'cancel',
    },
    {
        name: 'final Pay submitted COMPLETING must require review',
        status: 'COMPLETING',
        phase: 'FINAL_PAY_SUBMITTED',
        amount: 100,
        expected: 'review',
    },
    {
        name: 'terminal completed operation must be rejected/no-op',
        status: 'COMPLETED',
        phase: null,
        amount: 100,
        expected: 'reject',
    },
    {
        name: 'legacy unknown pre-final status remains cancellable',
        status: 'AWAITING_FINAL_CONFIRM',
        phase: 'LEGACY_UNKNOWN',
        amount: 0,
        expected: 'cancel',
    },
]

let failed = 0

for (const testCase of cases) {
    const phaseEvidence = testCase.phase && testCase.phase !== 'LEGACY_UNKNOWN'
        ? { phase: testCase.phase }
        : null
    const decision = decideOperationCancellationSafety({
        operationStatus: testCase.status,
        operationAmount: testCase.amount,
        phaseEvidence,
        operationResponseData: phaseEvidence,
    })

    if (decision.action !== testCase.expected) {
        failed++
        console.error(
            `FAIL: ${testCase.name}: expected ${testCase.expected}, got ${decision.action}`
        )
    } else {
        console.log(`PASS: ${testCase.name}`)
    }
}

if (failed > 0) {
    console.error(`Cancellation phase safety simulations failed: ${failed}/${cases.length}`)
    process.exit(1)
}

console.log(`Cancellation phase safety simulations passed: ${cases.length}/${cases.length}`)
