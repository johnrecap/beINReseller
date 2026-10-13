import { PGlite } from '@electric-sql/pglite'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// A transport-only pg bridge: actual Prisma SQL and transactions execute against
// a fresh in-memory PostgreSQL engine. It has no socket or database URL. PGlite
// has one connection; this checks atomic replay, not native multi-process locks.
export async function openPglitePrisma(options: { adjudicationSchema?: 'legacy' | 'current' } = {}) {
    const engine = new PGlite()
    const ddl = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff',
        '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    await engine.exec(ddl)
    await engine.exec('ALTER TABLE operations DROP COLUMN renewal_cooldown_until')
    await engine.exec(readFileSync('prisma/migrations/20261012120000_renewal_card_cooldown/migration.sql', 'utf8'))
    // Schema diff omits custom migration CHECKs/triggers. Execute their original
    // published SQL so review tests cannot silently use a weaker audit table.
    const reviewSql = readFileSync('prisma/migrations/20260907110000_audit_refund_review_effects/migration.sql', 'utf8')
    const reviewChecks = reviewSql.split('\n').filter(line => line.startsWith('ALTER TABLE "operation_review_adjudications" ADD CONSTRAINT "operation_review_adjudications_check_'))
    if (reviewChecks.length !== 2) throw new Error('MISSING_ORIGINAL_ADJUDICATION_CHECKS')
    await engine.exec(reviewChecks.join('\n'))
    const immutableFunction = reviewSql.match(/CREATE FUNCTION audit_immutable_evidence\(\)[\s\S]*?\$\$;/)?.[0]
    const immutableTrigger = reviewSql.match(/CREATE TRIGGER audit_immutable_adjudication[\s\S]*?;/)?.[0]
    if (!immutableFunction || !immutableTrigger) throw new Error('MISSING_ORIGINAL_ADJUDICATION_TRIGGER')
    await engine.exec(`${immutableFunction}\n${immutableTrigger}`)
    if (options.adjudicationSchema !== 'legacy') await engine.exec(readFileSync('prisma/migrations/20261013200000_admin_card_release_adjudication/migration.sql', 'utf8'))
    let tail = Promise.resolve()
    const acquire = async () => {
        const previous = tail
        let unlock!: () => void
        tail = new Promise<void>(resolve => { unlock = resolve })
        await previous
        return unlock
    }
    const query = async (config: string | { text: string; values?: unknown[] }, values?: unknown[]) => {
        const result = await engine.query<Record<string, unknown>>(typeof config === 'string' ? config : config.text,
            (typeof config === 'string' ? values : config.values) || [], {
                // Match PrismaPg's timestamp parser: the schema uses UTC stored
                // in timestamp-without-time-zone, not this machine's local zone.
                parsers: { 1114: text => `${text.replace(' ', 'T')}+00:00` },
            })
        return { fields: result.fields, rowCount: result.affectedRows ?? result.rows.length,
            rows: result.rows.map(row => result.fields.map(field => {
                const value = row[field.name]
                if (value instanceof Date) return value.toISOString()
                if (typeof value === 'bigint') return value.toString()
                if ([114, 3802].includes(field.dataTypeID) && value !== null) return JSON.stringify(value)
                return value
            })) }
    }
    const pool = new pg.Pool()
    pool.query = (async (config: Parameters<typeof query>[0], values?: unknown[]) => {
        const unlock = await acquire()
        try { return await query(config, values) } finally { unlock() }
    }) as typeof pool.query
    pool.connect = (async () => {
        const unlock = await acquire()
        return Object.assign(new EventEmitter(), { query, release: unlock })
    }) as typeof pool.connect
    const db = new PrismaClient({ adapter: new PrismaPg(pool) })
    return { db, engine, close: async () => { await db.$disconnect(); await pool.end(); await engine.close() } }
}
