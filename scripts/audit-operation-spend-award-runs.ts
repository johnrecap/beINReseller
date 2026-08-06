import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { parseOperationSpendAuditArgs } from '../shared/points/operation-spend-release-commands'
import {
    buildOperationSpendReleasePreflight,
    type OperationSpendReleasePreflightDb,
} from '../shared/points/operation-spend-release-preflight'

async function main() {
    const parsed = parseOperationSpendAuditArgs(process.argv.slice(2))
    if (!parsed.ok) throw new Error(parsed.code)
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED')

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

    try {
        const preflight = await buildOperationSpendReleasePreflight({
            db: prisma as unknown as OperationSpendReleasePreflightDb,
            now: new Date(),
            sampleLimit: parsed.limit,
        })
        console.log(JSON.stringify(preflight))
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
