/**
 * Prisma Client Singleton for Worker
 * 
 * Uses the same adapter pattern as the main Panel application
 * to ensure compatibility with Prisma v7.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Validate DATABASE_URL exists
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required')
}

// Create PostgreSQL pool
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
})

// Create Prisma adapter
const adapter = new PrismaPg(pool)

// Create Prisma client with adapter
export const prisma = new PrismaClient({ adapter })

export default prisma
