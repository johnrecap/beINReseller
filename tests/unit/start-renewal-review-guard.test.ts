import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('start renewal admission no longer queries unresolved reviews', () => {
    const source = readFileSync(
        join(process.cwd(), 'src', 'lib', 'operations', 'renewal-creation-guard.ts'),
        'utf8'
    )

    assert.doesNotMatch(source, /status: 'REVIEW_REQUIRED'/)
    assert.doesNotMatch(source, /UNRESOLVED_REVIEW/)
    assert.match(source, /pg_advisory_xact_lock/)
})

test('card admission has no financial issue predicates', () => {
    const source = readFileSync(
        join(process.cwd(), 'src', 'lib', 'operations', 'renewal-creation-guard.ts'),
        'utf8'
    )

    assert.doesNotMatch(source, /PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED/)
    assert.doesNotMatch(source, /FULFILLMENT_PROOF_CONFLICT/)
    assert.doesNotMatch(source, /DUPLICATE_RENEWAL_CHARGE_BURST/)
    assert.doesNotMatch(source, /RENEWAL_FULFILLMENT_REVIEW_PENDING/)
})

test('start renewal atomically acquires the durable card lifecycle reservation before dispatch', () => {
    const source = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'operations', 'start-renewal', 'route.ts'),
        'utf8'
    )

    const transactionStart = source.indexOf('const operation = await prisma.$transaction')
    const reservation = source.indexOf('createGuardedRenewalOperation(tx', transactionStart)
    const dispatch = source.indexOf('createOperationDispatch(tx', transactionStart)

    assert.ok(transactionStart >= 0)
    assert.ok(reservation > transactionStart)
    assert.ok(dispatch > reservation)
    assert.match(source, /renewalCreationBlockedPayload/)
})
