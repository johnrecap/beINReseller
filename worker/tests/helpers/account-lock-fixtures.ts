export const LOCK_NOW = new Date('2026-06-01T10:00:00.000Z')

export function lockOwner(overrides: {
    workerId?: string
    operationId?: string
    acquiredAt?: string
} = {}) {
    return JSON.stringify({
        workerId: overrides.workerId ?? 'worker-a',
        operationId: overrides.operationId ?? 'operation-1',
        acquiredAt: overrides.acquiredAt ?? LOCK_NOW.toISOString(),
    })
}

export const staleLockOwner = lockOwner({
    workerId: 'worker-a',
    operationId: 'operation-stale',
    acquiredAt: '2026-06-01T09:50:00.000Z',
})
