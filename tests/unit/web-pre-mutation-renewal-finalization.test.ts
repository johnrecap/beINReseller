import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = process.cwd()

function source(path: string): string {
    return readFileSync(resolve(repositoryRoot, path), 'utf8')
}

test('web cancellation delegates renewals to one atomic pre-mutation finalizer', () => {
    const route = source('src/app/api/operations/[id]/cancel/route.ts')

    assert.match(route, /finalizeWebPreMutationRenewalTermination/)
    assert.match(route, /operation\.type\s*===\s*['"]RENEW['"]/)
    assert.match(route, /terminalStatus:\s*['"]CANCELLED['"]/)
})

test('cleanup cron delegates stale renewals to the atomic finalizer', () => {
    const route = source('src/app/api/cron/cleanup-stuck-operations/route.ts')

    assert.match(route, /finalizeWebPreMutationRenewalTermination/)
    assert.match(route, /operation\.type\s*===\s*['"]RENEW['"]/)
    assert.match(route, /terminalStatus:\s*['"]EXPIRED['"]/)
    assert.match(route, /expectedStaleHeartbeat:\s*\{/)
    assert.match(route, /checkedAt:\s*now/)
    assert.match(route, /noHeartbeatBefore:\s*graceTime/)
})

test('explicit renewal unload delegates to the atomic finalizer', () => {
    const route = source('src/app/api/operations/[id]/heartbeat/route.ts')

    assert.match(route, /finalizeWebPreMutationRenewalTermination/)
    assert.match(route, /operation\.type\s*===\s*['"]RENEW['"]/)
    assert.match(route, /terminalStatus:\s*['"]EXPIRED['"]/)
})

test('expired installment confirmation delegates to the atomic finalizer', () => {
    const route = source('src/app/api/operations/[id]/confirm-installment/route.ts')

    assert.match(route, /finalizeWebPreMutationRenewalTermination/)
    assert.match(route, /terminalStatus:\s*['"]FAILED['"]/)
})

test('web finalizer locks evidence and commits money, terminal state, and reservations together', () => {
    const finalizer = source('src/lib/operations/pre-mutation-renewal-finalization.ts')

    assert.match(finalizer, /lockFinancialOperation\(tx, input\.operationId\)/)
    assert.match(source('shared/operations/financial-lock.ts'), /SELECT "id" FROM "operations"[\s\S]*?FOR UPDATE/)
    assert.match(finalizer, /['"]OPERATION_DEDUCT['"]/)
    assert.match(finalizer, /walletTransaction\.findMany/)
    assert.match(finalizer, /type:\s*['"]REFUND['"]/)
    assert.match(finalizer, /cardLifecycleReservation\.updateMany/)
    assert.match(finalizer, /providerAccountCausalReservation\.updateMany/)
    assert.match(finalizer, /operationDispatch\.updateMany/)
    assert.match(finalizer, /status:\s*['"]REVIEW_REQUIRED['"]/)
    assert.match(finalizer, /expectedStaleHeartbeat/)
    assert.match(finalizer, /HEARTBEAT_NO_LONGER_STALE/)
    assert.match(finalizer, /finalProviderMutationStartedAt/)
    assert.match(finalizer, /finalPayRequestStartedAt/)
    assert.match(finalizer, /finalPaySubmittedAt/)
    assert.match(finalizer, /fulfillmentState\s*!==\s*['"]UNVERIFIED['"]/)
})
