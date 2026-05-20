import { decideCancellationSafety } from '../src/lib/cancellation-safety'

type Scenario = {
    name: string
    status: Parameters<typeof decideCancellationSafety>[0]
    expectedAction: ReturnType<typeof decideCancellationSafety>['action']
    expectedRefundCreated: boolean
}

const scenarios: Scenario[] = [
    {
        name: 'cancel before final Pay',
        status: 'AWAITING_FINAL_CONFIRM',
        expectedAction: 'cancel',
        expectedRefundCreated: true,
    },
    {
        name: 'cancel while final Pay is completing',
        status: 'COMPLETING',
        expectedAction: 'review',
        expectedRefundCreated: false,
    },
    {
        name: 'cancel after completed',
        status: 'COMPLETED',
        expectedAction: 'reject',
        expectedRefundCreated: false,
    },
    {
        name: 'duplicate cancellation after prior refund',
        status: 'CANCELLED',
        expectedAction: 'reject',
        expectedRefundCreated: false,
    },
]

let passed = 0

for (const scenario of scenarios) {
    const decision = decideCancellationSafety(scenario.status)
    const refundCreated = decision.action === 'cancel' && scenario.status !== 'CANCELLED'

    if (decision.action !== scenario.expectedAction || refundCreated !== scenario.expectedRefundCreated) {
        throw new Error(
            `${scenario.name} failed: action=${decision.action}, refundCreated=${refundCreated}`
        )
    }

    passed += 1
}

console.log(`Cancellation safety simulations passed: ${passed}/${scenarios.length}`)
