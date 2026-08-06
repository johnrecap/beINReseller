import 'dotenv/config'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { parseOperationSpendCutoverArgs } from '../shared/points/operation-spend-release-commands'
import {
    buildOperationSpendReleasePreflight,
    OPERATION_SPEND_RELEASE_SAMPLE_LIMIT,
    type OperationSpendReleasePreflight,
    type OperationSpendReleasePreflightDb,
} from '../shared/points/operation-spend-release-preflight'

function assertReleasePreflightReady(preflight: OperationSpendReleasePreflight) {
    if (preflight.activation.ready) return
    throw new Error(JSON.stringify({
        code: 'OPERATION_SPEND_RELEASE_PREFLIGHT_BLOCKED',
        preflight,
    }))
}

async function main() {
    const parsed = parseOperationSpendCutoverArgs(process.argv.slice(2))
    if (!parsed.ok) {
        throw new Error(parsed.code)
    }
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL_REQUIRED')
    }

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

    try {
        const initialPreflight = await buildOperationSpendReleasePreflight({
            db: prisma as unknown as OperationSpendReleasePreflightDb,
            now: new Date(),
            sampleLimit: OPERATION_SPEND_RELEASE_SAMPLE_LIMIT,
        })
        if (!parsed.activate) {
            console.log(JSON.stringify({
                mode: 'DRY_RUN',
                wouldActivate: !initialPreflight.cutoverAt && initialPreflight.activation.ready,
                preflight: initialPreflight,
            }))
            return
        }
        assertReleasePreflightReady(initialPreflight)

        const result = await prisma.$transaction(async (tx) => {
            await tx.pointProgramSettings.upsert({
                where: { id: 'default' },
                create: { id: 'default' },
                update: {},
                select: { id: true },
            })
            await tx.$queryRaw(Prisma.sql`
                SELECT "id"
                FROM "point_program_settings"
                WHERE "id" = 'default'
                FOR UPDATE
            `)

            const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`
                SELECT CURRENT_TIMESTAMP AS "now"
            `)
            if (!clock?.now) throw new Error('DATABASE_CLOCK_UNAVAILABLE')

            const lockedPreflight = await buildOperationSpendReleasePreflight({
                db: tx as unknown as OperationSpendReleasePreflightDb,
                now: clock.now,
                sampleLimit: OPERATION_SPEND_RELEASE_SAMPLE_LIMIT,
            })
            assertReleasePreflightReady(lockedPreflight)
            if (lockedPreflight.cutoverAt) {
                return {
                    activated: false,
                    cutoverAt: new Date(lockedPreflight.cutoverAt),
                    preflight: lockedPreflight,
                }
            }

            await tx.pointProgramSettings.update({
                where: { id: 'default' },
                data: { operationSpendSnapshotCutoverAt: clock.now },
            })
            return { activated: true, cutoverAt: clock.now, preflight: lockedPreflight }
        })

        console.log(JSON.stringify({
            mode: 'ACTIVATE',
            confirmedRelease: parsed.confirmedRelease,
            activated: result.activated,
            cutoverAt: result.cutoverAt.toISOString(),
            preflight: result.preflight,
        }))
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
