/**
 * Prisma Client Singleton for Worker
 * 
 * Uses the same adapter pattern as the main Panel application
 * to ensure compatibility with Prisma v7.
 * 
 * Pool Configuration:
 * - max: 10 connections per worker (prevents exhaustion)
 * - idleTimeoutMillis: 30s (cleanup idle connections)
 * - connectionTimeoutMillis: 10s (fail fast on connection issues)
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Validate DATABASE_URL exists
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required')
}

// Pool configuration from environment or defaults
const POOL_MAX = parseInt(process.env.DB_POOL_MAX || '10')
const POOL_IDLE_TIMEOUT = parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000')
const POOL_CONNECTION_TIMEOUT = parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '10000')

// Create PostgreSQL pool with limits
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: POOL_MAX,                              // Max connections per worker
    idleTimeoutMillis: POOL_IDLE_TIMEOUT,       // Close idle connections after 30s
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT,  // Fail fast on connection issues
})

// Log pool configuration
console.log(`[DB] Pool configured: max=${POOL_MAX}, idleTimeout=${POOL_IDLE_TIMEOUT}ms, connectionTimeout=${POOL_CONNECTION_TIMEOUT}ms`)

// Handle pool errors gracefully
pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message)
})

pool.on('connect', () => {
    console.log('[DB] New client connected to pool')
})

// Create Prisma adapter
const adapter = new PrismaPg(pool)

// Create Prisma client with adapter
export const prisma = new PrismaClient({ adapter })

export default prisma
