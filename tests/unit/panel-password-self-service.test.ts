import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluatePermission } from '@/lib/permissions/evaluator'
import { PERMISSION_CATALOG_BY_KEY, PERMISSION_KEYS } from '@/lib/permissions/catalog'

function sourceFile(...segments: string[]) {
    return readFileSync(join(process.cwd(), ...segments), 'utf8')
}

test('panel change-password route allows every panel role to change only its own password', () => {
    const source = sourceFile('src', 'app', 'api', 'user', 'change-password', 'route.ts')

    assert.match(source, /requireAuthAPI\(request\)/)
    assert.doesNotMatch(source, /getMobileUserFromRequest|await auth\(\)/)
    assert.match(source, /where:\s*\{\s*id:\s*authUser\.id\s*\}/)
    assert.match(source, /where:\s*\{\s*id:\s*user\.id\s*\}/)
    assert.match(source, /compare\(currentPassword, user\.passwordHash\)/)
    assert.doesNotMatch(source, /body\.userId|targetUserId|params/)
})

test('admin manager and agent reset routes delegate to one protected request handler', () => {
    const adminRoute = sourceFile('src', 'app', 'api', 'admin', 'users', '[id]', 'reset-password', 'route.ts')
    const managerRoute = sourceFile('src', 'app', 'api', 'manager', 'users', '[id]', 'reset-password', 'route.ts')
    const agentRoute = sourceFile('src', 'app', 'api', 'agent', 'users', '[id]', 'reset-password', 'route.ts')
    const handler = sourceFile('src', 'lib', 'users', 'password-reset-route.ts')

    for (const [role, source] of [
        ['ADMIN', adminRoute],
        ['MANAGER', managerRoute],
        ['AGENT', agentRoute],
    ] as const) {
        assert.match(source, new RegExp("'" + role + "'"))
        assert.match(source, /respondToPasswordResetRequest/)
        assert.doesNotMatch(source, /prisma\.user\.update|passwordHash|hash\(/)
    }

    assert.match(handler, /USERS_RESET_PASSWORD/)
    assert.match(handler, /resetUserPassword/)
    assert.match(handler, /password-reset:/)
    assert.doesNotMatch(handler, /prisma\.user\.update|passwordHash|hash\(/)
})

test('admin manager and agent user tables use the shared reset-password dialog', () => {
    const adminTable = sourceFile('src', 'components', 'admin', 'users', 'UsersTable.tsx')
    const managerTable = sourceFile('src', 'components', 'manager', 'users', 'ManagerUsersTable.tsx')
    const agentTable = sourceFile('src', 'components', 'agent', 'AgentDashboardClient.tsx')

    for (const source of [adminTable, managerTable, agentTable]) {
        assert.match(source, /ResetPasswordDialog/)
        assert.match(source, /canResetPasswords/)
    }
})

test('profile page shows self-service password form for all panel accounts', () => {
    const profilePage = sourceFile('src', 'components', 'profile', 'ProfilePageClient.tsx')

    assert.match(profilePage, /<ChangePasswordForm \/>/)
    assert.doesNotMatch(profilePage, /isAdmin|user\.role === 'ADMIN'/)
})

test('panel user APIs use the database-backed dual session guard', () => {
    const routes = [
        ['activity', 'route.ts'],
        ['activity', 'history', 'route.ts'],
        ['change-password', 'route.ts'],
        ['profile', 'route.ts'],
        ['recent-operations', 'route.ts'],
        ['stats', 'route.ts'],
    ]

    for (const route of routes) {
        const source = sourceFile('src', 'app', 'api', 'user', ...route)
        assert.match(source, /requireAuthAPI\(request\)/)
        assert.doesNotMatch(source, /getMobileUserFromRequest|await auth\(\)/)
    }
})

test('reset-password permission defaults to supervisors and still honors overrides', () => {
    const resetPermission = PERMISSION_CATALOG_BY_KEY.get(PERMISSION_KEYS.USERS_RESET_PASSWORD)

    assert.deepEqual(resetPermission?.defaultRoles, ['ADMIN', 'MANAGER', 'AGENT'])
    assert.doesNotMatch(resetPermission?.description ?? '', /deprecated/i)

    for (const role of ['ADMIN', 'MANAGER', 'AGENT'] as const) {
        assert.equal(evaluatePermission({
            user: { id: `${role.toLowerCase()}-1`, role, isActive: true, deletedAt: null },
            permissionKey: PERMISSION_KEYS.USERS_RESET_PASSWORD,
        }).allowed, true)

        assert.equal(evaluatePermission({
            user: { id: `${role.toLowerCase()}-1`, role, isActive: true, deletedAt: null },
            permissionKey: PERMISSION_KEYS.USERS_RESET_PASSWORD,
            userOverrides: [{
                userId: `${role.toLowerCase()}-1`,
                permissionKey: PERMISSION_KEYS.USERS_RESET_PASSWORD,
                effect: 'deny',
            }],
        }).allowed, false)
    }

    assert.equal(evaluatePermission({
        user: { id: 'user-1', role: 'USER', isActive: true, deletedAt: null },
        permissionKey: PERMISSION_KEYS.USERS_RESET_PASSWORD,
    }).allowed, false)
})

test('login forgot-password guidance has no public reset link or username reset form', () => {
    const source = sourceFile('src', 'components', 'auth', 'LoginForm.tsx')

    assert.match(source, /forgotPasswordContactSupervisor/)
    assert.doesNotMatch(source, /href="#"/)
})
