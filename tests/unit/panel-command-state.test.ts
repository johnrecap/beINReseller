import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PanelCommandState, type CommandStorage } from '../../src/lib/panel-command-state'

function storage(): CommandStorage & { values: Map<string, string> } {
    const values = new Map<string, string>()
    return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) } }
}

test('claims the complete sorted resource set atomically; independent commands proceed', () => {
    const state = new PanelCommandState('actor-a', storage())
    const first = state.claim('transfer', ['user/b', 'user/a'], 'attempt-1')
    assert.deepEqual(first.resources, ['user/a', 'user/b'])
    assert.throws(() => state.claim('edit', ['user/c', 'user/b'], 'attempt-2'), /COMMAND_CONFLICT/)
    assert.equal(state.claim('edit', ['user/c'], 'attempt-3').state, 'PENDING')
    assert.throws(() => state.claim('edit', ['user/a'], 'attempt-1'), /COMMAND_CONFLICT/)
})

test('a pending tombstone becomes uncertain on reload and is never replayed or expired', () => {
    const persisted = storage()
    const state = new PanelCommandState('actor-a', persisted)
    state.claim('balance', ['user/a'], 'attempt-1')
    const restored = new PanelCommandState('actor-a', persisted)
    assert.equal(restored.snapshot()[0].state, 'UNCERTAIN')
    assert.throws(() => restored.claim('balance', ['user/a'], 'attempt-2'), /COMMAND_CONFLICT/)
    assert.equal(new PanelCommandState('actor-b', persisted).snapshot().length, 0)
    assert.equal(new PanelCommandState('actor-a', persisted).snapshot()[0].state, 'UNCERTAIN')
})

test('failed persistence refuses dispatch and leaves no partial in-memory claim', () => {
    const state = new PanelCommandState('actor-a', { getItem: () => null, setItem: () => { throw new Error('quota') } })
    assert.throws(() => state.claim('balance', ['user/a'], 'attempt-1'), /COMMAND_STORAGE_UNAVAILABLE/)
    assert.deepEqual(state.snapshot(), [])
})

test('settlement requires the exact immutable attempt and unknown outcomes retain their claim', () => {
    const persisted = storage()
    const state = new PanelCommandState('actor-a', persisted)
    const attempt = state.claim('balance', ['user/a'], 'attempt-1')
    assert.throws(() => { (attempt.resources as string[]).push('user/b') })
    assert.equal(state.settle('stale-attempt', 'SUCCEEDED'), false)
    state.settle('attempt-1', 'UNCERTAIN')
    assert.throws(() => state.claim('balance', ['user/a'], 'attempt-2'), /COMMAND_CONFLICT/)
    assert.equal(state.settle('attempt-1', 'SUCCEEDED'), false, 'late generic callbacks cannot clear uncertainty')
    assert.equal(state.snapshot()[0].state, 'UNCERTAIN')
    assert.deepEqual(Object.keys(JSON.parse([...persisted.values.values()][0])[0]).sort(), ['action', 'actor', 'attempt', 'resources', 'startedAt', 'state'])
})

test('known terminal outcomes free resources and clear only their own tombstone', () => {
    const persisted = storage()
    const state = new PanelCommandState('actor-a', persisted)
    state.claim('edit', ['user/a'], 'attempt-1')
    state.claim('edit', ['user/b'], 'attempt-2')
    assert.equal(state.settle('attempt-1', 'FAILED'), true)
    assert.equal(state.claim('edit', ['user/a'], 'attempt-3').state, 'PENDING')
    assert.equal(new PanelCommandState('actor-a', persisted).snapshot().length, 2)
})

test('corrupt storage fails closed, never silently loses an unresolved financial request', () => {
    assert.throws(() => new PanelCommandState('actor-a', { getItem: () => '{bad', setItem: () => {} }), /COMMAND_STORAGE_UNAVAILABLE/)
})

test('only settled receipts can be dismissed; a new command does not erase an unseen result', () => {
    const state = new PanelCommandState('actor-a', storage())
    state.claim('balance', ['user/a'], 'a')
    state.dismissSettled('a')
    assert.equal(state.snapshot().length, 1)
    state.settle('a', 'UNCERTAIN')
    state.dismissSettled('a')
    assert.equal(state.snapshot().length, 1)
    state.claim('edit', ['user/b'], 'b')
    state.settle('b', 'SUCCEEDED')
    state.claim('edit', ['user/c'], 'c')
    assert.equal(state.snapshot().length, 3)
    state.dismissSettled('b')
    assert.deepEqual(state.snapshot().map(r => r.attempt), ['a', 'c'])
})
