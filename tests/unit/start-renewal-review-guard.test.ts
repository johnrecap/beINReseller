import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('start renewal blocks cards with unresolved review operations', () => {
    const source = readFileSync(
        join(process.cwd(), 'src', 'lib', 'operations', 'renewal-creation-guard.ts'),
        'utf8'
    )

    assert.match(source, /status: 'REVIEW_REQUIRED'/)
    assert.match(source, /UNRESOLVED_REVIEW/)
    assert.match(source, /pg_advisory_xact_lock/)
})

test('central renewal creation guard blocks open fulfillment safety issues', () => {
    const source = readFileSync(
        join(process.cwd(), 'src', 'lib', 'operations', 'renewal-creation-guard.ts'),
        'utf8'
    )

    assert.match(source, /PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED/)
    assert.match(source, /FULFILLMENT_PROOF_CONFLICT/)
    assert.match(source, /DUPLICATE_RENEWAL_CHARGE_BURST/)
    assert.match(source, /RENEWAL_FULFILLMENT_REVIEW_PENDING/)
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
