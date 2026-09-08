import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    canonicalizeProviderAccountUsername,
    normalizeProviderAccountCredentialUsername,
} from '@/lib/provider-account-identity'

const root = resolve(process.cwd())

test('provider identity comparison is canonical while the login credential preserves case', () => {
    assert.equal(canonicalizeProviderAccountUsername('  Dealer.User@BeIN.TEST  '), 'dealer.user@bein.test')
    assert.equal(
        canonicalizeProviderAccountUsername('Dealer.User@BeIN.TEST'),
        canonicalizeProviderAccountUsername(' dealer.user@bein.test '),
    )
    assert.equal(
        normalizeProviderAccountCredentialUsername('  Dealer.User@BeIN.TEST  '),
        'Dealer.User@BeIN.TEST',
    )
    assert.equal(normalizeProviderAccountCredentialUsername('   '), '')
})

test('all provider account creation paths preserve the trimmed credential and compare case-insensitively', () => {
    for (const path of [
        'src/app/api/admin/bein-accounts/route.ts',
        'src/app/api/admin/seed-pool-settings/route.ts',
        'scripts/seed-pool-settings.ts',
    ]) {
        const source = readFileSync(resolve(root, path), 'utf8')
        assert.match(source, /normalizeProviderAccountCredentialUsername/)
        assert.match(source, /username:\s*credentialUsername/)
        assert.match(source, /mode:\s*['"]insensitive['"]/)
    }
})

test('ordered migration fails on aliases and enforces canonical uniqueness without rewriting credentials', () => {
    const migration = readFileSync(
        resolve(root, 'prisma/migrations/20260824150000_canonical_bein_account_identity/migration.sql'),
        'utf8',
    )

    assert.match(migration, /GROUP BY lower\(btrim\("username"\)\)/)
    assert.match(migration, /HAVING count\(\*\) > 1/)
    assert.match(migration, /CREATE UNIQUE INDEX "bein_accounts_username_canonical_key"/)
    assert.doesNotMatch(migration, /UPDATE "bein_accounts"/)
    assert.doesNotMatch(migration, /bein_accounts_username_canonical"\s+CHECK/)
})
