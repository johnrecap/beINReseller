import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Source-only release preflight. Never connects to a database or provider. */
export function inspectAuditRelease(root = process.cwd()) {
    const reasons: string[] = []
    const migrationRoot = join(root, 'prisma/migrations')
    const migrations = readdirSync(migrationRoot, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name)
    const incompleteMigrations = migrations.filter(name => {
        const file = join(migrationRoot, name, 'migration.sql')
        return !existsSync(file) || readFileSync(file, 'utf8').replace(/--[^\n]*/g, '').trim().length === 0
    })
    if (incompleteMigrations.length) reasons.push('MIGRATION_PROVENANCE_INCOMPLETE')
    const normalize = (file: string) => readFileSync(join(root, file), 'utf8').replaceAll('\r\n', '\n')
    const schemaParity = normalize('prisma/schema.prisma') === normalize('worker/prisma/schema.prisma')
    if (!schemaParity) reasons.push('PRISMA_SCHEMA_MISMATCH')
    const dirty = execFileSync('git', ['status', '--porcelain=v1', '-uall'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
    if (dirty) reasons.push('RELEASE_TREE_NOT_COMMITTED')
    const count = process.env.PANEL_WORKER_COUNT
    if (!count || !/^[1-9]\d*$/.test(count) || Number(count) > 32) reasons.push('PANEL_PROCESS_COUNT_NOT_DECLARED')
    // Local source checks cannot attest deployed topology, in-flight work,
    // historical data or authenticated provider execution.
    reasons.push('LIVE_RELEASE_EVIDENCE_NOT_VERIFIED')
    return { scope: 'LOCAL_SOURCE_ONLY', decision: 'BLOCKED', schemaParity, migrationCount: migrations.length,
        incompleteMigrations, uncommittedPathCount: dirty ? dirty.split('\n').length : 0,
        declaredPanelWorkerCount: count && /^[1-9]\d*$/.test(count) && Number(count) <= 32 ? Number(count) : null,
        reasons, databaseConnected: false, providerConnected: false }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    void (async () => {
        const source = inspectAuditRelease()
        if (process.argv.includes('--database')) {
            if (!process.argv.includes('--confirm-read-only')) throw new Error('EXPLICIT_READ_ONLY_DATABASE_SCOPE_REQUIRED')
            const [{ default: prisma }, { inspectPanelReviewCompatibility }] = await Promise.all([
                import('../src/lib/prisma'), import('../src/lib/financial-review/preflight'),
            ])
            try { console.log(JSON.stringify({ ...source, databaseConnected: true, compatibility: await inspectPanelReviewCompatibility(prisma) }, null, 2)) }
            finally { await prisma.$disconnect() }
        } else console.log(JSON.stringify(source, null, 2))
        process.exitCode = 2 // BLOCKED is truthful; local checks cannot attest live readiness.
    })().catch(() => { console.error('AUDIT_PREFLIGHT_FAILED'); process.exitCode = 1 })
}
