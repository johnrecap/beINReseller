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

    for (const role of ['ADMIN', 'MANAGER', 'AGENT', 'USER']) {
        assert.match(source, new RegExp(`'${role}'`))
    }

    assert.doesNotMatch(source, /authUser\.role !== 'ADMIN'/)
    assert.match(source, /where:\s*\{\s*id:\s*authUser\.id\s*\}/)
    assert.match(source, /where:\s*\{\s*id:\s*user\.id\s*\}/)
    assert.match(source, /compare\(currentPassword, user\.passwordHash\)/)
    assert.doesNotMatch(source, /body\.userId|targetUserId|params/)
})

test('admin and manager reset-password routes are closed without password mutation', () => {
    const adminRoute = sourceFile('src', 'app', 'api', 'admin', 'users', '[id]', 'reset-password', 'route.ts')
    const managerRoute = sourceFile('src', 'app', 'api', 'manager', 'users', '[id]', 'reset-password', 'route.ts')

    for (const source of [adminRoute, managerRoute]) {
        assert.match(source, /Users must change their own password from profile\./)
        assert.match(source, /status:\s*403/)
        assert.doesNotMatch(source, /prisma\.user\.update|passwordHash|newPassword|hash\(/)
    }
})

test('admin and manager user tables no longer expose reset-password controls', () => {
    const adminTable = sourceFile('src', 'components', 'admin', 'users', 'UsersTable.tsx')
    const managerTable = sourceFile('src', 'components', 'manager', 'users', 'ManagerUsersTable.tsx')

    for (const source of [adminTable, managerTable]) {
        assert.doesNotMatch(source, /ResetPasswordDialog|ManagerResetPasswordDialog|setResetUser|resetUser|resetPassword/)
    }
})

test('profile page shows self-service password form for all panel accounts', () => {
    const profilePage = sourceFile('src', 'components', 'profile', 'ProfilePageClient.tsx')

    assert.match(profilePage, /<ChangePasswordForm \/>/)
    assert.doesNotMatch(profilePage, /isAdmin|user\.role === 'ADMIN'/)
})

test('reset-password catalog permission is deprecated with no default roles', () => {
    const resetPermission = PERMISSION_CATALOG_BY_KEY.get(PERMISSION_KEYS.USERS_RESET_PASSWORD)

    assert.deepEqual(resetPermission?.defaultRoles, [])
    assert.match(resetPermission?.description ?? '', /must change their own password/)

    for (const role of ['ADMIN', 'MANAGER'] as const) {
        assert.equal(evaluatePermission({
            user: { id: `${role.toLowerCase()}-1`, role, isActive: true, deletedAt: null },
            permissionKey: PERMISSION_KEYS.USERS_RESET_PASSWORD,
        }).allowed, false)
    }
})
