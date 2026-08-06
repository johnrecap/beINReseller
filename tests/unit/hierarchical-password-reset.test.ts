import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    decidePasswordResetAuthorization,
    type PasswordResetAuthorizationInput,
} from '@/lib/users/password-reset'

function input(overrides: Partial<PasswordResetAuthorizationInput> = {}): PasswordResetAuthorizationInput {
    return {
        actor: {
            id: 'actor-1',
            role: 'ADMIN',
            isActive: true,
            deletedAt: null,
        },
        target: {
            id: 'target-1',
            role: 'USER',
            isActive: true,
            deletedAt: null,
        },
        managerIds: [],
        activeAgentIds: [],
        ...overrides,
    }
}

test('admin can reset active manager, agent, and user but not self or admin', () => {
    for (const role of ['MANAGER', 'AGENT', 'USER'] as const) {
        assert.deepEqual(decidePasswordResetAuthorization(input({
            target: { id: 'target-' + role, role, isActive: true, deletedAt: null },
        })), {
            allowed: true,
            ownershipKind: 'ADMIN',
        })
    }

    assert.deepEqual(decidePasswordResetAuthorization(input({
        target: { id: 'admin-2', role: 'ADMIN', isActive: true, deletedAt: null },
    })), {
        allowed: false,
        code: 'PASSWORD_RESET_NOT_ALLOWED',
    })

    assert.deepEqual(decidePasswordResetAuthorization(input({
        target: { id: 'actor-1', role: 'USER', isActive: true, deletedAt: null },
    })), {
        allowed: false,
        code: 'PASSWORD_RESET_NOT_ALLOWED',
    })
})

test('manager can reset only one directly managed active user', () => {
    const managerActor = {
        id: 'manager-1',
        role: 'MANAGER' as const,
        isActive: true,
        deletedAt: null,
    }

    assert.deepEqual(decidePasswordResetAuthorization(input({
        actor: managerActor,
        managerIds: ['manager-1'],
    })), {
        allowed: true,
        ownershipKind: 'MANAGER',
    })

    for (const managerIds of [[], ['manager-2'], ['manager-1', 'manager-2']]) {
        assert.deepEqual(decidePasswordResetAuthorization(input({
            actor: managerActor,
            managerIds,
        })), {
            allowed: false,
            code: 'OWNERSHIP_CONFLICT',
        })
    }
})

test('agent can reset only one currently assigned active user', () => {
    const agentActor = {
        id: 'agent-1',
        role: 'AGENT' as const,
        isActive: true,
        deletedAt: null,
    }

    assert.deepEqual(decidePasswordResetAuthorization(input({
        actor: agentActor,
        activeAgentIds: ['agent-1'],
    })), {
        allowed: true,
        ownershipKind: 'AGENT',
    })

    for (const activeAgentIds of [[], ['agent-2'], ['agent-1', 'agent-2']]) {
        assert.deepEqual(decidePasswordResetAuthorization(input({
            actor: agentActor,
            activeAgentIds,
        })), {
            allowed: false,
            code: 'OWNERSHIP_CONFLICT',
        })
    }
})

test('dirty mixed ownership, invalid roles, and inactive accounts fail closed', () => {
    assert.deepEqual(decidePasswordResetAuthorization(input({
        actor: { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null },
        managerIds: ['manager-1'],
        activeAgentIds: ['agent-1'],
    })), {
        allowed: false,
        code: 'OWNERSHIP_CONFLICT',
    })

    assert.deepEqual(decidePasswordResetAuthorization(input({
        actor: { id: 'agent-1', role: 'AGENT', isActive: true, deletedAt: null },
        target: { id: 'manager-1', role: 'MANAGER', isActive: true, deletedAt: null },
        activeAgentIds: ['agent-1'],
    })), {
        allowed: false,
        code: 'PASSWORD_RESET_NOT_ALLOWED',
    })

    assert.deepEqual(decidePasswordResetAuthorization(input({
        actor: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
    })), {
        allowed: false,
        code: 'PASSWORD_RESET_NOT_ALLOWED',
    })

    assert.deepEqual(decidePasswordResetAuthorization(input({
        target: { id: 'target-1', role: 'USER', isActive: false, deletedAt: null },
    })), {
        allowed: false,
        code: 'TARGET_USER_NOT_FOUND',
    })

    assert.deepEqual(decidePasswordResetAuthorization(input({
        actor: { id: 'admin-1', role: 'ADMIN', isActive: false, deletedAt: null },
    })), {
        allowed: false,
        code: 'PERMISSION_DENIED',
    })

    assert.deepEqual(decidePasswordResetAuthorization(input({
        target: {
            id: 'target-1',
            role: 'USER',
            isActive: true,
            deletedAt: new Date(),
        },
    })), {
        allowed: false,
        code: 'TARGET_USER_NOT_FOUND',
    })

    assert.deepEqual(decidePasswordResetAuthorization(input({
        actor: {
            id: 'admin-1',
            role: 'ADMIN',
            isActive: true,
            deletedAt: new Date(),
        },
    })), {
        allowed: false,
        code: 'PERMISSION_DENIED',
    })
})

test('audit payload and success response do not expose password material', () => {
    const serviceSource = readFileSync(
        join(process.cwd(), 'src', 'lib', 'users', 'password-reset.ts'),
        'utf8'
    )
    const routeSource = readFileSync(
        join(process.cwd(), 'src', 'lib', 'users', 'password-reset-route.ts'),
        'utf8'
    )
    const auditStart = serviceSource.indexOf('tx.activityLog.create')
    const auditEnd = serviceSource.indexOf('return {', auditStart)
    const auditPayload = serviceSource.slice(auditStart, auditEnd)

    assert.ok(auditStart >= 0 && auditEnd > auditStart)
    assert.doesNotMatch(auditPayload, /newPassword|passwordHash/)
    assert.match(routeSource, /\{ success: true, code: result\.code \}/)
    assert.doesNotMatch(routeSource, /password:\s*result|newPassword:\s*result|passwordHash:\s*result/)
})
