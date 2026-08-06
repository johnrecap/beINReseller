import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOwnershipTransferRequest } from '../../src/lib/users/ownership-transfer-request'
import { ar } from '../../src/i18n/translations/ar'
import { bn } from '../../src/i18n/translations/bn'
import { en } from '../../src/i18n/translations/en'

const base = {
    userId: 'user-1',
    targetOwnerType: 'AGENT' as const,
    targetOwnerId: 'agent-1',
    expectedOwnershipToken: 'ow1.current',
    reason: '',
    sourceGroup: 'main-group',
    whatsappGroupUrl: 'https://chat.whatsapp.com/example',
}

test('untouched agent metadata is omitted so the server resolves preserve/default semantics', () => {
    const request = buildOwnershipTransferRequest({
        ...base,
        sourceGroupTouched: false,
        whatsappGroupUrlTouched: false,
    })

    assert.equal(Object.hasOwn(request, 'sourceGroup'), false)
    assert.equal(Object.hasOwn(request, 'whatsappGroupUrl'), false)
})

test('explicit clearing remains present as empty text for independent server normalization', () => {
    const request = buildOwnershipTransferRequest({
        ...base,
        sourceGroup: '',
        whatsappGroupUrl: '',
        sourceGroupTouched: true,
        whatsappGroupUrlTouched: true,
    })

    assert.equal(Object.hasOwn(request, 'sourceGroup'), true)
    assert.equal(request.sourceGroup, '')
    assert.equal(Object.hasOwn(request, 'whatsappGroupUrl'), true)
    assert.equal(request.whatsappGroupUrl, '')
})

test('non-agent targets never send assignment metadata', () => {
    const request = buildOwnershipTransferRequest({
        ...base,
        targetOwnerType: 'MANAGER',
        targetOwnerId: 'manager-1',
        sourceGroupTouched: true,
        whatsappGroupUrlTouched: true,
    })

    assert.equal(Object.hasOwn(request, 'sourceGroup'), false)
    assert.equal(Object.hasOwn(request, 'whatsappGroupUrl'), false)
})

test('ownership transfer dialog copy has matching AR EN and BN keys', () => {
    const keys = [
        'transferOwner',
        'targetType',
        'targetOwner',
        'selectOwner',
        'noTransferTargets',
        'sourceGroupLabel',
        'whatsappGroupLinkLabel',
        'transferReason',
        'transferAction',
        'loadTransferTargetsFailed',
        'transferOwnershipFailed',
        'invalidWhatsappGroupLink',
        'openLink',
    ] as const

    for (const key of keys) {
        assert.ok(en.common[key].trim())
        assert.ok(ar.common[key].trim())
        assert.ok(bn.common[key].trim())
    }

    assert.notEqual(ar.common.transferOwner, en.common.transferOwner)
    assert.notEqual(bn.common.transferOwner, en.common.transferOwner)
})
